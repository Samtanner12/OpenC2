using ProtoBuf;

namespace OpenC2.Simulator.Models;

[ProtoContract]
public sealed class SimulatorEvent
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
