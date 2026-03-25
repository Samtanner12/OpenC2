using ProtoBuf;

namespace OpenC2.Simulator.Models;

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
