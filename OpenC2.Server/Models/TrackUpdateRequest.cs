namespace OpenC2.Server.Models;

public sealed class TrackUpdateRequest
{
    public string VehicleType { get; set; } = string.Empty;
    public string Classification { get; set; } = string.Empty;
    public string Affiliation { get; set; } = string.Empty;
    public string AlertLevel { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Operator { get; set; } = "Control Alpha";
    public string Notes { get; set; } = string.Empty;
}
