# Print Karo — Machine Agent

Turns a Windows PC (and, unchanged, a Raspberry Pi) into a Print Karo vending
machine. The backend never knows which hardware is connected — both speak the
identical machine protocol.

## Architecture (Hexagonal)

```
            ┌──────────────────────────────────────────────┐
            │                 Agent Core                    │
            │  bootstrap → MachineAgent (loops)             │
            │    ├─ HeartbeatBuilder                        │
            │    ├─ MachineApiClient (JWT login/refresh)    │
            │    └─ AgentLogger (buffered upload)           │
            └───────────────┬───────────────┬──────────────┘
                            │ PORT          │
                   ┌────────▼─────────┐     │
                   │  PrinterPort     │     │ systeminformation
                   └────────┬─────────┘     │ (cpu/ram/disk/temp/net)
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  WindowsAdapter      CupsAdapter       SimulatorAdapter
  (Get-Printer)       (lpstat — Pi)     (CI / no hardware)
```

**The only thing that differs between Windows and Raspberry Pi is the printer
adapter** (`printer.factory.ts` selects it). The agent core, protocol, and
backend are byte-for-byte identical.

## Run (Windows, Electron tray app)

```bash
cp .env.example .env   # set PK_MACHINE_ID / PK_MACHINE_SECRET from registration
pnpm --filter @print-karo/machine-agent build
pnpm --filter @print-karo/machine-agent start   # launches Electron tray daemon
```

Features: auto-start on login, single-instance, system-tray status/control,
auto-reconnect (exponential backoff), JWT login + refresh-rotation, 30s
heartbeat, queue polling, buffered log upload, server-driven config.

## Run (Raspberry Pi, systemd)

The Pi build reuses the same `dist/` core via `scripts/install-systemd.sh`
(no Electron). See that script — it calls the same `bootstrapAgent()`.

## What this sprint does NOT do

No printing, files, payments or PIN — those are Sprint 4. The queue loop polls
and acknowledges readiness only; the printer layer detects + reports status.
