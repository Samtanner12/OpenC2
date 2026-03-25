namespace OpenC2.Server.Models;

public sealed class TransportStatus
{
    public int TcpPort { get; set; }
    public bool ListenerOnline { get; set; }
    public int ConnectedClients { get; set; }
    public DateTimeOffset? LastMessageUtc { get; set; }
    public string LastError { get; set; } = string.Empty;
}
