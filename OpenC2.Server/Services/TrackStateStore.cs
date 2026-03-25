using System.Collections.Concurrent;
using OpenC2.Server.Models;
using OpenC2.Server.Models.Transport;

namespace OpenC2.Server.Services;

public sealed class TrackStateStore
{
    private sealed class TrackIdentityOverride
    {
        public string VehicleType { get; set; } = string.Empty;
        public string Classification { get; set; } = string.Empty;
        public string Affiliation { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string AlertLevel { get; set; } = string.Empty;
    }

    private readonly ConcurrentDictionary<string, Track> _tracks = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, TrackIdentityOverride> _identityOverrides = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentQueue<OperatorActionLogEntry> _actionLog = new();
    private readonly List<ProtectedSite> _protectedSites;
    private readonly IReadOnlyList<CommandDefinition> _commandCatalog;
    private readonly object _transportSync = new();
    private TransportStatus _transportStatus = new() { TcpPort = 5055 };

    public event Action? SnapshotChanged;
    public event Action<TrackReclassificationCommand>? SimulatorReclassificationRequested;
    public event Action<SpawnTrackCommand>? SimulatorSpawnRequested;
    public event Action<DeleteTrackCommand>? SimulatorDeleteRequested;
    public event Action<TrackBehaviorOrderCommand>? SimulatorBehaviorOrderRequested;

    private static readonly HashSet<string> ValidClassifications = new(StringComparer.OrdinalIgnoreCase)
    {
        "Pending",
        "Unknown",
        "Assumed Friend",
        "Friendly",
        "Neutral",
        "Suspect",
        "Hostile"
    };

    private static readonly HashSet<string> ValidAffiliations = new(StringComparer.OrdinalIgnoreCase)
    {
        "Friendly",
        "Hostile",
        "Neutral",
        "Unknown",
        "Suspect"
    };

    private static readonly HashSet<string> ValidAlertLevels = new(StringComparer.OrdinalIgnoreCase)
    {
        "Low",
        "Elevated",
        "High"
    };

    private static readonly HashSet<string> ValidVehicleTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Quadcopter",
        "Fixed Wing",
        "Helicopter",
        "Ground Vehicle",
        "Unknown"
    };

    private static readonly HashSet<string> ValidSitePostures = new(StringComparer.OrdinalIgnoreCase)
    {
        "Protected",
        "Observe",
        "Geofence",
        "Warning",
        "Restricted"
    };

    private static readonly HashSet<string> ValidBehaviors = new(StringComparer.OrdinalIgnoreCase)
    {
        "Guard",
        "Move To Position",
        "Random",
        "Surveil Location",
        "Surveil Track",
        "Engage Track"
    };

    public TrackStateStore()
    {
        _protectedSites = new List<ProtectedSite>
        {
            new ProtectedSite
            {
                Id = "site-denver",
                Name = "Metro Operations Campus",
                Latitude = 39.7392,
                Longitude = -104.9903,
                RadiusMeters = 2500,
                Posture = "Protected"
            },
            new ProtectedSite
            {
                Id = "site-north",
                Name = "North Corridor Node",
                Latitude = 39.8111,
                Longitude = -104.9419,
                RadiusMeters = 1400,
                Posture = "Observe"
            }
        };

        _commandCatalog = new[]
        {
            new CommandDefinition { Id = "surveil", Label = "Surveil", Intent = "Task persistent collection against the selected contact.", Category = "Collection" },
            new CommandDefinition { Id = "reclassify", Label = "Reclassify", Intent = "Update identity, affiliation, and threat posture.", Category = "Assessment" },
            new CommandDefinition { Id = "shadow", Label = "Shadow", Intent = "Assign coverage and maintain a visual or sensor tail.", Category = "Tracking" },
            new CommandDefinition { Id = "geofence", Label = "Apply Geofence", Intent = "Create or attach a monitoring zone around an area of interest.", Category = "Protection" },
            new CommandDefinition { Id = "dispatch", Label = "Dispatch Response", Intent = "Notify a non-kinetic response team for field intercept support.", Category = "Response" },
            new CommandDefinition { Id = "handoff", Label = "Handoff", Intent = "Transfer track ownership to another desk or external cell.", Category = "Coordination" },
            new CommandDefinition { Id = "corridor", Label = "Protect Corridor", Intent = "Mark the surrounding airspace as a protected transit corridor.", Category = "Protection" },
            new CommandDefinition { Id = "hold", Label = "Hold Surveillance", Intent = "Maintain collection until relieved or downgraded.", Category = "Collection" }
        };

        SeedDemoTracks();
    }

    public AirPictureSnapshot GetSnapshot()
    {
        var tracks = _tracks.Values
            .OrderByDescending(track => track.LastUpdateUtc)
            .ToArray();

        var actionLog = _actionLog
            .OrderByDescending(entry => entry.TimestampUtc)
            .Take(10)
            .ToArray();

        TransportStatus transportStatus;
        lock (_transportSync)
        {
            transportStatus = new TransportStatus
            {
                TcpPort = _transportStatus.TcpPort,
                ListenerOnline = _transportStatus.ListenerOnline,
                ConnectedClients = _transportStatus.ConnectedClients,
                LastMessageUtc = _transportStatus.LastMessageUtc,
                LastError = _transportStatus.LastError
            };
        }

        return new AirPictureSnapshot
        {
            GeneratedAtUtc = DateTimeOffset.UtcNow,
            Tracks = tracks,
            ProtectedSites = _protectedSites.ToArray(),
            AvailableCommands = _commandCatalog,
            ActionLog = actionLog,
            TransportStatus = transportStatus
        };
    }

    public bool HasConnectedSimulatorClients()
    {
        lock (_transportSync)
        {
            return _transportStatus.ConnectedClients > 0;
        }
    }

    public OperatorActionLogEntry RecordAction(OperatorActionRequest request)
    {
        var command = _commandCatalog.FirstOrDefault(item => item.Id.Equals(request.CommandId, StringComparison.OrdinalIgnoreCase));
        if (command is null)
        {
            throw new InvalidOperationException($"Unknown command '{request.CommandId}'.");
        }

        if (_tracks.TryGetValue(request.TrackId, out var track))
        {
            track.Status = command.Label;
            track.AlertLevel = command.Id switch
            {
                "dispatch" => "High",
                "geofence" => "Elevated",
                "reclassify" => "Elevated",
                _ => track.AlertLevel
            };
            track.LastUpdateUtc = DateTimeOffset.UtcNow;
        }

        var entry = new OperatorActionLogEntry
        {
            TrackId = request.TrackId,
            CommandId = command.Id,
            CommandLabel = command.Label,
            Notes = request.Notes,
            Operator = string.IsNullOrWhiteSpace(request.Operator) ? "Control Alpha" : request.Operator
        };

        AppendActionLog(entry);

        NotifySnapshotChanged();
        return entry;
    }

    public ProtectedSite CreateGeofence(CreateGeofenceRequest request)
    {
        var geofence = new ProtectedSite
        {
            Id = $"site-{Guid.NewGuid():N}"[..13],
            Name = string.IsNullOrWhiteSpace(request.Name) ? "Ad hoc geofence" : request.Name,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            RadiusMeters = Math.Clamp(request.RadiusMeters, 100, 25000),
            Posture = string.IsNullOrWhiteSpace(request.Posture) ? "Geofence" : request.Posture
        };

        _protectedSites.Add(geofence);
        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = "zone",
            CommandId = "geofence",
            CommandLabel = "Create Geofence",
            Notes = $"{geofence.Name} created at {geofence.Latitude:F4}, {geofence.Longitude:F4} with radius {geofence.RadiusMeters:F0}m.",
            Operator = "Control Alpha"
        });
        NotifySnapshotChanged();
        return geofence;
    }

    public ProtectedSite UpdateGeofence(string siteId, UpdateGeofenceRequest request)
    {
        var site = _protectedSites.FirstOrDefault(item => item.Id.Equals(siteId, StringComparison.OrdinalIgnoreCase));
        if (site is null)
        {
            throw new InvalidOperationException($"Geofence '{siteId}' was not found.");
        }

        if (!string.IsNullOrWhiteSpace(request.Posture) && !ValidSitePostures.Contains(request.Posture))
        {
            throw new InvalidOperationException($"Posture '{request.Posture}' is not valid.");
        }

        site.Name = string.IsNullOrWhiteSpace(request.Name) ? site.Name : request.Name.Trim();
        site.RadiusMeters = Math.Clamp(request.RadiusMeters, 100, 25000);
        if (!string.IsNullOrWhiteSpace(request.Posture))
        {
            site.Posture = request.Posture;
        }

        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = site.Id,
            CommandId = "geofence",
            CommandLabel = "Update Geofence",
            Notes = $"{site.Name} updated with radius {site.RadiusMeters:F0}m and posture {site.Posture}.",
            Operator = "Control Alpha"
        });

        NotifySnapshotChanged();
        return site;
    }

    public Track UpdateTrack(string trackId, TrackUpdateRequest request)
    {
        if (!_tracks.TryGetValue(trackId, out var track))
        {
            throw new InvalidOperationException($"Track '{trackId}' was not found.");
        }

        if (!string.Equals(track.Source, "simulator", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Behavior orders are only supported for simulator tracks.");
        }

        if (!string.IsNullOrWhiteSpace(request.Classification) && !ValidClassifications.Contains(request.Classification))
        {
            throw new InvalidOperationException($"Classification '{request.Classification}' is not valid.");
        }

        if (!string.IsNullOrWhiteSpace(request.VehicleType) && !ValidVehicleTypes.Contains(request.VehicleType))
        {
            throw new InvalidOperationException($"VehicleType '{request.VehicleType}' is not valid.");
        }

        if (!string.IsNullOrWhiteSpace(request.Affiliation) && !ValidAffiliations.Contains(request.Affiliation))
        {
            throw new InvalidOperationException($"Affiliation '{request.Affiliation}' is not valid.");
        }

        if (!string.IsNullOrWhiteSpace(request.AlertLevel) && !ValidAlertLevels.Contains(request.AlertLevel))
        {
            throw new InvalidOperationException($"AlertLevel '{request.AlertLevel}' is not valid.");
        }

        if (!string.IsNullOrWhiteSpace(request.VehicleType))
        {
            track.VehicleType = request.VehicleType;
        }

        if (!string.IsNullOrWhiteSpace(request.Classification))
        {
            track.Classification = request.Classification;
        }

        if (!string.IsNullOrWhiteSpace(request.Affiliation))
        {
            track.Affiliation = request.Affiliation;
        }

        if (!string.IsNullOrWhiteSpace(request.AlertLevel))
        {
            track.AlertLevel = request.AlertLevel;
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            track.Status = request.Status;
        }

        track.LastUpdateUtc = DateTimeOffset.UtcNow;
        _identityOverrides[trackId] = new TrackIdentityOverride
        {
            VehicleType = track.VehicleType,
            Classification = track.Classification,
            Affiliation = track.Affiliation,
            Status = track.Status,
            AlertLevel = track.AlertLevel
        };

        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = trackId,
            CommandId = "reclassify",
            CommandLabel = "Reclassify Track",
            Notes = string.IsNullOrWhiteSpace(request.Notes)
                ? $"{track.Callsign} updated to {track.Classification} / {track.Affiliation}."
                : request.Notes,
            Operator = string.IsNullOrWhiteSpace(request.Operator) ? "Control Alpha" : request.Operator
        });

        SimulatorReclassificationRequested?.Invoke(new TrackReclassificationCommand
        {
            TrackId = trackId,
            VehicleType = track.VehicleType,
            Classification = track.Classification,
            Affiliation = track.Affiliation,
            Status = track.Status,
            AlertLevel = track.AlertLevel
        });

        NotifySnapshotChanged();
        return track;
    }

    public Track? FindTrack(string trackId)
    {
        _tracks.TryGetValue(trackId, out var track);
        return track;
    }

    public Track OrderTrackBehavior(string trackId, TrackBehaviorOrderRequest request, MoveOptimizationResult? optimization = null)
    {
        if (!_tracks.TryGetValue(trackId, out var track))
        {
            throw new InvalidOperationException($"Track '{trackId}' was not found.");
        }

        if (!ValidBehaviors.Contains(request.Behavior))
        {
            throw new InvalidOperationException($"Behavior '{request.Behavior}' is not valid.");
        }

        if (request.Behavior.Equals("Move To Position", StringComparison.OrdinalIgnoreCase) ||
            request.Behavior.Equals("Surveil Location", StringComparison.OrdinalIgnoreCase))
        {
            if (!request.Latitude.HasValue || !request.Longitude.HasValue)
            {
                throw new InvalidOperationException($"Behavior '{request.Behavior}' requires a destination.");
            }
        }

        if (request.Behavior.Equals("Surveil Track", StringComparison.OrdinalIgnoreCase) ||
            request.Behavior.Equals("Engage Track", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(request.TargetTrackId))
            {
                throw new InvalidOperationException($"Behavior '{request.Behavior}' requires a target track.");
            }

            if (!_tracks.ContainsKey(request.TargetTrackId))
            {
                throw new InvalidOperationException($"Target track '{request.TargetTrackId}' was not found.");
            }
        }

        track.Behavior = request.Behavior;
        track.Status = request.Behavior;
        track.CommandLatitude = request.Latitude;
        track.CommandLongitude = request.Longitude;
        track.CommandTargetTrackId = request.TargetTrackId?.Trim() ?? string.Empty;
        track.CommandRadiusMeters = request.StandoffRadiusMeters;
        track.CommandCruiseAltitudeMeters = request.CruiseAltitudeMeters ?? optimization?.CruiseAltitudeMeters;
        track.CommandEffectiveRangeMeters = optimization?.EffectiveRangeMeters;
        track.LastUpdateUtc = DateTimeOffset.UtcNow;

        var behaviorCommand = new TrackBehaviorOrderCommand
        {
            TrackId = trackId,
            Behavior = request.Behavior,
            Latitude = request.Latitude ?? track.Latitude,
            Longitude = request.Longitude ?? track.Longitude,
            TargetTrackId = request.TargetTrackId?.Trim() ?? string.Empty,
            StandoffRadiusMeters = Math.Clamp(request.StandoffRadiusMeters ?? 180, 30, 2000),
            CruiseAltitudeMeters = request.CruiseAltitudeMeters ?? optimization?.CruiseAltitudeMeters ?? track.AltitudeMeters,
            EffectiveRangeMeters = optimization?.EffectiveRangeMeters ?? 0
        };

        var behaviorNotes = request.Behavior switch
        {
            "Move To Position" => optimization is null
                ? $"{track.Callsign} ordered to move to {behaviorCommand.Latitude:F4}, {behaviorCommand.Longitude:F4}."
                : $"{track.Callsign} ordered to move to {behaviorCommand.Latitude:F4}, {behaviorCommand.Longitude:F4} at optimized cruise altitude {optimization.CruiseAltitudeMeters:F0}m with projected range {optimization.EffectiveRangeMeters:F0}m.",
            "Surveil Location" => $"{track.Callsign} ordered to surveil {behaviorCommand.Latitude:F4}, {behaviorCommand.Longitude:F4} within {behaviorCommand.StandoffRadiusMeters:F0}m.",
            "Surveil Track" => $"{track.Callsign} ordered to surveil {behaviorCommand.TargetTrackId} within {behaviorCommand.StandoffRadiusMeters:F0}m.",
            "Engage Track" => $"{track.Callsign} ordered to engage {behaviorCommand.TargetTrackId}.",
            "Guard" => $"{track.Callsign} ordered to guard current position.",
            _ => $"{track.Callsign} ordered to fly a random pattern."
        };

        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = trackId,
            CommandId = "behavior",
            CommandLabel = $"Order {request.Behavior}",
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? behaviorNotes : request.Notes,
            Operator = string.IsNullOrWhiteSpace(request.Operator) ? "Control Alpha" : request.Operator
        });

        if (string.Equals(track.Source, "simulator", StringComparison.OrdinalIgnoreCase))
        {
            SimulatorBehaviorOrderRequested?.Invoke(behaviorCommand);
        }

        NotifySnapshotChanged();
        return track;
    }

    public Track CreateSimulatorTrack(CreateSimulatorTrackRequest request)
    {
        if (!ValidVehicleTypes.Contains(request.VehicleType))
        {
            throw new InvalidOperationException($"VehicleType '{request.VehicleType}' is not valid.");
        }

        if (!ValidClassifications.Contains(request.Classification))
        {
            throw new InvalidOperationException($"Classification '{request.Classification}' is not valid.");
        }

        if (!ValidAffiliations.Contains(request.Affiliation))
        {
            throw new InvalidOperationException($"Affiliation '{request.Affiliation}' is not valid.");
        }

        if (!ValidAlertLevels.Contains(request.AlertLevel))
        {
            throw new InvalidOperationException($"AlertLevel '{request.AlertLevel}' is not valid.");
        }

        var now = DateTimeOffset.UtcNow;
        var trackId = $"trk-{Guid.NewGuid():N}"[..12];
        var callsign = string.IsNullOrWhiteSpace(request.Callsign)
            ? $"VIPER-{Random.Shared.Next(10, 99)}"
            : request.Callsign.Trim().ToUpperInvariant();

        var track = new Track
        {
            Id = trackId,
            Callsign = callsign,
            Source = "simulator",
            VehicleType = request.VehicleType,
            Classification = request.Classification,
            Affiliation = request.Affiliation,
            Status = string.IsNullOrWhiteSpace(request.Status) ? "Tracking" : request.Status.Trim(),
            AlertLevel = request.AlertLevel,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            AltitudeMeters = Math.Clamp(request.AltitudeMeters, 40, 4000),
            SpeedMetersPerSecond = Math.Clamp(request.SpeedMetersPerSecond, 1, 80),
            GroundSpeedMetersPerSecond = 0,
            VerticalSpeedMetersPerSecond = 0,
            BatteryMinutes = Math.Clamp(request.BatteryMinutes, 5, 300),
            HeadingDegrees = ((request.HeadingDegrees % 360) + 360) % 360,
            Confidence = 0.88,
            Behavior = "Random",
            CommandTargetTrackId = string.Empty,
            LastUpdateUtc = now
        };

        _tracks[trackId] = track;
        _identityOverrides[trackId] = new TrackIdentityOverride
        {
            VehicleType = track.VehicleType,
            Classification = track.Classification,
            Affiliation = track.Affiliation,
            Status = track.Status,
            AlertLevel = track.AlertLevel
        };

        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = trackId,
            CommandId = "dispatch",
            CommandLabel = "Create Simulated Track",
            Notes = $"{track.Callsign} inserted at {track.Latitude:F4}, {track.Longitude:F4} as {track.VehicleType}.",
            Operator = "Control Alpha"
        });

        SimulatorSpawnRequested?.Invoke(new SpawnTrackCommand
        {
            TrackId = track.Id,
            Callsign = track.Callsign,
            VehicleType = track.VehicleType,
            Classification = track.Classification,
            Affiliation = track.Affiliation,
            AlertLevel = track.AlertLevel,
            Status = track.Status,
            Latitude = track.Latitude,
            Longitude = track.Longitude,
            AltitudeMeters = track.AltitudeMeters,
            SpeedMetersPerSecond = track.SpeedMetersPerSecond,
            BatteryMinutes = track.BatteryMinutes,
            HeadingDegrees = track.HeadingDegrees,
            Behavior = track.Behavior
        });

        NotifySnapshotChanged();
        return track;
    }

    public void DeleteTrack(string trackId)
    {
        if (!_tracks.TryRemove(trackId, out var track))
        {
            throw new InvalidOperationException($"Track '{trackId}' was not found.");
        }

        _identityOverrides.TryRemove(trackId, out _);

        AppendActionLog(new OperatorActionLogEntry
        {
            TrackId = trackId,
            CommandId = "dispatch",
            CommandLabel = "Delete Simulated Track",
            Notes = $"{track.Callsign} removed from the simulator feed.",
            Operator = "Control Alpha"
        });

        if (string.Equals(track.Source, "simulator", StringComparison.OrdinalIgnoreCase))
        {
            SimulatorDeleteRequested?.Invoke(new DeleteTrackCommand
            {
                TrackId = trackId
            });
        }

        NotifySnapshotChanged();
    }

    public void UpsertTrack(TrackMessage message)
    {
        var now = DateTimeOffset.UtcNow;
        _tracks.AddOrUpdate(
            message.TrackId,
            _ => new Track
            {
                Id = message.TrackId,
                Callsign = message.Callsign,
                Source = message.Source,
                VehicleType = message.VehicleType,
                Classification = message.Classification,
                Affiliation = message.Affiliation,
                Status = message.Status,
                AlertLevel = message.AlertLevel,
                Latitude = message.Latitude,
                Longitude = message.Longitude,
                AltitudeMeters = message.AltitudeMeters,
                SpeedMetersPerSecond = message.SpeedMetersPerSecond,
                GroundSpeedMetersPerSecond = message.GroundSpeedMetersPerSecond,
                VerticalSpeedMetersPerSecond = message.VerticalSpeedMetersPerSecond,
                BatteryMinutes = message.BatteryMinutes,
                HeadingDegrees = message.HeadingDegrees,
                Confidence = message.Confidence,
                Behavior = message.Behavior,
                CommandLatitude = message.CommandLatitude,
                CommandLongitude = message.CommandLongitude,
                CommandTargetTrackId = message.CommandTargetTrackId,
                CommandRadiusMeters = message.CommandRadiusMeters,
                LastUpdateUtc = now
            },
            (_, track) =>
            {
                track.Callsign = message.Callsign;
                track.Source = message.Source;
                track.VehicleType = message.VehicleType;
                track.Classification = message.Classification;
                track.Affiliation = message.Affiliation;
                track.Status = message.Status;
                track.AlertLevel = message.AlertLevel;
                track.Latitude = message.Latitude;
                track.Longitude = message.Longitude;
                track.AltitudeMeters = message.AltitudeMeters;
                track.SpeedMetersPerSecond = message.SpeedMetersPerSecond;
                track.GroundSpeedMetersPerSecond = message.GroundSpeedMetersPerSecond;
                track.VerticalSpeedMetersPerSecond = message.VerticalSpeedMetersPerSecond;
                track.BatteryMinutes = message.BatteryMinutes;
                track.HeadingDegrees = message.HeadingDegrees;
                track.Confidence = message.Confidence;
                track.Behavior = message.Behavior;
                track.CommandLatitude = message.CommandLatitude;
                track.CommandLongitude = message.CommandLongitude;
                track.CommandTargetTrackId = message.CommandTargetTrackId;
                track.CommandRadiusMeters = message.CommandRadiusMeters;
                track.LastUpdateUtc = now;
                return track;
            });

        if (_identityOverrides.TryGetValue(message.TrackId, out var identityOverride) &&
            _tracks.TryGetValue(message.TrackId, out var updatedTrack))
        {
            updatedTrack.VehicleType = identityOverride.VehicleType;
            updatedTrack.Classification = identityOverride.Classification;
            updatedTrack.Affiliation = identityOverride.Affiliation;
            updatedTrack.Status = identityOverride.Status;
            updatedTrack.AlertLevel = identityOverride.AlertLevel;
        }

        lock (_transportSync)
        {
            _transportStatus.LastMessageUtc = now;
            _transportStatus.LastError = string.Empty;
        }

        NotifySnapshotChanged();
    }

    public void HandleSimulatorEvent(SimulatorEvent simulatorEvent)
    {
        if (string.IsNullOrWhiteSpace(simulatorEvent.EventType))
        {
            return;
        }

        if (simulatorEvent.EventType.Equals("target-destroyed", StringComparison.OrdinalIgnoreCase))
        {
            if (_tracks.TryRemove(simulatorEvent.TargetTrackId, out var destroyedTrack))
            {
                _identityOverrides.TryRemove(simulatorEvent.TargetTrackId, out _);

                if (_tracks.TryGetValue(simulatorEvent.TrackId, out var actingTrack))
                {
                    actingTrack.Status = "Intercept Complete";
                    actingTrack.Behavior = "Guard";
                    actingTrack.LastUpdateUtc = DateTimeOffset.UtcNow;
                }

                AppendActionLog(new OperatorActionLogEntry
                {
                    TrackId = simulatorEvent.TrackId,
                    CommandId = "engage",
                    CommandLabel = "Target Destroyed",
                    Notes = string.IsNullOrWhiteSpace(simulatorEvent.Notes)
                        ? $"{destroyedTrack.Callsign} destroyed by {simulatorEvent.TrackId}."
                        : simulatorEvent.Notes,
                    Operator = "Simulator"
                });
            }
        }

        NotifySnapshotChanged();
    }

    public void UpdateTransportStatus(Action<TransportStatus> mutate)
    {
        lock (_transportSync)
        {
            mutate(_transportStatus);
        }

        NotifySnapshotChanged();
    }

    private void SeedDemoTracks()
    {
        var now = DateTimeOffset.UtcNow;
        var seedTracks = new[]
        {
            new Track
            {
                Id = "trk-1001",
                Callsign = "RAVEN-11",
                Source = "EO/IR",
                VehicleType = "Quadcopter",
                Classification = "Unknown UAS",
                Affiliation = "Unknown",
                Status = "Investigating",
                AlertLevel = "High",
                Latitude = 39.7478,
                Longitude = -104.9842,
                AltitudeMeters = 145,
                SpeedMetersPerSecond = 12.4,
                GroundSpeedMetersPerSecond = 11.1,
                VerticalSpeedMetersPerSecond = 0,
                BatteryMinutes = 28,
                HeadingDegrees = 38,
                Confidence = 0.91,
                Behavior = "Random",
                LastUpdateUtc = now
            },
            new Track
            {
                Id = "trk-1002",
                Callsign = "MERCURY-03",
                Source = "Radar",
                VehicleType = "Fixed Wing",
                Classification = "Survey",
                Affiliation = "Friendly",
                Status = "Cleared Corridor",
                AlertLevel = "Low",
                Latitude = 39.8048,
                Longitude = -104.9614,
                AltitudeMeters = 310,
                SpeedMetersPerSecond = 24.8,
                GroundSpeedMetersPerSecond = 23.2,
                VerticalSpeedMetersPerSecond = 0,
                BatteryMinutes = 55,
                HeadingDegrees = 182,
                Confidence = 0.97,
                Behavior = "Guard",
                LastUpdateUtc = now.AddSeconds(-14)
            },
            new Track
            {
                Id = "trk-1003",
                Callsign = "GHOST-27",
                Source = "RF",
                VehicleType = "Quadcopter",
                Classification = "Uncooperative",
                Affiliation = "Unknown",
                Status = "Pattern Drift",
                AlertLevel = "Elevated",
                Latitude = 39.7212,
                Longitude = -104.9558,
                AltitudeMeters = 98,
                SpeedMetersPerSecond = 8.1,
                GroundSpeedMetersPerSecond = 7.4,
                VerticalSpeedMetersPerSecond = 0,
                BatteryMinutes = 28,
                HeadingDegrees = 302,
                Confidence = 0.83,
                Behavior = "Random",
                LastUpdateUtc = now.AddSeconds(-8)
            }
        };

        foreach (var track in seedTracks)
        {
            _tracks[track.Id] = track;
        }
    }

    private void NotifySnapshotChanged()
    {
        SnapshotChanged?.Invoke();
    }

    private void AppendActionLog(OperatorActionLogEntry entry)
    {
        _actionLog.Enqueue(entry);
        while (_actionLog.Count > 40 && _actionLog.TryDequeue(out _))
        {
        }
    }
}
