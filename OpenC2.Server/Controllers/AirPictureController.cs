using Microsoft.AspNetCore.Mvc;
using OpenC2.Server.Models;
using OpenC2.Server.Services;

namespace OpenC2.Server.Controllers;

[ApiController]
[Route("api/air-picture")]
public sealed class AirPictureController : ControllerBase
{
    private readonly TrackStateStore _store;
    private readonly WeatherService _weatherService;

    public AirPictureController(TrackStateStore store, WeatherService weatherService)
    {
        _store = store;
        _weatherService = weatherService;
    }

    [HttpGet]
    public ActionResult<AirPictureSnapshot> GetSnapshot()
    {
        return Ok(_store.GetSnapshot());
    }

    [HttpGet("weather")]
    public async Task<ActionResult<WeatherSnapshot>> GetWeather(
        [FromQuery] double latitude,
        [FromQuery] double longitude,
        [FromQuery] double altitudeMeters,
        CancellationToken cancellationToken)
    {
        var weather = await _weatherService.GetWeatherAsync(latitude, longitude, altitudeMeters, cancellationToken);
        return Ok(weather);
    }

    [HttpPost("actions")]
    public ActionResult<OperatorActionLogEntry> RecordAction([FromBody] OperatorActionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TrackId) || string.IsNullOrWhiteSpace(request.CommandId))
        {
            return BadRequest("TrackId and CommandId are required.");
        }

        try
        {
            return Ok(_store.RecordAction(request));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("geofences")]
    public ActionResult<ProtectedSite> CreateGeofence([FromBody] CreateGeofenceRequest request)
    {
        if (request.RadiusMeters <= 0)
        {
            return BadRequest("RadiusMeters must be greater than zero.");
        }

        return Ok(_store.CreateGeofence(request));
    }

    [HttpPost("tracks")]
    public ActionResult<Track> CreateSimulatorTrack([FromBody] CreateSimulatorTrackRequest request)
    {
        if (!_store.HasConnectedSimulatorClients())
        {
            return BadRequest("A simulator client must be connected before creating a live track.");
        }

        try
        {
            return Ok(_store.CreateSimulatorTrack(request));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpDelete("tracks/{trackId}")]
    public IActionResult DeleteTrack(string trackId)
    {
        try
        {
            _store.DeleteTrack(trackId);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost("tracks/{trackId}/behavior")]
    public async Task<ActionResult<Track>> OrderTrackBehavior(string trackId, [FromBody] TrackBehaviorOrderRequest request, CancellationToken cancellationToken)
    {
        try
        {
            MoveOptimizationResult? optimization = null;
            if (request.OptimizeAltitude &&
                request.Behavior.Equals("Move To Position", StringComparison.OrdinalIgnoreCase) &&
                request.Latitude.HasValue &&
                request.Longitude.HasValue &&
                !request.CruiseAltitudeMeters.HasValue)
            {
                var track = _store.FindTrack(trackId);
                if (track is not null)
                {
                    optimization = await _weatherService.OptimizeMoveAltitudeAsync(
                        track.VehicleType,
                        track.SpeedMetersPerSecond,
                        track.BatteryMinutes,
                        track.Latitude,
                        track.Longitude,
                        track.AltitudeMeters,
                        request.Latitude.Value,
                        request.Longitude.Value,
                        cancellationToken);
                }
            }

            return Ok(_store.OrderTrackBehavior(trackId, request, optimization));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPut("geofences/{siteId}")]
    public ActionResult<ProtectedSite> UpdateGeofence(string siteId, [FromBody] UpdateGeofenceRequest request)
    {
        if (request.RadiusMeters <= 0)
        {
            return BadRequest("RadiusMeters must be greater than zero.");
        }

        try
        {
            return Ok(_store.UpdateGeofence(siteId, request));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPut("tracks/{trackId}")]
    public ActionResult<Track> UpdateTrack(string trackId, [FromBody] TrackUpdateRequest request)
    {
        try
        {
            return Ok(_store.UpdateTrack(trackId, request));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }
}
