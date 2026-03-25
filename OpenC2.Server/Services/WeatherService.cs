using System.Text.Json;
using OpenC2.Server.Models;

namespace OpenC2.Server.Services;

public sealed class WeatherService
{
    private static readonly string[] PressureLevels = ["1000", "975", "950", "925", "900", "875", "850"];
    private const double SurfaceLayerAltitudeMeters = 30d;
    private const double RangeReserveFactor = 0.8d;
    private readonly HttpClient _httpClient;

    public WeatherService(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<WeatherSnapshot> GetWeatherAsync(double latitude, double longitude, double altitudeMeters, CancellationToken cancellationToken)
    {
        var hourlyParameters = new List<string>
        {
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high"
        };

        foreach (var level in PressureLevels)
        {
            hourlyParameters.Add($"wind_speed_{level}hPa");
            hourlyParameters.Add($"wind_direction_{level}hPa");
            hourlyParameters.Add($"cloud_cover_{level}hPa");
            hourlyParameters.Add($"geopotential_height_{level}hPa");
        }

        var requestUri =
            $"https://api.open-meteo.com/v1/gfs?latitude={latitude:F6}&longitude={longitude:F6}" +
            $"&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover" +
            $"&hourly={string.Join(',', hourlyParameters)}&forecast_hours=1&wind_speed_unit=ms&timezone=GMT";

        using var response = await _httpClient.GetAsync(requestUri, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var current = root.GetProperty("current");
        var hourly = root.GetProperty("hourly");

        var layers = BuildWeatherLayers(hourly, current);
        var bestLevel = layers
            .OrderBy(level => Math.Abs(level.Height - altitudeMeters))
            .First();

        return new WeatherSnapshot
        {
            Latitude = latitude,
            Longitude = longitude,
            AltitudeMeters = altitudeMeters,
            CurrentTemperatureC = current.GetProperty("temperature_2m").GetDouble(),
            CurrentWindSpeedMs = current.GetProperty("wind_speed_10m").GetDouble(),
            CurrentWindDirectionDegrees = current.GetProperty("wind_direction_10m").GetDouble(),
            CurrentCloudCoverPercent = current.GetProperty("cloud_cover").GetDouble(),
            AltitudeWindSpeedMs = bestLevel.WindSpeed,
            AltitudeWindDirectionDegrees = bestLevel.WindDirection,
            AltitudeCloudCoverPercent = bestLevel.CloudCover ?? current.GetProperty("cloud_cover").GetDouble(),
            AltitudeLayerMeters = bestLevel.Height,
            LowCloudCoverPercent = GetFirstHourlyValue(hourly, "cloud_cover_low"),
            MidCloudCoverPercent = GetFirstHourlyValue(hourly, "cloud_cover_mid"),
            HighCloudCoverPercent = GetFirstHourlyValue(hourly, "cloud_cover_high"),
            Layers = layers
                .OrderBy(layer => layer.Height)
                .Select(layer => new WeatherLayerSnapshot
                {
                    Id = layer.Level,
                    AltitudeMeters = layer.Height,
                    WindSpeedMs = layer.WindSpeed,
                    WindDirectionDegrees = layer.WindDirection,
                    CloudCoverPercent = layer.CloudCover
                })
                .ToArray(),
            Source = "Open-Meteo GFS",
            GeneratedAtUtc = DateTimeOffset.UtcNow
        };
    }

    public async Task<MoveOptimizationResult> OptimizeMoveAltitudeAsync(
        string vehicleType,
        double maxSpeedMs,
        double batteryMinutes,
        double currentLatitude,
        double currentLongitude,
        double currentAltitudeMeters,
        double destinationLatitude,
        double destinationLongitude,
        CancellationToken cancellationToken)
    {
        var requestUri =
            $"https://api.open-meteo.com/v1/gfs?latitude={currentLatitude:F6}&longitude={currentLongitude:F6}" +
            $"&current=wind_speed_10m,wind_direction_10m,cloud_cover" +
            $"&hourly={string.Join(',', PressureLevels.SelectMany(level => new[] {$"wind_speed_{level}hPa", $"wind_direction_{level}hPa", $"geopotential_height_{level}hPa", $"cloud_cover_{level}hPa"}))}" +
            $"&forecast_hours=1&wind_speed_unit=ms&timezone=GMT";

        using var response = await _httpClient.GetAsync(requestUri, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement;
        var current = root.GetProperty("current");
        var hourly = root.GetProperty("hourly");
        var courseDegrees = CalculateBearingDegrees(currentLatitude, currentLongitude, destinationLatitude, destinationLongitude);
        var layers = BuildWeatherLayers(hourly, current);
        var performance = GetVehiclePerformance(vehicleType, maxSpeedMs, batteryMinutes);

        var bestCandidate = layers
            .Select(layer => new
            {
                AltitudeMeters = layer.Height,
                EffectiveRangeMeters = EstimateReachMetersForLayer(
                    performance,
                    currentAltitudeMeters,
                    layer.Height,
                    layer.WindSpeed,
                    layer.WindDirection,
                    courseDegrees),
                HeadwindComponentMs = GetAlongTrackWindComponentMs(layer.WindSpeed, layer.WindDirection, courseDegrees)
            })
            .OrderByDescending(candidate => candidate.EffectiveRangeMeters)
            .ThenBy(candidate => Math.Abs(candidate.AltitudeMeters - currentAltitudeMeters))
            .First();

        return new MoveOptimizationResult
        {
            CruiseAltitudeMeters = bestCandidate.AltitudeMeters,
            EffectiveRangeMeters = bestCandidate.EffectiveRangeMeters,
            HeadwindComponentMs = bestCandidate.HeadwindComponentMs,
            Source = "Open-Meteo GFS altitude optimization"
        };
    }

    private static double GetFirstHourlyValue(JsonElement hourly, string propertyName)
    {
        return hourly.GetProperty(propertyName)[0].GetDouble();
    }

    private static IReadOnlyList<(string Level, double Height, double WindSpeed, double WindDirection, double? CloudCover)> BuildWeatherLayers(
        JsonElement hourly,
        JsonElement current)
    {
        return PressureLevels
            .Select(level => (
                Level: level,
                Height: GetFirstHourlyValue(hourly, $"geopotential_height_{level}hPa"),
                WindSpeed: GetFirstHourlyValue(hourly, $"wind_speed_{level}hPa"),
                WindDirection: GetFirstHourlyValue(hourly, $"wind_direction_{level}hPa"),
                CloudCover: (double?)GetFirstHourlyValue(hourly, $"cloud_cover_{level}hPa")))
            .Append((
                Level: "surface",
                Height: SurfaceLayerAltitudeMeters,
                WindSpeed: current.GetProperty("wind_speed_10m").GetDouble(),
                WindDirection: current.GetProperty("wind_direction_10m").GetDouble(),
                CloudCover: (double?)current.GetProperty("cloud_cover").GetDouble()))
            .OrderBy(layer => layer.Height)
            .ToArray();
    }

    private static (double TopSpeedMs, double BatteryMinutes, double ClimbRateMs, double DescentRateMs) GetVehiclePerformance(
        string vehicleType,
        double maxSpeedMs,
        double batteryMinutes)
    {
        var normalizedTopSpeedMs = Math.Max(0, maxSpeedMs);
        var normalizedBatteryMinutes = Math.Max(5, batteryMinutes);
        var normalizedType = vehicleType?.Trim() ?? string.Empty;

        return normalizedType switch
        {
            "Fixed Wing" => (normalizedTopSpeedMs, normalizedBatteryMinutes, 7d, 9d),
            "Helicopter" => (normalizedTopSpeedMs, normalizedBatteryMinutes, 5d, 6d),
            "Ground Vehicle" => (normalizedTopSpeedMs, normalizedBatteryMinutes, 0d, 0d),
            _ => (normalizedTopSpeedMs, normalizedBatteryMinutes, 4d, 6d)
        };
    }

    private static double EstimateReachMetersForLayer(
        (double TopSpeedMs, double BatteryMinutes, double ClimbRateMs, double DescentRateMs) performance,
        double currentAltitudeMeters,
        double candidateAltitudeMeters,
        double windSpeedMs,
        double windFromBearingDegrees,
        double trackBearingDegrees)
    {
        var enduranceSeconds = performance.BatteryMinutes * 60d * RangeReserveFactor;
        if (enduranceSeconds <= 0 || performance.TopSpeedMs <= 0)
        {
            return 0;
        }

        var altitudeDeltaMeters = candidateAltitudeMeters - currentAltitudeMeters;
        var transitionTimeSeconds = 0d;
        var transitionGroundDistanceMeters = 0d;
        if (Math.Abs(altitudeDeltaMeters) > 1)
        {
            var climbing = altitudeDeltaMeters > 0;
            var verticalRateMs = climbing ? performance.ClimbRateMs : performance.DescentRateMs;
            if (verticalRateMs <= 0)
            {
                return 0;
            }

            transitionTimeSeconds = Math.Abs(altitudeDeltaMeters) / verticalRateMs;
            var transitionHorizontalAirspeedMs = climbing
                ? Math.Sqrt(Math.Max(0, (performance.TopSpeedMs * performance.TopSpeedMs) - (verticalRateMs * verticalRateMs)))
                : performance.TopSpeedMs;
            var transitionGroundSpeedMs = CalculateWindCorrectedGroundSpeedMs(
                transitionHorizontalAirspeedMs,
                windSpeedMs,
                (windFromBearingDegrees + 180d) % 360d,
                trackBearingDegrees);
            transitionGroundDistanceMeters = transitionGroundSpeedMs * Math.Min(enduranceSeconds, transitionTimeSeconds);
        }

        var remainingEnduranceSeconds = Math.Max(0, enduranceSeconds - transitionTimeSeconds);
        var cruiseGroundSpeedMs = CalculateWindCorrectedGroundSpeedMs(
            performance.TopSpeedMs,
            windSpeedMs,
            (windFromBearingDegrees + 180d) % 360d,
            trackBearingDegrees);

        return transitionGroundDistanceMeters + (cruiseGroundSpeedMs * remainingEnduranceSeconds);
    }

    private static double GetAlongTrackWindComponentMs(double windSpeedMs, double windFromBearingDegrees, double trackBearingDegrees)
    {
        var windToBearingDegrees = (windFromBearingDegrees + 180d) % 360d;
        var relativeRadians = (windToBearingDegrees - trackBearingDegrees) * Math.PI / 180.0;
        return Math.Cos(relativeRadians) * windSpeedMs;
    }

    private static double CalculateBearingDegrees(double latitudeA, double longitudeA, double latitudeB, double longitudeB)
    {
        var lat1 = latitudeA * Math.PI / 180.0;
        var lat2 = latitudeB * Math.PI / 180.0;
        var deltaLon = (longitudeB - longitudeA) * Math.PI / 180.0;
        var y = Math.Sin(deltaLon) * Math.Cos(lat2);
        var x = Math.Cos(lat1) * Math.Sin(lat2) - Math.Sin(lat1) * Math.Cos(lat2) * Math.Cos(deltaLon);
        return (Math.Atan2(y, x) * 180.0 / Math.PI + 360.0) % 360.0;
    }

    private static double CalculateWindCorrectedGroundSpeedMs(
        double airspeedMs,
        double windSpeedMs,
        double windToBearingDegrees,
        double trackBearingDegrees)
    {
        var relativeRadians = (windToBearingDegrees - trackBearingDegrees) * Math.PI / 180.0;
        var alongTrackWindMs = Math.Cos(relativeRadians) * windSpeedMs;
        var crosswindMs = Math.Sin(relativeRadians) * windSpeedMs;

        if (Math.Abs(crosswindMs) >= airspeedMs)
        {
            return Math.Max(0, alongTrackWindMs);
        }

        var correctedAirspeedAlongTrackMs = Math.Sqrt((airspeedMs * airspeedMs) - (crosswindMs * crosswindMs));
        return Math.Max(0, alongTrackWindMs + correctedAirspeedAlongTrackMs);
    }
}
