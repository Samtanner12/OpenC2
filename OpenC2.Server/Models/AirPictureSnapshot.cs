namespace OpenC2.Server.Models;

public sealed class AirPictureSnapshot
{
    public DateTimeOffset GeneratedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public IReadOnlyList<Track> Tracks { get; set; } = Array.Empty<Track>();
    public IReadOnlyList<ProtectedSite> ProtectedSites { get; set; } = Array.Empty<ProtectedSite>();
    public IReadOnlyList<CommandDefinition> AvailableCommands { get; set; } = Array.Empty<CommandDefinition>();
    public IReadOnlyList<OperatorActionLogEntry> ActionLog { get; set; } = Array.Empty<OperatorActionLogEntry>();
    public TransportStatus TransportStatus { get; set; } = new();
}
