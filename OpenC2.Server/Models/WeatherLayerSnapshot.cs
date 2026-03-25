namespace OpenC2.Server.Models;

public sealed class WeatherLayerSnapshot
{
    public string Id { get; set; } = string.Empty;
    public double AltitudeMeters { get; set; }
    public double WindSpeedMs { get; set; }
    public double WindDirectionDegrees { get; set; }
    public double? CloudCoverPercent { get; set; }
}
