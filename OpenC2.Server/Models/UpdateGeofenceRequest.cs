namespace OpenC2.Server.Models;

public sealed class UpdateGeofenceRequest
{
    public string Name { get; set; } = string.Empty;
    public double RadiusMeters { get; set; }
    public string Posture { get; set; } = string.Empty;
}
