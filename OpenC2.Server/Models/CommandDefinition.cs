namespace OpenC2.Server.Models;

public sealed class CommandDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Intent { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
}
