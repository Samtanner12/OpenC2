namespace OpenC2.Server.Models;

public sealed class WeatherSnapshot
{
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double AltitudeMeters { get; set; }
    public double CurrentTemperatureC { get; set; }
    public double CurrentWindSpeedMs { get; set; }
    public double CurrentWindDirectionDegrees { get; set; }
    public double CurrentCloudCoverPercent { get; set; }
    public double AltitudeWindSpeedMs { get; set; }
    public double AltitudeWindDirectionDegrees { get; set; }
    public double AltitudeCloudCoverPercent { get; set; }
    public double AltitudeLayerMeters { get; set; }
    public double LowCloudCoverPercent { get; set; }
    public double MidCloudCoverPercent { get; set; }
    public double HighCloudCoverPercent { get; set; }
    public IReadOnlyList<WeatherLayerSnapshot> Layers { get; set; } = [];
    public string Source { get; set; } = string.Empty;
    public DateTimeOffset GeneratedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
