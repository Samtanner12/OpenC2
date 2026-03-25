using ProtoBuf;

namespace OpenC2.Simulator.Models;

[ProtoContract]
public sealed class DeleteTrackCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;
}
