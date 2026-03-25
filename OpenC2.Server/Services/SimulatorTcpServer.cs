using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using OpenC2.Transport;
using ProtoBuf;

namespace OpenC2.Server.Services;

public sealed class SimulatorTcpServer : BackgroundService
{
    private sealed class ClientSession
    {
        public required TcpClient Client { get; init; }
        public required NetworkStream Stream { get; init; }
        public SemaphoreSlim WriteLock { get; } = new(1, 1);
    }

    private readonly ILogger<SimulatorTcpServer> _logger;
    private readonly TrackStateStore _store;
    private readonly ConcurrentDictionary<int, ClientSession> _sessions = new();
    private TcpListener? _listener;
    private int _connectedClients;
    private int _nextSessionId;

    public SimulatorTcpServer(ILogger<SimulatorTcpServer> logger, TrackStateStore store)
    {
        _logger = logger;
        _store = store;
        _store.SimulatorReclassificationRequested += command => _ = BroadcastReclassificationAsync(command);
        _store.SimulatorSpawnRequested += command => _ = BroadcastSpawnTrackAsync(command);
        _store.SimulatorDeleteRequested += command => _ = BroadcastDeleteTrackAsync(command);
        _store.SimulatorBehaviorOrderRequested += command => _ = BroadcastBehaviorOrderAsync(command);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        const int tcpPort = 5055;
        _listener = new TcpListener(IPAddress.Any, tcpPort);
        _listener.Start();

        _store.UpdateTransportStatus(status =>
        {
            status.TcpPort = tcpPort;
            status.ListenerOnline = true;
        });

        _logger.LogInformation("Simulator TCP listener started on port {Port}", tcpPort);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(stoppingToken);
                _ = HandleClientAsync(client, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Simulator TCP listener failed.");
            _store.UpdateTransportStatus(status => status.LastError = ex.Message);
        }
        finally
        {
            _listener.Stop();
            _store.UpdateTransportStatus(status => status.ListenerOnline = false);
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken stoppingToken)
    {
        var remoteEndpoint = client.Client.RemoteEndPoint?.ToString() ?? "unknown";
        var sessionId = Interlocked.Increment(ref _nextSessionId);
        Interlocked.Increment(ref _connectedClients);
        _store.UpdateTransportStatus(status => status.ConnectedClients = _connectedClients);
        _logger.LogInformation("Simulator client connected from {RemoteEndpoint}", remoteEndpoint);

        try
        {
            var stream = client.GetStream();
            var session = new ClientSession
            {
                Client = client,
                Stream = stream
            };
            _sessions[sessionId] = session;
            var lengthBuffer = new byte[4];

            while (!stoppingToken.IsCancellationRequested && client.Connected)
            {
                var bytesRead = await ReadExactlyAsync(stream, lengthBuffer, stoppingToken);
                if (bytesRead == 0)
                {
                    break;
                }

                var payloadLength = BinaryPrimitives.ReadInt32LittleEndian(lengthBuffer);
                if (payloadLength <= 0 || payloadLength > 1024 * 1024)
                {
                    throw new InvalidDataException($"Invalid payload length {payloadLength}.");
                }

                var payload = new byte[payloadLength];
                var payloadBytesRead = await ReadExactlyAsync(stream, payload, stoppingToken);
                if (payloadBytesRead != payloadLength)
                {
                    throw new EndOfStreamException("The simulator closed the connection mid-frame.");
                }

                using var payloadStream = new MemoryStream(payload, writable: false);
                var frame = Serializer.Deserialize<TransportEnvelope>(payloadStream);
                if (frame.Event is not null)
                {
                    _store.HandleSituationEvent(frame.Event);
                }

                if (frame.SituationUpdate is not null)
                {
                    foreach (var situationEvent in frame.SituationUpdate.Events)
                    {
                        _store.HandleSituationEvent(situationEvent);
                    }

                    foreach (var trackedObject in frame.SituationUpdate.TrackedObjects)
                    {
                        if (!string.IsNullOrWhiteSpace(trackedObject.TrackId))
                        {
                            _store.UpsertTrackedObject(trackedObject);
                        }
                    }
                }

                var message = frame.Track;
                if (message is null || string.IsNullOrWhiteSpace(message.TrackId))
                {
                    continue;
                }

                _store.UpsertTrack(message);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Simulator client {RemoteEndpoint} disconnected with an error.", remoteEndpoint);
            _store.UpdateTransportStatus(status => status.LastError = ex.Message);
        }
        finally
        {
            _sessions.TryRemove(sessionId, out _);
            client.Close();
            Interlocked.Decrement(ref _connectedClients);
            _store.UpdateTransportStatus(status => status.ConnectedClients = _connectedClients);
            _logger.LogInformation("Simulator client disconnected from {RemoteEndpoint}", remoteEndpoint);
        }
    }

    private async Task BroadcastReclassificationAsync(TrackReclassificationCommand command)
    {
        if (_sessions.IsEmpty)
        {
            return;
        }

        var frame = new TransportEnvelope
        {
            Reclassification = command
        };

        foreach (var (_, session) in _sessions)
        {
            try
            {
                await SendAsync(session, frame);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send reclassification for track {TrackId} to simulator client.", command.TrackId);
            }
        }
    }

    private async Task BroadcastSpawnTrackAsync(SpawnTrackCommand command)
    {
        if (_sessions.IsEmpty)
        {
            return;
        }

        var frame = new TransportEnvelope
        {
            SpawnTrack = command
        };

        foreach (var (_, session) in _sessions)
        {
            try
            {
                await SendAsync(session, frame);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send spawn command for track {TrackId} to simulator client.", command.TrackId);
            }
        }
    }

    private async Task BroadcastDeleteTrackAsync(DeleteTrackCommand command)
    {
        if (_sessions.IsEmpty)
        {
            return;
        }

        var frame = new TransportEnvelope
        {
            DeleteTrack = command
        };

        foreach (var (_, session) in _sessions)
        {
            try
            {
                await SendAsync(session, frame);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send delete command for track {TrackId} to simulator client.", command.TrackId);
            }
        }
    }

    private async Task BroadcastBehaviorOrderAsync(TrackBehaviorOrderCommand command)
    {
        if (_sessions.IsEmpty)
        {
            return;
        }

        var frame = new TransportEnvelope
        {
            BehaviorOrder = command
        };

        foreach (var (_, session) in _sessions)
        {
            try
            {
                await SendAsync(session, frame);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send behavior order for track {TrackId} to simulator client.", command.TrackId);
            }
        }
    }

    private static async Task SendAsync(ClientSession session, TransportEnvelope frame)
    {
        using var payloadStream = new MemoryStream();
        Serializer.Serialize(payloadStream, frame);

        var payload = payloadStream.ToArray();
        var lengthPrefix = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(lengthPrefix, payload.Length);

        await session.WriteLock.WaitAsync();
        try
        {
            await session.Stream.WriteAsync(lengthPrefix);
            await session.Stream.WriteAsync(payload);
            await session.Stream.FlushAsync();
        }
        finally
        {
            session.WriteLock.Release();
        }
    }

    private static async Task<int> ReadExactlyAsync(Stream stream, byte[] buffer, CancellationToken cancellationToken)
    {
        var totalRead = 0;

        while (totalRead < buffer.Length)
        {
            var bytesRead = await stream.ReadAsync(buffer.AsMemory(totalRead, buffer.Length - totalRead), cancellationToken);
            if (bytesRead == 0)
            {
                return totalRead;
            }

            totalRead += bytesRead;
        }

        return totalRead;
    }
}
