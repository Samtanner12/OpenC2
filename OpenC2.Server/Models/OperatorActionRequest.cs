namespace OpenC2.Server.Models;

public sealed class OperatorActionRequest
{
    public string TrackId { get; set; } = string.Empty;
    public string CommandId { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Operator { get; set; } = "Control Alpha";
}
