using ProtoBuf;

namespace OpenC2.Server.Models.Transport;

[ProtoContract]
public sealed class DeleteTrackCommand
{
    [ProtoMember(1)]
    public string TrackId { get; set; } = string.Empty;
}
