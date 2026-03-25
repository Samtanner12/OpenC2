using ProtoBuf;

namespace OpenC2.Server.Models.Transport;

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
