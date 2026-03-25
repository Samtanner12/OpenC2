using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using OpenC2.Server.Hubs;

namespace OpenC2.Server.Services;

public sealed class AirPictureBroadcastService : BackgroundService
{
    private readonly Channel<bool> _signalChannel = Channel.CreateUnbounded<bool>();
    private readonly IHubContext<AirPictureHub> _hubContext;
    private readonly ILogger<AirPictureBroadcastService> _logger;
    private readonly TrackStateStore _store;

    public AirPictureBroadcastService(
        IHubContext<AirPictureHub> hubContext,
        ILogger<AirPictureBroadcastService> logger,
        TrackStateStore store)
    {
        _hubContext = hubContext;
        _logger = logger;
        _store = store;
        _store.SnapshotChanged += OnSnapshotChanged;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await PublishSnapshotAsync(stoppingToken);

        await foreach (var _ in _signalChannel.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await PublishSnapshotAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to publish air picture snapshot.");
            }
        }
    }

    public override void Dispose()
    {
        _store.SnapshotChanged -= OnSnapshotChanged;
        base.Dispose();
    }

    private void OnSnapshotChanged()
    {
        _signalChannel.Writer.TryWrite(true);
    }

    private Task PublishSnapshotAsync(CancellationToken cancellationToken)
    {
        var snapshot = _store.GetSnapshot();
        return _hubContext.Clients.All.SendAsync("airPictureUpdated", snapshot, cancellationToken);
    }
}
