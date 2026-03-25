using ProtoBuf;

namespace OpenC2.Transport;

[ProtoContract]
public class TransportEnvelope
{
    [ProtoMember(1)]
    public TrackMessage? Track { get; set; }

    [ProtoMember(2)]
    public TrackReclassificationCommand? Reclassification { get; set; }

    [ProtoMember(3)]
    public SpawnTrackCommand? SpawnTrack { get; set; }

    [ProtoMember(4)]
    public DeleteTrackCommand? DeleteTrack { get; set; }

    [ProtoMember(5)]
    public TrackBehaviorOrderCommand? BehaviorOrder { get; set; }

    [ProtoMember(6)]
    public SituationEvent? Event { get; set; }

    [ProtoMember(7)]
    public SituationUpdate? SituationUpdate { get; set; }

    [ProtoMember(8)]
    public string EnvelopeId { get; set; } = string.Empty;

    [ProtoMember(9)]
    public long CreatedAtUnixMs { get; set; }

    [ProtoMember(10)]
    public TransportPeer? Source { get; set; }

    [ProtoMember(11)]
    public TransportPeer? Destination { get; set; }

    [ProtoMember(12)]
    public string Profile { get; set; } = string.Empty;

    [ProtoMember(13)]
    public CommandMessage? CommandMessage { get; set; }

    [ProtoMember(14)]
    public ResponseMessage? ResponseMessage { get; set; }

    [ProtoMember(15)]
    public EventMessage? EventMessage { get; set; }

    [ProtoMember(16)]
    public CapabilityAdvertisement? CapabilityAdvertisement { get; set; }
}

[ProtoContract]
public sealed class SimulatorFrame : TransportEnvelope
{
}

[ProtoContract]
public sealed class SituationUpdate
{
    [ProtoMember(1)]
    public string SourceSystem { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string UpdateId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public long GeneratedAtUnixMs { get; set; }

    [ProtoMember(4)]
    public List<TrackedObject> TrackedObjects { get; set; } = [];

    [ProtoMember(5)]
    public List<DetectingObject> DetectingObjects { get; set; } = [];

    [ProtoMember(6)]
    public List<DetectedObject> DetectedObjects { get; set; } = [];

    [ProtoMember(7)]
    public List<SituationEvent> Events { get; set; } = [];

    [ProtoMember(8)]
    public List<Emplacement> Emplacements { get; set; } = [];

    [ProtoMember(9)]
    public List<GroundVehicle> GroundVehicles { get; set; } = [];

    [ProtoMember(10)]
    public List<Unit> Units { get; set; } = [];
}

[ProtoContract]
public sealed class TransportPeer
{
    [ProtoMember(1)]
    public string SystemId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string ComponentId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Role { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string InstanceId { get; set; } = string.Empty;

    [ProtoMember(5)]
    public string Organization { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class NameValue
{
    [ProtoMember(1)]
    public string Name { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Value { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string ValueType { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class CommandMessage
{
    [ProtoMember(1)]
    public string CommandId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string CorrelationId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Action { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string TargetType { get; set; } = string.Empty;

    [ProtoMember(5)]
    public string ActuatorProfile { get; set; } = string.Empty;

    [ProtoMember(6)]
    public List<NameValue> TargetSpecifiers { get; set; } = [];

    [ProtoMember(7)]
    public List<NameValue> Arguments { get; set; } = [];

    [ProtoMember(8)]
    public List<string> RequestedResponseTypes { get; set; } = [];

    [ProtoMember(9)]
    public string Description { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class ResponseMessage
{
    [ProtoMember(1)]
    public string ResponseId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string RequestId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public int StatusCode { get; set; }

    [ProtoMember(4)]
    public string StatusText { get; set; } = string.Empty;

    [ProtoMember(5)]
    public string StatusDetail { get; set; } = string.Empty;

    [ProtoMember(6)]
    public List<NameValue> Results { get; set; } = [];
}

[ProtoContract]
public sealed class EventMessage
{
    [ProtoMember(1)]
    public string EventId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string CorrelationId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string EventType { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string Severity { get; set; } = string.Empty;

    [ProtoMember(5)]
    public long OccurredAtUnixMs { get; set; }

    [ProtoMember(6)]
    public string Summary { get; set; } = string.Empty;

    [ProtoMember(7)]
    public string Detail { get; set; } = string.Empty;

    [ProtoMember(8)]
    public List<NameValue> Attributes { get; set; } = [];
}

[ProtoContract]
public sealed class CapabilityAdvertisement
{
    [ProtoMember(1)]
    public string AdvertisementId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string SubjectId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string SubjectRole { get; set; } = string.Empty;

    [ProtoMember(4)]
    public List<string> ActuatorProfiles { get; set; } = [];

    [ProtoMember(5)]
    public List<string> SupportedActions { get; set; } = [];

    [ProtoMember(6)]
    public List<string> SupportedTargetTypes { get; set; } = [];

    [ProtoMember(7)]
    public List<string> TransferBindings { get; set; } = [];

    [ProtoMember(8)]
    public List<string> Serializations { get; set; } = [];

    [ProtoMember(9)]
    public List<NameValue> AdditionalCapabilities { get; set; } = [];
}

[ProtoContract]
public sealed class GeoPosition
{
    [ProtoMember(1)]
    public double Latitude { get; set; }

    [ProtoMember(2)]
    public double Longitude { get; set; }

    [ProtoMember(3)]
    public double AltitudeMeters { get; set; }
}

[ProtoContract]
public sealed class Kinematics
{
    [ProtoMember(1)]
    public double HeadingDegrees { get; set; }

    [ProtoMember(2)]
    public double AirspeedMetersPerSecond { get; set; }

    [ProtoMember(3)]
    public double GroundSpeedMetersPerSecond { get; set; }

    [ProtoMember(4)]
    public double VerticalSpeedMetersPerSecond { get; set; }

    [ProtoMember(5)]
    public double TrackConfidence { get; set; }
}

[ProtoContract]
public sealed class IdentityData
{
    [ProtoMember(1)]
    public string Callsign { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Source { get; set; } = "simulator";

    [ProtoMember(3)]
    public string VehicleType { get; set; } = "Quadcopter";

    [ProtoMember(4)]
    public string Classification { get; set; } = "Unknown";

    [ProtoMember(5)]
    public string Affiliation { get; set; } = "Unknown";

    [ProtoMember(6)]
    public string Status { get; set; } = "Tracking";

    [ProtoMember(7)]
    public string AlertLevel { get; set; } = "Monitor";

    [ProtoMember(8)]
    public string ObjectKind { get; set; } = "TrackedObject";

    [ProtoMember(9)]
    public string Domain { get; set; } = "Air";
}

[ProtoContract]
public sealed class CommandIntent
{
    [ProtoMember(1)]
    public string Behavior { get; set; } = string.Empty;

    [ProtoMember(2)]
    public double? Latitude { get; set; }

    [ProtoMember(3)]
    public double? Longitude { get; set; }

    [ProtoMember(4)]
    public string TargetTrackId { get; set; } = string.Empty;

    [ProtoMember(5)]
    public double? RadiusMeters { get; set; }

    [ProtoMember(6)]
    public double? CruiseAltitudeMeters { get; set; }

    [ProtoMember(7)]
    public double? EffectiveRangeMeters { get; set; }
}

[ProtoContract]
public sealed class TrackedObject
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public IdentityData Identity { get; set; } = new();

    [ProtoMember(3)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(4)]
    public Kinematics Kinematics { get; set; } = new();

    [ProtoMember(5)]
    public double BatteryMinutes { get; set; }

    [ProtoMember(6)]
    public CommandIntent Command { get; set; } = new();

    [ProtoMember(7)]
    public string Behavior { get; set; } = "Random";

    [ProtoMember(8)]
    public long LastObservedUnixMs { get; set; }

    [ProtoMember(9)]
    public string ShortStatus { get; set; } = string.Empty;

    [ProtoMember(10)]
    public string LongStatus { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class Emplacement
{
    [ProtoMember(1)]
    public string EmplacementId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Name { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Category { get; set; } = string.Empty;

    [ProtoMember(4)]
    public IdentityData Identity { get; set; } = new()
    {
        ObjectKind = "Emplacement",
        Domain = "Ground"
    };

    [ProtoMember(5)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(6)]
    public string ShortStatus { get; set; } = string.Empty;

    [ProtoMember(7)]
    public string LongStatus { get; set; } = string.Empty;

    [ProtoMember(8)]
    public double CoverageRadiusMeters { get; set; }

    [ProtoMember(9)]
    public long LastObservedUnixMs { get; set; }
}

[ProtoContract]
public sealed class GroundVehicle
{
    [ProtoMember(1)]
    public string VehicleId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public IdentityData Identity { get; set; } = new()
    {
        ObjectKind = "GroundVehicle",
        Domain = "Ground"
    };

    [ProtoMember(3)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(4)]
    public Kinematics Kinematics { get; set; } = new();

    [ProtoMember(5)]
    public string ShortStatus { get; set; } = string.Empty;

    [ProtoMember(6)]
    public string LongStatus { get; set; } = string.Empty;

    [ProtoMember(7)]
    public long LastObservedUnixMs { get; set; }
}

[ProtoContract]
public sealed class Unit
{
    [ProtoMember(1)]
    public string UnitId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public IdentityData Identity { get; set; } = new()
    {
        ObjectKind = "Unit",
        Domain = "Ground"
    };

    [ProtoMember(3)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(4)]
    public Kinematics Kinematics { get; set; } = new();

    [ProtoMember(5)]
    public string ShortStatus { get; set; } = string.Empty;

    [ProtoMember(6)]
    public string LongStatus { get; set; } = string.Empty;

    [ProtoMember(7)]
    public double StrengthEstimate { get; set; }

    [ProtoMember(8)]
    public long LastObservedUnixMs { get; set; }
}

[ProtoContract]
public sealed class DetectingObject
{
    [ProtoMember(1)]
    public string DetectorId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Name { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Source { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string SensorType { get; set; } = string.Empty;

    [ProtoMember(5)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(6)]
    public Kinematics Kinematics { get; set; } = new();

    [ProtoMember(7)]
    public string Affiliation { get; set; } = string.Empty;

    [ProtoMember(8)]
    public double Confidence { get; set; }

    [ProtoMember(9)]
    public double CoverageRadiusMeters { get; set; }
}

[ProtoContract]
public sealed class DetectedObject
{
    [ProtoMember(1)]
    public string DetectionId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string DetectorId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string RelatedTrackId { get; set; } = string.Empty;

    [ProtoMember(4)]
    public GeoPosition Position { get; set; } = new();

    [ProtoMember(5)]
    public Kinematics Kinematics { get; set; } = new();

    [ProtoMember(6)]
    public string Classification { get; set; } = string.Empty;

    [ProtoMember(7)]
    public string Affiliation { get; set; } = string.Empty;

    [ProtoMember(8)]
    public double Confidence { get; set; }

    [ProtoMember(9)]
    public string RawLabel { get; set; } = string.Empty;

    [ProtoMember(10)]
    public long ObservedAtUnixMs { get; set; }
}

[ProtoContract]
public sealed class TrackMessage
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Callsign { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Source { get; set; } = "simulator";

    [ProtoMember(4)]
    public string VehicleType { get; set; } = "Quadcopter";

    [ProtoMember(5)]
    public string Classification { get; set; } = "Unknown";

    [ProtoMember(6)]
    public string Affiliation { get; set; } = "Unknown";

    [ProtoMember(7)]
    public string Status { get; set; } = "Tracking";

    [ProtoMember(8)]
    public string AlertLevel { get; set; } = "Monitor";

    [ProtoMember(9)]
    public double Latitude { get; set; }

    [ProtoMember(10)]
    public double Longitude { get; set; }

    [ProtoMember(11)]
    public double AltitudeMeters { get; set; }

    [ProtoMember(12)]
    public double SpeedMetersPerSecond { get; set; }

    [ProtoMember(13)]
    public double GroundSpeedMetersPerSecond { get; set; }

    [ProtoMember(14)]
    public double VerticalSpeedMetersPerSecond { get; set; }

    [ProtoMember(15)]
    public double BatteryMinutes { get; set; }

    [ProtoMember(16)]
    public double HeadingDegrees { get; set; }

    [ProtoMember(17)]
    public double Confidence { get; set; } = 0.5;

    [ProtoMember(18)]
    public string Behavior { get; set; } = "Random";

    [ProtoMember(19)]
    public double? CommandLatitude { get; set; }

    [ProtoMember(20)]
    public double? CommandLongitude { get; set; }

    [ProtoMember(21)]
    public string CommandTargetTrackId { get; set; } = string.Empty;

    [ProtoMember(22)]
    public double? CommandRadiusMeters { get; set; }

    [ProtoMember(23)]
    public double? CommandCruiseAltitudeMeters { get; set; }

    [ProtoMember(24)]
    public double? CommandEffectiveRangeMeters { get; set; }
}

[ProtoContract]
public sealed class TrackReclassificationCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string VehicleType { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string Classification { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string Affiliation { get; set; } = string.Empty;

    [ProtoMember(5)]
    public string Status { get; set; } = string.Empty;

    [ProtoMember(6)]
    public string AlertLevel { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class SpawnTrackCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Callsign { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string VehicleType { get; set; } = "Quadcopter";

    [ProtoMember(4)]
    public string Classification { get; set; } = "Unknown";

    [ProtoMember(5)]
    public string Affiliation { get; set; } = "Unknown";

    [ProtoMember(6)]
    public string AlertLevel { get; set; } = "Elevated";

    [ProtoMember(7)]
    public string Status { get; set; } = "Tracking";

    [ProtoMember(8)]
    public double Latitude { get; set; }

    [ProtoMember(9)]
    public double Longitude { get; set; }

    [ProtoMember(10)]
    public double AltitudeMeters { get; set; } = 120;

    [ProtoMember(11)]
    public double SpeedMetersPerSecond { get; set; } = 10;

    [ProtoMember(12)]
    public double HeadingDegrees { get; set; }

    [ProtoMember(13)]
    public string Behavior { get; set; } = "Random";

    [ProtoMember(14)]
    public double BatteryMinutes { get; set; } = 28;

    [ProtoMember(15)]
    public double CruiseAltitudeMeters { get; set; }
}

[ProtoContract]
public sealed class DeleteTrackCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class TrackBehaviorOrderCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string Behavior { get; set; } = string.Empty;

    [ProtoMember(3)]
    public double Latitude { get; set; }

    [ProtoMember(4)]
    public double Longitude { get; set; }

    [ProtoMember(5)]
    public string TargetTrackId { get; set; } = string.Empty;

    [ProtoMember(6)]
    public double StandoffRadiusMeters { get; set; } = 200;

    [ProtoMember(7)]
    public double CruiseAltitudeMeters { get; set; }

    [ProtoMember(8)]
    public double EffectiveRangeMeters { get; set; }
}

[ProtoContract]
public class SituationEvent
{
    [ProtoMember(1)]
    public string EventType { get; set; } = string.Empty;

    [ProtoMember(2)]
    public string TrackId { get; set; } = string.Empty;

    [ProtoMember(3)]
    public string TargetTrackId { get; set; } = string.Empty;

    [ProtoMember(4)]
    public string Notes { get; set; } = string.Empty;
}

[ProtoContract]
public sealed class SimulatorEvent : SituationEvent
{
}
