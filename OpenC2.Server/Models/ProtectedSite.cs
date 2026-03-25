namespace OpenC2.Server.Models;

public sealed class ProtectedSite
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double RadiusMeters { get; set; }
    public string Posture { get; set; } = string.Empty;
}
