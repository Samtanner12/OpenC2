using ProtoBuf;

namespace OpenC2.Simulator.Models;

[ProtoContract]
public sealed class SimulatorFrame
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
    public SimulatorEvent? Event { get; set; }
}
