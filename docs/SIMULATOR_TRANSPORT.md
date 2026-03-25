# Simulator transport

The ASP.NET backend listens for simulator traffic on TCP port `5055`.

Each frame is encoded as:

1. A 4-byte little-endian integer payload length.
2. A protobuf payload matching the umbrella schema [`simulator-track.proto`](./simulator-track.proto).

The schema source is split into focused files under [`docs/proto/`](./proto/):

- `common.proto`
- `command.proto`
- `events.proto`
- `objects.proto`
- `situation.proto`
- `legacy-track.proto`
- `envelope.proto`

The backend deserializes each frame into `TrackMessage` and updates the in-memory air picture.

Example send flow:

```text
[length: 4 bytes little-endian][protobuf bytes]
```

Important notes:

- `trackId` is the stable key used to upsert tracks.
- Empty `trackId` values are ignored.
- Frames larger than 1 MB are rejected.
- If a client disconnects mid-frame, the frame is discarded and the connection is closed.
