namespace OpenC2.Server.Models;

public sealed class Track
{
    public string Id { get; set; } = string.Empty;
    public string Callsign { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string VehicleType { get; set; } = string.Empty;
    public string Classification { get; set; } = string.Empty;
    public string Affiliation { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string AlertLevel { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double AltitudeMeters { get; set; }
    public double SpeedMetersPerSecond { get; set; }
    public double GroundSpeedMetersPerSecond { get; set; }
    public double VerticalSpeedMetersPerSecond { get; set; }
    public double BatteryMinutes { get; set; }
    public double HeadingDegrees { get; set; }
    public double Confidence { get; set; }
    public string Behavior { get; set; } = string.Empty;
    public double? CommandLatitude { get; set; }
    public double? CommandLongitude { get; set; }
    public string CommandTargetTrackId { get; set; } = string.Empty;
    public double? CommandRadiusMeters { get; set; }
    public double? CommandCruiseAltitudeMeters { get; set; }
    public double? CommandEffectiveRangeMeters { get; set; }
    public DateTimeOffset LastUpdateUtc { get; set; } = DateTimeOffset.UtcNow;
}
