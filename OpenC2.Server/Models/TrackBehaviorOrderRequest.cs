namespace OpenC2.Server.Models;

public sealed class TrackBehaviorOrderRequest
{
    public string Behavior { get; set; } = string.Empty;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string TargetTrackId { get; set; } = string.Empty;
    public double? StandoffRadiusMeters { get; set; }
    public double? CruiseAltitudeMeters { get; set; }
    public string Operator { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public bool OptimizeAltitude { get; set; } = true;
}
