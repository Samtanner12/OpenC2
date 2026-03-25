namespace OpenC2.Server.Models;

public sealed class CreateGeofenceRequest
{
    public string Name { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double RadiusMeters { get; set; } = 1000;
    public string Posture { get; set; } = "Geofence";
}
