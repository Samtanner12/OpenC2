# Simulator sender

Run the sender app in a separate terminal after the ASP.NET backend is up:

```powershell
dotnet run --project OpenC2.Simulator
```

Optional host and port:

```powershell
dotnet run --project OpenC2.Simulator -- 127.0.0.1 5055
```

What it does:

- Opens a TCP connection to the backend listener.
- Emits three randomized track feeds once per second.
- Uses the same length-prefixed protobuf frame contract documented in `docs/SIMULATOR_TRANSPORT.md`.
