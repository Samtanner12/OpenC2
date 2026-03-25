namespace OpenC2.Server.Models;

public sealed class OperatorActionLogEntry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public DateTimeOffset TimestampUtc { get; set; } = DateTimeOffset.UtcNow;
    public string TrackId { get; set; } = string.Empty;
    public string CommandId { get; set; } = string.Empty;
    public string CommandLabel { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Operator { get; set; } = "Control Alpha";
}
