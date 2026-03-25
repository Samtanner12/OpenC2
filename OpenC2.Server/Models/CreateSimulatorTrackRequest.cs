namespace OpenC2.Server.Models;

public sealed class CreateSimulatorTrackRequest
{
    public string Callsign { get; set; } = string.Empty;
    public string VehicleType { get; set; } = "Quadcopter";
    public string Classification { get; set; } = "Unknown";
    public string Affiliation { get; set; } = "Unknown";
    public string AlertLevel { get; set; } = "Elevated";
    public string Status { get; set; } = "Tracking";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double AltitudeMeters { get; set; } = 120;
    public double SpeedMetersPerSecond { get; set; } = 10;
    public double BatteryMinutes { get; set; } = 28;
    public double HeadingDegrees { get; set; }
}
