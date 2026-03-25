namespace OpenC2.Server.Models;

public sealed class MoveOptimizationResult
{
    public double CruiseAltitudeMeters { get; set; }
    public double EffectiveRangeMeters { get; set; }
    public double HeadwindComponentMs { get; set; }
    public string Source { get; set; } = string.Empty;
}
