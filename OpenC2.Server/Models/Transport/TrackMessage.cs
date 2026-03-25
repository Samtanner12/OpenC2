using ProtoBuf;

namespace OpenC2.Server.Models.Transport;

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
