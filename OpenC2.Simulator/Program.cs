using System.Buffers.Binary;
using System.Net.Sockets;
using System.Net.Http;
using System.Text.Json;
using OpenC2.Transport;
using ProtoBuf;

var host = args.Length > 0 ? args[0] : "127.0.0.1";
var port = args.Length > 1 && int.TryParse(args[1], out var parsedPort) ? parsedPort : 5055;

Console.WriteLine($"Connecting simulator feed to {host}:{port}");

using var client = new TcpClient();
await client.ConnectAsync(host, port);
await using var stream = client.GetStream();

var tracks = new List<SimulatedTrackState>
{
    new SimulatedTrackState("trk-2001", "SABLE-21", 39.7478, -104.9842, 120, 11, 34, "Unknown UAS", "Unknown", "Elevated"),
    new SimulatedTrackState("trk-2002", "EMBER-09", 39.7325, -104.9625, 90, 7, 120, "Survey", "Friendly", "Low"),
    new SimulatedTrackState("trk-2003", "NOVA-44", 39.7812, -104.9484, 160, 14, 286, "Uncooperative", "Unknown", "High")
};
var trackSync = new object();
using var weatherSampler = new WeatherSampler();

_ = Task.Run(() => ReceiveAsync(stream, tracks, trackSync));

while (true)
{
    SimulatedTrackState[] currentTracks;
    lock (trackSync)
    {
        currentTracks = tracks.ToArray();
    }

    var byTrackId = currentTracks.ToDictionary(track => track.Id, StringComparer.OrdinalIgnoreCase);
    var situationEvents = new List<SituationEvent>();
    var destroyedTrackIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    var weatherSamples = new Dictionary<string, WeatherSample?>(StringComparer.OrdinalIgnoreCase);

    foreach (var track in currentTracks)
    {
        weatherSamples[track.Id] = await weatherSampler.GetWeatherAsync(track.Latitude, track.Longitude, track.AltitudeMeters, CancellationToken.None);
    }

    foreach (var track in currentTracks)
    {
        if (destroyedTrackIds.Contains(track.Id))
        {
            continue;
        }

        track.Advance(byTrackId, destroyedTrackIds, situationEvents, weatherSamples.GetValueOrDefault(track.Id));
    }

    if (destroyedTrackIds.Count > 0)
    {
        lock (trackSync)
        {
            tracks.RemoveAll(track => destroyedTrackIds.Contains(track.Id));
        }
    }

    var trackedObjects = currentTracks
        .Where(track => !destroyedTrackIds.Contains(track.Id))
        .Select(track => track.ToTrackedObject())
        .ToList();

    if (trackedObjects.Count > 0)
    {
        await SendAsync(stream, new TransportEnvelope
        {
            SituationUpdate = new SituationUpdate
            {
                SourceSystem = "OpenC2.Simulator",
                UpdateId = Guid.NewGuid().ToString("N"),
                GeneratedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                TrackedObjects = trackedObjects
            }
        });

        foreach (var trackedObject in trackedObjects)
        {
            Console.WriteLine($"{DateTime.Now:T} sent {trackedObject.TrackId} {trackedObject.Identity.Callsign} {trackedObject.Position.Latitude:F5},{trackedObject.Position.Longitude:F5}");
        }
    }

    foreach (var situationEvent in situationEvents)
    {
        await SendAsync(stream, new TransportEnvelope { Event = situationEvent });
        Console.WriteLine($"{DateTime.Now:T} event {situationEvent.EventType} {situationEvent.TrackId}->{situationEvent.TargetTrackId}");
    }

    await Task.Delay(TimeSpan.FromSeconds(1));
}

static async Task SendAsync(NetworkStream stream, TransportEnvelope frame)
{
    using var payloadStream = new MemoryStream();
    Serializer.Serialize(payloadStream, frame);

    var payload = payloadStream.ToArray();
    var lengthPrefix = new byte[4];
    BinaryPrimitives.WriteInt32LittleEndian(lengthPrefix, payload.Length);

    await stream.WriteAsync(lengthPrefix);
    await stream.WriteAsync(payload);
    await stream.FlushAsync();
}

static async Task ReceiveAsync(NetworkStream stream, List<SimulatedTrackState> tracks, object trackSync)
{
    var lengthBuffer = new byte[4];

    while (true)
    {
        var bytesRead = await ReadExactlyAsync(stream, lengthBuffer);
        if (bytesRead == 0)
        {
            return;
        }

        var payloadLength = BinaryPrimitives.ReadInt32LittleEndian(lengthBuffer);
        if (payloadLength <= 0 || payloadLength > 1024 * 1024)
        {
            throw new InvalidDataException($"Invalid payload length {payloadLength}.");
        }

        var payload = new byte[payloadLength];
        var payloadBytesRead = await ReadExactlyAsync(stream, payload);
        if (payloadBytesRead != payloadLength)
        {
            throw new EndOfStreamException("The server closed the connection mid-frame.");
        }

        using var payloadStream = new MemoryStream(payload, writable: false);
        var frame = Serializer.Deserialize<TransportEnvelope>(payloadStream);
        var command = frame.Reclassification;
        if (command is not null && !string.IsNullOrWhiteSpace(command.TrackId))
        {
            lock (trackSync)
            {
                var track = tracks.FirstOrDefault(item => item.Id.Equals(command.TrackId, StringComparison.OrdinalIgnoreCase));
                if (track is not null)
                {
                    track.ApplyReclassification(command);
                    Console.WriteLine($"{DateTime.Now:T} applied reclassification {command.TrackId} -> {command.Classification}/{command.Affiliation}");
                }
            }
        }

        var behaviorOrder = frame.BehaviorOrder;
        if (behaviorOrder is not null && !string.IsNullOrWhiteSpace(behaviorOrder.TrackId))
        {
            lock (trackSync)
            {
                var track = tracks.FirstOrDefault(item => item.Id.Equals(behaviorOrder.TrackId, StringComparison.OrdinalIgnoreCase));
                if (track is not null)
                {
                    track.ApplyBehaviorOrder(behaviorOrder);
                    Console.WriteLine($"{DateTime.Now:T} behavior {behaviorOrder.TrackId} -> {behaviorOrder.Behavior}");
                }
            }
        }

        var spawnTrack = frame.SpawnTrack;
        if (spawnTrack is not null && !string.IsNullOrWhiteSpace(spawnTrack.TrackId))
        {
            lock (trackSync)
            {
                var existing = tracks.FirstOrDefault(item => item.Id.Equals(spawnTrack.TrackId, StringComparison.OrdinalIgnoreCase));
                if (existing is not null)
                {
                    tracks.Remove(existing);
                }

                tracks.Add(new SimulatedTrackState(spawnTrack));
            }

            Console.WriteLine($"{DateTime.Now:T} spawned {spawnTrack.TrackId} {spawnTrack.Callsign} at {spawnTrack.Latitude:F5},{spawnTrack.Longitude:F5}");
        }

        lock (trackSync)
        {
            var deleteTrack = frame.DeleteTrack;
            if (deleteTrack is null || string.IsNullOrWhiteSpace(deleteTrack.TrackId))
            {
                continue;
            }

            var existing = tracks.FirstOrDefault(item => item.Id.Equals(deleteTrack.TrackId, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                tracks.Remove(existing);
            }
        }
        Console.WriteLine($"{DateTime.Now:T} deleted {frame.DeleteTrack!.TrackId}");
    }
}

static async Task<int> ReadExactlyAsync(Stream stream, byte[] buffer)
{
    var totalRead = 0;

    while (totalRead < buffer.Length)
    {
        var bytesRead = await stream.ReadAsync(buffer.AsMemory(totalRead, buffer.Length - totalRead));
        if (bytesRead == 0)
        {
            return totalRead;
        }

        totalRead += bytesRead;
    }

    return totalRead;
}

file sealed class SimulatedTrackState
{
    private const double SurfaceLayerAltitudeMeters = 30d;
    private const double MinimumOperationalAltitudeMeters = 30d;
    private readonly Random _random;

    public SimulatedTrackState(
        string id,
        string callsign,
        double latitude,
        double longitude,
        double altitudeMeters,
        double speedMetersPerSecond,
        double headingDegrees,
        string classification,
        string affiliation,
        string alertLevel)
    {
        Id = id;
        Callsign = callsign;
        Latitude = latitude;
        Longitude = longitude;
        AltitudeMeters = altitudeMeters;
        SpeedMetersPerSecond = speedMetersPerSecond;
        HeadingDegrees = headingDegrees;
        Classification = classification;
        Affiliation = affiliation;
        AlertLevel = alertLevel;
        _guardLatitude = latitude;
        _guardLongitude = longitude;
        _desiredLatitude = latitude;
        _desiredLongitude = longitude;
        _random = new Random(id.GetHashCode(StringComparison.Ordinal));
    }

    public SimulatedTrackState(SpawnTrackCommand command)
        : this(
            command.TrackId,
            command.Callsign,
            command.Latitude,
            command.Longitude,
            command.AltitudeMeters,
            command.SpeedMetersPerSecond,
            command.HeadingDegrees,
            command.Classification,
            command.Affiliation,
            command.AlertLevel)
    {
        VehicleType = string.IsNullOrWhiteSpace(command.VehicleType) ? "Quadcopter" : command.VehicleType;
        Status = string.IsNullOrWhiteSpace(command.Status) ? "Tracking" : command.Status;
        Behavior = string.IsNullOrWhiteSpace(command.Behavior) ? "Random" : command.Behavior;
        BatteryMinutes = Math.Max(5, command.BatteryMinutes);
        _guardLatitude = command.Latitude;
        _guardLongitude = command.Longitude;
        _desiredLatitude = command.Latitude;
        _desiredLongitude = command.Longitude;
        _plannedCruiseAltitudeMeters = Math.Max(
            MinimumOperationalAltitudeMeters,
            command.CruiseAltitudeMeters > 0 ? command.CruiseAltitudeMeters : command.AltitudeMeters);
        GroundSpeedMetersPerSecond = Math.Min(SpeedMetersPerSecond, GetCruiseSpeed());
    }

    public string Id { get; }
    public string Callsign { get; }
    public double Latitude { get; private set; }
    public double Longitude { get; private set; }
    public double AltitudeMeters { get; private set; }
    public double SpeedMetersPerSecond { get; private set; }
    public double GroundSpeedMetersPerSecond { get; private set; }
    public double VerticalSpeedMetersPerSecond { get; private set; }
    public double BatteryMinutes { get; private set; } = 28;
    public double HeadingDegrees { get; private set; }
    public string VehicleType { get; private set; } = "Quadcopter";
    public string Classification { get; private set; }
    public string Affiliation { get; private set; }
    public string AlertLevel { get; private set; }
    public string Status { get; private set; } = "Tracking";
    public string Behavior { get; private set; } = "Random";

    private double _guardLatitude;
    private double _guardLongitude;
    private double _desiredLatitude;
    private double _desiredLongitude;
    private string _targetTrackId = string.Empty;
    private double _standoffRadiusMeters = 180;
    private double _plannedCruiseAltitudeMeters;
    private double _effectiveRangeMeters;

    public void Advance(
        IReadOnlyDictionary<string, SimulatedTrackState> tracksById,
        ISet<string> destroyedTrackIds,
        ICollection<SituationEvent> simulatorEvents,
        WeatherSample? weather)
    {
        switch (Behavior)
        {
            case "Guard":
                AdvanceGuard(weather);
                break;
            case "Move To Position":
                AdvanceToPoint(_desiredLatitude, _desiredLongitude, 45, "Move To Position", onArrivalGuard: true, weather);
                break;
            case "Surveil Location":
                AdvanceOrbit(_desiredLatitude, _desiredLongitude, _standoffRadiusMeters, "Surveil Location", weather);
                break;
            case "Surveil Track":
                if (tracksById.TryGetValue(_targetTrackId, out var surveilTarget) && !destroyedTrackIds.Contains(surveilTarget.Id))
                {
                    AdvanceOrbit(surveilTarget.Latitude, surveilTarget.Longitude, _standoffRadiusMeters, $"Surveilling {surveilTarget.Callsign}", weather);
                }
                else
                {
                    SetGuardCurrentPosition();
                }
                break;
            case "Engage Track":
                if (tracksById.TryGetValue(_targetTrackId, out var engageTarget) && !destroyedTrackIds.Contains(engageTarget.Id))
                {
                    AdvanceEngage(engageTarget, destroyedTrackIds, simulatorEvents, weather);
                }
                else
                {
                    SetGuardCurrentPosition();
                }
                break;
            default:
                AdvanceRandom(weather);
                break;
        }

        if (Behavior == "Random")
        {
            VerticalSpeedMetersPerSecond = Math.Clamp((_random.NextDouble() * 2 - 1), -1.5, 1.5);
            AltitudeMeters = Math.Clamp(AltitudeMeters + VerticalSpeedMetersPerSecond, 60, 420);
        }
    }

    private void AdvanceGuard(WeatherSample? weather)
    {
        AdjustAltitudeToPlan();
        Status = "Guard";

        var northErrorMeters = (_guardLatitude - Latitude) * 111320.0;
        var eastErrorMeters = (_guardLongitude - Longitude) * 111320.0 * Math.Cos(((Latitude + _guardLatitude) / 2.0) * Math.PI / 180.0);
        var distanceMeters = Math.Sqrt((northErrorMeters * northErrorMeters) + (eastErrorMeters * eastErrorMeters));

        if (weather is null)
        {
            if (distanceMeters <= 1)
            {
                Latitude = _guardLatitude;
                Longitude = _guardLongitude;
                GroundSpeedMetersPerSecond = 0;
                VerticalSpeedMetersPerSecond = 0;
                return;
            }

            HeadingDegrees = BearingDegrees(Latitude, Longitude, _guardLatitude, _guardLongitude);
            MoveAlongHeading(Math.Min(distanceMeters, GetCruiseSpeed()), null);
            return;
        }

        var maxAirspeed = GetCruiseSpeed();
        if (distanceMeters <= 1)
        {
            MoveWithGroundIntent(0, 0, maxAirspeed, weather);
            return;
        }

        MoveWithGroundIntent(northErrorMeters, eastErrorMeters, maxAirspeed, weather);
    }

    public TrackedObject ToTrackedObject()
    {
        return new TrackedObject
        {
            TrackId = Id,
            Identity = new IdentityData
            {
                Callsign = Callsign,
                Source = "simulator",
                VehicleType = VehicleType,
                Classification = Classification,
                Affiliation = Affiliation,
                Status = Status,
                AlertLevel = AlertLevel,
                ObjectKind = VehicleType.Equals("Ground Vehicle", StringComparison.OrdinalIgnoreCase) ? "GroundVehicle" : "TrackedObject",
                Domain = VehicleType.Equals("Ground Vehicle", StringComparison.OrdinalIgnoreCase) ? "Ground" : "Air"
            },
            Position = new GeoPosition
            {
                Latitude = Latitude,
                Longitude = Longitude,
                AltitudeMeters = AltitudeMeters
            },
            Kinematics = new Kinematics
            {
                AirspeedMetersPerSecond = SpeedMetersPerSecond,
                GroundSpeedMetersPerSecond = GroundSpeedMetersPerSecond,
                VerticalSpeedMetersPerSecond = VerticalSpeedMetersPerSecond,
                HeadingDegrees = HeadingDegrees,
                TrackConfidence = 0.82
            },
            BatteryMinutes = BatteryMinutes,
            LastObservedUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Behavior = Behavior,
            ShortStatus = Status,
            LongStatus = $"{Callsign} {Status} with {AlertLevel.ToLowerInvariant()} alert posture.",
            Command = new CommandIntent
            {
                Behavior = Behavior,
                Latitude = Behavior is "Move To Position" or "Surveil Location" ? _desiredLatitude : _guardLatitude,
                Longitude = Behavior is "Move To Position" or "Surveil Location" ? _desiredLongitude : _guardLongitude,
                TargetTrackId = _targetTrackId,
                RadiusMeters = Behavior is "Surveil Location" or "Surveil Track" ? _standoffRadiusMeters : null,
                CruiseAltitudeMeters = _plannedCruiseAltitudeMeters > 0 ? _plannedCruiseAltitudeMeters : null,
                EffectiveRangeMeters = _effectiveRangeMeters > 0 ? _effectiveRangeMeters : null
            }
        };
    }

    public void ApplyReclassification(TrackReclassificationCommand command)
    {
        if (!string.IsNullOrWhiteSpace(command.VehicleType))
        {
            VehicleType = command.VehicleType;
        }

        if (!string.IsNullOrWhiteSpace(command.Classification))
        {
            Classification = command.Classification;
        }

        if (!string.IsNullOrWhiteSpace(command.Affiliation))
        {
            Affiliation = command.Affiliation;
        }

        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            Status = command.Status;
        }

        if (!string.IsNullOrWhiteSpace(command.AlertLevel))
        {
            AlertLevel = command.AlertLevel;
        }
    }

    public void ApplyBehaviorOrder(TrackBehaviorOrderCommand command)
    {
        Behavior = command.Behavior;
        _targetTrackId = command.TargetTrackId ?? string.Empty;
        _desiredLatitude = command.Latitude;
        _desiredLongitude = command.Longitude;
        _standoffRadiusMeters = Math.Clamp(command.StandoffRadiusMeters, 30, 2000);
        _plannedCruiseAltitudeMeters = Math.Max(
            MinimumOperationalAltitudeMeters,
            command.CruiseAltitudeMeters > 0 ? command.CruiseAltitudeMeters : AltitudeMeters);
        _effectiveRangeMeters = command.EffectiveRangeMeters;

        switch (Behavior)
        {
            case "Guard":
                SetGuardCurrentPosition();
                break;
            case "Move To Position":
                Status = "Moving";
                break;
            case "Surveil Location":
                Status = "Surveilling Location";
                break;
            case "Surveil Track":
                Status = "Surveilling Track";
                break;
            case "Engage Track":
                Status = "Engaging Target";
                break;
            default:
                _targetTrackId = string.Empty;
                Status = "Random Patrol";
                break;
        }
    }

    private void AdvanceRandom(WeatherSample? weather)
    {
        Behavior = "Random";
        Status = "Random Patrol";
        HeadingDegrees = (HeadingDegrees + (_random.NextDouble() * 14 - 7) + 360) % 360;
        var commandedAirspeed = Math.Clamp(GetCruiseSpeed() + (_random.NextDouble() * 0.5 - 0.25), 0, GetCruiseSpeed());
        MoveAlongHeading(commandedAirspeed, weather);
    }

    private void AdvanceToPoint(double targetLatitude, double targetLongitude, double arrivalDistanceMeters, string status, bool onArrivalGuard, WeatherSample? weather)
    {
        AdjustAltitudeToPlan();
        var distanceMeters = DistanceMeters(Latitude, Longitude, targetLatitude, targetLongitude);
        if (distanceMeters <= arrivalDistanceMeters)
        {
            Latitude = targetLatitude;
            Longitude = targetLongitude;
            if (onArrivalGuard)
            {
                _guardLatitude = targetLatitude;
                _guardLongitude = targetLongitude;
                Behavior = "Guard";
                Status = "On Station";
                GroundSpeedMetersPerSecond = 0;
                }
            return;
        }

        Status = status;
        var commandedAirspeed = Math.Min(GetCruiseSpeed(), 16);
        var northErrorMeters = (targetLatitude - Latitude) * 111320.0;
        var eastErrorMeters = (targetLongitude - Longitude) * 111320.0 * Math.Cos(((Latitude + targetLatitude) / 2.0) * Math.PI / 180.0);
        MoveWithGroundIntent(northErrorMeters, eastErrorMeters, commandedAirspeed, weather);
    }

    private void AdvanceOrbit(double centerLatitude, double centerLongitude, double radiusMeters, string status, WeatherSample? weather)
    {
        AdjustAltitudeToPlan();
        Status = status;
        var distanceMeters = DistanceMeters(Latitude, Longitude, centerLatitude, centerLongitude);
        if (distanceMeters > radiusMeters + 60)
        {
            var inboundAirspeed = Math.Min(GetCruiseSpeed(), 14);
            var northErrorMeters = (centerLatitude - Latitude) * 111320.0;
            var eastErrorMeters = (centerLongitude - Longitude) * 111320.0 * Math.Cos(((Latitude + centerLatitude) / 2.0) * Math.PI / 180.0);
            MoveWithGroundIntent(northErrorMeters, eastErrorMeters, inboundAirspeed, weather);
            return;
        }

        var tangentHeading = (BearingDegrees(centerLatitude, centerLongitude, Latitude, Longitude) + 90) % 360;
        var radialError = Math.Clamp((distanceMeters - radiusMeters) / Math.Max(radiusMeters, 1), -1, 1);
        var commandedAirspeed = Math.Min(GetCruiseSpeed(), 12);
        var commandedGroundHeading = (tangentHeading - (radialError * 35) + 360) % 360;
        var commandedGroundRadians = commandedGroundHeading * Math.PI / 180.0;
        var orbitDesiredNorthMeters = Math.Cos(commandedGroundRadians) * commandedAirspeed;
        var orbitDesiredEastMeters = Math.Sin(commandedGroundRadians) * commandedAirspeed;
        MoveWithGroundIntent(orbitDesiredNorthMeters, orbitDesiredEastMeters, commandedAirspeed, weather);
    }

    private void AdvanceEngage(
        SimulatedTrackState target,
        ISet<string> destroyedTrackIds,
        ICollection<SituationEvent> simulatorEvents,
        WeatherSample? weather)
    {
        AdjustAltitudeToPlan();
        var distanceMeters = DistanceMeters(Latitude, Longitude, target.Latitude, target.Longitude);
        if (distanceMeters <= 60)
        {
            destroyedTrackIds.Add(target.Id);
            simulatorEvents.Add(new SituationEvent
            {
                EventType = "target-destroyed",
                TrackId = Id,
                TargetTrackId = target.Id,
                Notes = $"{Callsign} destroyed {target.Callsign} after intercept."
            });
            SetGuardCurrentPosition();
            Status = "Intercept Complete";
            _targetTrackId = string.Empty;
            return;
        }

        Status = "Engaging Target";
        var commandedAirspeed = GetCruiseSpeed();
        var northErrorMeters = (target.Latitude - Latitude) * 111320.0;
        var eastErrorMeters = (target.Longitude - Longitude) * 111320.0 * Math.Cos(((Latitude + target.Latitude) / 2.0) * Math.PI / 180.0);
        MoveWithGroundIntent(northErrorMeters, eastErrorMeters, commandedAirspeed, weather);
    }

    private void SetGuardCurrentPosition()
    {
        Behavior = "Guard";
        _guardLatitude = Latitude;
        _guardLongitude = Longitude;
        _desiredLatitude = Latitude;
        _desiredLongitude = Longitude;
        _targetTrackId = string.Empty;
        _plannedCruiseAltitudeMeters = Math.Max(AltitudeMeters, MinimumOperationalAltitudeMeters);
        GroundSpeedMetersPerSecond = 0;
        VerticalSpeedMetersPerSecond = 0;
    }

    private void AdjustAltitudeToPlan()
    {
        var safePlannedAltitudeMeters = Math.Max(_plannedCruiseAltitudeMeters, MinimumOperationalAltitudeMeters);
        if (safePlannedAltitudeMeters <= 0)
        {
            VerticalSpeedMetersPerSecond = 0;
            return;
        }

        var delta = safePlannedAltitudeMeters - AltitudeMeters;
        var climbStep = GetVerticalStepMetersPerSecond(delta > 0);
        if (Math.Abs(delta) <= climbStep)
        {
            VerticalSpeedMetersPerSecond = delta;
            AltitudeMeters = safePlannedAltitudeMeters;
            return;
        }

        VerticalSpeedMetersPerSecond = Math.Sign(delta) * climbStep;
        AltitudeMeters += VerticalSpeedMetersPerSecond;
    }

    private void MoveAlongHeading(double airDistanceMeters, WeatherSample? weather)
    {
        var adjustedAirDistanceMeters = Math.Min(GetAvailableHorizontalAirspeed(airDistanceMeters), Math.Max(0, airDistanceMeters));
        var radians = HeadingDegrees * Math.PI / 180.0;
        var northMeters = Math.Cos(radians) * adjustedAirDistanceMeters;
        var eastMeters = Math.Sin(radians) * adjustedAirDistanceMeters;

        if (weather is not null)
        {
            var windRadians = weather.ToBearingDegrees * Math.PI / 180.0;
            northMeters += Math.Cos(windRadians) * weather.WindSpeedMs;
            eastMeters += Math.Sin(windRadians) * weather.WindSpeedMs;
        }

        GroundSpeedMetersPerSecond = Math.Sqrt((northMeters * northMeters) + (eastMeters * eastMeters));
        Latitude += northMeters / 111320.0;
        var longitudeDenominator = Math.Max(1e-6, 111320.0 * Math.Cos(Latitude * Math.PI / 180.0));
        Longitude += eastMeters / longitudeDenominator;
    }

    private void MoveWithGroundIntent(double desiredNorthMeters, double desiredEastMeters, double maxAirspeed, WeatherSample? weather)
    {
        var desiredMagnitude = Math.Sqrt((desiredNorthMeters * desiredNorthMeters) + (desiredEastMeters * desiredEastMeters));
        var windNorthMeters = 0.0;
        var windEastMeters = 0.0;
        var availableHorizontalAirspeed = GetAvailableHorizontalAirspeed(maxAirspeed);

        if (weather is not null)
        {
            var windRadians = weather.ToBearingDegrees * Math.PI / 180.0;
            windNorthMeters = Math.Cos(windRadians) * weather.WindSpeedMs;
            windEastMeters = Math.Sin(windRadians) * weather.WindSpeedMs;
        }

        double airNorthMeters;
        double airEastMeters;

        if (desiredMagnitude <= 1e-6)
        {
            var requiredAirNorthMeters = -windNorthMeters;
            var requiredAirEastMeters = -windEastMeters;
            var requiredAirMagnitude = Math.Sqrt((requiredAirNorthMeters * requiredAirNorthMeters) + (requiredAirEastMeters * requiredAirEastMeters));
            if (requiredAirMagnitude <= availableHorizontalAirspeed || requiredAirMagnitude <= 1e-6)
            {
                airNorthMeters = requiredAirNorthMeters;
                airEastMeters = requiredAirEastMeters;
            }
            else
            {
                var scale = availableHorizontalAirspeed / requiredAirMagnitude;
                airNorthMeters = requiredAirNorthMeters * scale;
                airEastMeters = requiredAirEastMeters * scale;
            }
        }
        else
        {
            var unitNorth = desiredNorthMeters / desiredMagnitude;
            var unitEast = desiredEastMeters / desiredMagnitude;
            var rightNorth = -unitEast;
            var rightEast = unitNorth;

            var windAlongMeters = (windNorthMeters * unitNorth) + (windEastMeters * unitEast);
            var windCrossMeters = (windNorthMeters * rightNorth) + (windEastMeters * rightEast);

            var airCrossMeters = Math.Clamp(-windCrossMeters, -availableHorizontalAirspeed, availableHorizontalAirspeed);
            var remainingAirAlongMeters = Math.Sqrt(Math.Max(0, (availableHorizontalAirspeed * availableHorizontalAirspeed) - (airCrossMeters * airCrossMeters)));
            var maxAchievableAlongMeters = windAlongMeters + remainingAirAlongMeters;
            var desiredAlongMeters = Math.Min(desiredMagnitude, Math.Max(0, maxAchievableAlongMeters));
            var requiredAirAlongMeters = desiredAlongMeters - windAlongMeters;
            var airAlongMeters = Math.Clamp(requiredAirAlongMeters, 0, remainingAirAlongMeters);

            airNorthMeters = (unitNorth * airAlongMeters) + (rightNorth * airCrossMeters);
            airEastMeters = (unitEast * airAlongMeters) + (rightEast * airCrossMeters);
        }

        var airMagnitude = Math.Sqrt((airNorthMeters * airNorthMeters) + (airEastMeters * airEastMeters));
        if (airMagnitude > 1e-6)
        {
            HeadingDegrees = (Math.Atan2(airEastMeters, airNorthMeters) * 180.0 / Math.PI + 360.0) % 360.0;
        }

        var groundNorthMeters = airNorthMeters + windNorthMeters;
        var groundEastMeters = airEastMeters + windEastMeters;
        GroundSpeedMetersPerSecond = Math.Sqrt((groundNorthMeters * groundNorthMeters) + (groundEastMeters * groundEastMeters));
        Latitude += groundNorthMeters / 111320.0;
        var longitudeDenominator = Math.Max(1e-6, 111320.0 * Math.Cos(Latitude * Math.PI / 180.0));
        Longitude += groundEastMeters / longitudeDenominator;
    }

    private double GetAvailableHorizontalAirspeed(double nominalAirspeed)
    {
        var climbPenaltyMetersPerSecond = Math.Max(0, VerticalSpeedMetersPerSecond) * 0.65;
        return Math.Max(
            nominalAirspeed * 0.35,
            nominalAirspeed - climbPenaltyMetersPerSecond);
    }

    private double GetVerticalStepMetersPerSecond(bool climbing)
    {
        var cruiseSpeed = GetCruiseSpeed();
        if (VehicleType == "Ground Vehicle")
        {
            return 0;
        }

        if (VehicleType == "Fixed Wing")
        {
            return Math.Max(1.5, Math.Min(climbing ? 6.0 : 8.0, cruiseSpeed * (climbing ? 0.35 : 0.5)));
        }

        if (VehicleType == "Helicopter")
        {
            return Math.Max(1.2, Math.Min(climbing ? 4.5 : 5.5, cruiseSpeed * (climbing ? 0.3 : 0.45)));
        }

        return Math.Max(0.8, Math.Min(climbing ? 3.5 : 5.0, cruiseSpeed * (climbing ? 0.25 : 0.4)));
    }

    private double GetCruiseSpeed()
    {
        return Math.Max(0, SpeedMetersPerSecond);
    }

    private static double DistanceMeters(double latitudeA, double longitudeA, double latitudeB, double longitudeB)
    {
        const double metersPerDegree = 111320.0;
        var deltaLat = (latitudeB - latitudeA) * metersPerDegree;
        var deltaLon = (longitudeB - longitudeA) * metersPerDegree * Math.Cos(((latitudeA + latitudeB) / 2.0) * Math.PI / 180.0);
        return Math.Sqrt((deltaLat * deltaLat) + (deltaLon * deltaLon));
    }

    private static double BearingDegrees(double latitudeA, double longitudeA, double latitudeB, double longitudeB)
    {
        var lat1 = latitudeA * Math.PI / 180.0;
        var lat2 = latitudeB * Math.PI / 180.0;
        var deltaLon = (longitudeB - longitudeA) * Math.PI / 180.0;

        var y = Math.Sin(deltaLon) * Math.Cos(lat2);
        var x = Math.Cos(lat1) * Math.Sin(lat2) - Math.Sin(lat1) * Math.Cos(lat2) * Math.Cos(deltaLon);
        return (Math.Atan2(y, x) * 180.0 / Math.PI + 360.0) % 360.0;
    }
}

file sealed class WeatherSampler : IDisposable
{
    private static readonly string[] PressureLevels = ["1000", "975", "950", "925", "900", "875", "850"];
    private const double SurfaceLayerAltitudeMeters = 30d;
    private readonly HttpClient _httpClient = new();
    private readonly Dictionary<string, CachedWeatherSample> _cache = new(StringComparer.OrdinalIgnoreCase);

    public async Task<WeatherSample?> GetWeatherAsync(double latitude, double longitude, double altitudeMeters, CancellationToken cancellationToken)
    {
        var cacheKey = $"{Math.Round(latitude, 1):F1}|{Math.Round(longitude, 1):F1}|{Math.Round(altitudeMeters / 50.0) * 50:F0}";
        if (_cache.TryGetValue(cacheKey, out var cached) &&
            DateTimeOffset.UtcNow - cached.FetchedAtUtc < TimeSpan.FromMinutes(2))
        {
            return cached.Sample;
        }

        try
        {
            var hourlyParameters = string.Join(',',
                PressureLevels.SelectMany(level => new[]
                {
                    $"wind_speed_{level}hPa",
                    $"wind_direction_{level}hPa",
                    $"geopotential_height_{level}hPa"
                }));

            var requestUri =
                $"https://api.open-meteo.com/v1/gfs?latitude={latitude:F6}&longitude={longitude:F6}" +
                $"&current=wind_speed_10m,wind_direction_10m&hourly={hourlyParameters}&forecast_hours=1&wind_speed_unit=ms&timezone=GMT";

            using var response = await _httpClient.GetAsync(requestUri, cancellationToken);
            response.EnsureSuccessStatusCode();

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            var hourly = document.RootElement.GetProperty("hourly");
            var current = document.RootElement.GetProperty("current");
            var bestLevel = PressureLevels
                .Select(level => new
                {
                    Height = hourly.GetProperty($"geopotential_height_{level}hPa")[0].GetDouble(),
                    WindSpeed = hourly.GetProperty($"wind_speed_{level}hPa")[0].GetDouble(),
                    WindDirection = hourly.GetProperty($"wind_direction_{level}hPa")[0].GetDouble()
                })
                .Append(new
                {
                    Height = SurfaceLayerAltitudeMeters,
                    WindSpeed = current.GetProperty("wind_speed_10m").GetDouble(),
                    WindDirection = current.GetProperty("wind_direction_10m").GetDouble()
                })
                .OrderBy(level => Math.Abs(level.Height - altitudeMeters))
                .First();

            var sample = new WeatherSample(bestLevel.WindSpeed, bestLevel.WindDirection, bestLevel.Height);
            _cache[cacheKey] = new CachedWeatherSample(sample, DateTimeOffset.UtcNow);
            return sample;
        }
        catch
        {
            return cached?.Sample;
        }
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }
}

file sealed record WeatherSample(double WindSpeedMs, double FromDirectionDegrees, double LayerAltitudeMeters)
{
    public double ToBearingDegrees => (FromDirectionDegrees + 180.0) % 360.0;
}

file sealed record CachedWeatherSample(WeatherSample Sample, DateTimeOffset FetchedAtUtc);
