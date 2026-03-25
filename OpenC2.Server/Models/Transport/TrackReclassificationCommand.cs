using ProtoBuf;

namespace OpenC2.Server.Models.Transport;

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
