# Print Karo — Machine Communication Protocol & Lifecycles

**Document owner:** DevOps / Edge Architect
**Status:** v1.0 · 2026-06-30
**Covers deliverables:** 11 Machine Communication Protocol · 12 Heartbeat Design · 13 Print Job Lifecycle · 14 Health Monitoring · 15 Queue Management · 16 File Lifecycle · 17 Payment Lifecycle

---

## 1. Machine Communication Protocol (deliverable 11)

### 1.1 Transport split (control plane vs data plane)

| Channel | Transport | Carries | Why |
|---------|-----------|---------|-----|
| **Control** | **MQTT over TLS (8883)** | heartbeat, commands, status, acks | Tiny, frequent, NAT/firewall-friendly, broker fans out to 1,000s of devices natively |
| **Data** | **HTTPS + presigned R2 URLs** | file download, large job confirms | Heavy bytes must bypass both the API process and the broker |
| **Fallback** | **HTTPS polling** | heartbeat + command pull | Survives networks that block MQTT (some campus firewalls) |

> The agent is **MQTT-first with HTTPS fallback**. If the broker is unreachable, it degrades to polling `/machine/heartbeat` and `/machine/commands/next` — no functionality is lost, only latency increases.

### 1.2 MQTT topic namespace

All device topics are scoped under `pk/m/{machineId}/…`. The broker ACL **restricts each machine to its own subtree**, so a compromised machine cannot read or write another's topics.

```
Device → Cloud (machine publishes):
  pk/m/{machineId}/heartbeat        QoS0   health every 15s
  pk/m/{machineId}/status           QoS1   printer state changes (jam, paper out)
  pk/m/{machineId}/cmd-ack          QoS1   acknowledgement of a command
  pk/m/{machineId}/event            QoS1   job events (downloading/printing/done/fail)

Cloud → Device (backend publishes):
  pk/m/{machineId}/cmd              QoS1   commands (PRINT, REBOOT, MAINTENANCE…)
  pk/m/{machineId}/config           QoS1, retained   latest config push

Presence (broker-managed):
  pk/m/{machineId}/presence         retained + LWT  "online"/"offline"
```

- **Last Will & Testament (LWT):** on connect, the agent registers an LWT that publishes `offline` to `presence` if the TCP connection drops. The backend treats that as an immediate offline signal — faster than waiting for heartbeat timeout.
- **QoS:** heartbeat is QoS 0 (lossy is fine, the next one is 15s away); commands and acks are QoS 1 (at-least-once, idempotent on `commandId`).
- **Retained config:** a machine that reconnects immediately receives the latest config without a round trip.

### 1.3 Authentication on the bus
MQTT username = `mqttUsername`, password = device secret/token (see [API §2.2](api-specification.md)). Broker ACL pins each identity to `pk/m/{itsOwnMachineId}/#`. The backend connects as a privileged identity that may publish to `…/cmd` and subscribe to all device-published topics.

---

## 2. Heartbeat Design (deliverable 12)

### 2.1 What's in a heartbeat

Published to `pk/m/{machineId}/heartbeat` every **15 s** (`PK_HEARTBEAT_INTERVAL_MS`):

```jsonc
{
  "machineId": "cuid",
  "ts": "2026-06-30T10:00:00Z",
  "agentVersion": "1.4.2",
  "platform": "windows",           // or "linux-arm"
  "printer": {
    "connected": true,
    "status": "READY",             // READY|BUSY|PAPER_OUT|TONER_LOW|JAMMED|ERROR|DISCONNECTED
    "model": "HP LaserJet M404"
  },
  "consumables": { "paperSheets": 180, "tonerPct": 64 },
  "localQueue": 0,
  "system": { "cpu": 12, "memPct": 38, "diskFreeMb": 40210, "uptimeSec": 73821 },
  "currentJobId": null
}
```

### 2.2 Backend processing

```
Agent ──MQTT heartbeat──▶ Broker ──▶ API heartbeat ingester
                                          │
                       ┌──────────────────┼─────────────────────┐
                       ▼                  ▼                     ▼
              Update Redis           Append HeartbeatLog   Recompute HealthSnapshot
        health:{machineId} (TTL 30s)  (forensics, async)   (isAvailable, ETA) → PG + Redis
                       │
                       ▼
            machine.lastSeenAt = now
```

- The **live health** lives in Redis at `health:{machineId}` with a TTL of `HEARTBEAT_OFFLINE_THRESHOLD_SECONDS` (30 s). **If the key expires, the machine is offline by definition** — no cron needed for the common case.
- A lightweight sweeper also reconciles: any `HealthSnapshot.isOnline=true` whose Redis key is gone → set `OFFLINE`, fire alert, mark dependent queued jobs for re-evaluation.
- **Why TTL-based offline detection:** it's self-cleaning and O(1). The expiry *is* the offline event; we don't poll 1,000 machines on a timer.

### 2.3 Offline handling
- New orders for an offline machine are blocked by the health gate.
- In-flight `PAID`/`DISPATCHED` jobs wait; if the machine doesn't return within the PIN TTL, the job `EXPIRES` and an automatic refund is issued.

---

## 3. Machine Health Monitoring (deliverable 14)

### 3.1 The health gate computation

`HealthSnapshot.isAvailable` (the booleans behind the pre-payment gate) is computed on every heartbeat:

```
isAvailable =
      isOnline                                  // heartbeat fresh (Redis key alive)
  AND printerConnected
  AND printerStatus == READY
  AND NOT maintenanceMode
  AND queueLength <= config.maxQueueLength
  AND tonerPct   >= tonerThresholdFor(job)      // job-aware at gate time
  AND paperSheets >= sheetsRequiredFor(job)     // job-aware at gate time

estimatedWaitSec = queueLength * avgJobSeconds + currentJobRemainingSeconds
```

- **Generic availability** (machine-level badge) uses default thresholds for the list view.
- **Job-aware gate** (`POST /machines/:id/health-gate`) plugs in the *actual* page count of *this* job, so a 150-page job is blocked on a machine that could still handle a 2-page job.

### 3.2 Three-tier health model

| Tier | Source | Used for |
|------|--------|----------|
| **Live** (Redis, 30s TTL) | latest heartbeat | machine list badge, gate pre-check |
| **Snapshot** (PG `HealthSnapshot`) | computed | dashboards, sweeper reconciliation |
| **Bound** (frozen on `Order.healthSnapshot`) | captured at order time | the actual payment authorization — TTL `HEALTH_SNAPSHOT_TTL_SECONDS` (90s) |

> **Invariant restated:** payment is authorized against the *bound* snapshot. If it's older than its TTL when the user pays, the gate is re-run. We never charge against stale health.

### 3.3 Alerting thresholds
Backend raises alerts (Slack/PagerDuty/admin dashboard) on: machine offline > 2 min, printer error/jam, paper/toner below threshold, queue saturation, agent version drift, repeated job failures on one machine.

---

## 4. Queue Management (deliverable 15)

### 4.1 Where the queue lives
The authoritative queue is in the **cloud** (PG `PrintJob.status` + `queuePosition`), not on the machine. The machine holds at most the **one job it is currently executing** plus a tiny local buffer. This keeps the machine stateless-ish and recoverable.

### 4.2 Queueing model
- Per-machine **FIFO** by `PAID` time.
- A Redis sorted set `queue:{machineId}` (score = paidAt) gives O(log n) position + ETA without scanning PG.
- `queuePosition` and `estimatedWaitSec` are recomputed on enqueue/complete and surfaced to the user.

```
PAID job ──▶ enqueue: ZADD queue:{machineId} {paidAt} {jobId}
Machine free ──▶ pop head ──▶ dispatch PRINT command ──▶ on COMPLETE/FAIL ──▶ ZREM + recompute ETAs
```

### 4.3 Concurrency & fairness
- A machine prints **one job at a time** (single printer). Dispatch is guarded by a **Redis lock** `lock:dispatch:{machineId}` so two API replicas never dispatch simultaneously.
- Queue length feeds the health gate: when `queueLength > maxQueueLength`, the machine drops out of `Available` and stops accepting new orders — natural backpressure.
- **Starvation guard:** PIN TTL ensures a user who never shows up doesn't block the queue — the job expires and is removed.

---

## 5. Print Job Lifecycle (deliverable 13)

### 5.1 State machine

```
                 file READY + order created
   CREATED ───────────────────────────────▶ AWAITING_PAYMENT
                                                   │ payment.captured (webhook)
                                                   ▼
                                                 PAID ──────────┐ enqueue
                                                   │            │
                                          dispatch PRINT cmd    │
                                                   ▼            │
                                              DISPATCHED        │
                                   PIN verified at machine      │
                                                   ▼            │
                                              DOWNLOADING        │
                                                   ▼            │
                                               PRINTING         │
                        ┌──────────────┬─────────┴───────┐      │
                  print ok        print fail        timeout/no-show
                        ▼              ▼                 ▼
                  COMPLETED         FAILED            EXPIRED
                 (file deleted,   (auto-refund      (auto-refund,
                  pin burned)      saga)             pin expired)
                                       ▼                 ▼
                                   REFUNDED          REFUNDED

   Any pre-PRINTING state + user/admin cancel ──▶ CANCELLED (refund if PAID)
```

Transitions are enforced by a single `transitionJob(job, toStatus)` guard; illegal jumps throw `INVALID_TRANSITION`.

### 5.2 Execution sequence (the paid job)

```
1. Backend (on PAID): mint PIN, ZADD queue, set DISPATCHED, publish PRINT cmd to pk/m/{id}/cmd
2. Agent receives PRINT cmd → shows "Enter PIN" readiness (job is reserved, not yet downloaded)
3. User enters PIN on Machine Portal → agent calls POST /machine/pin/verify
4. Backend validates PIN (one-time, machine-bound) → returns presigned R2 GET (60s) + print options
5. Agent: status→DOWNLOADING (POST /machine/jobs/:id/downloading), pulls PDF to temp dir
6. Agent: status→PRINTING, sends to printer via the platform adapter, monitors spooler
7. On printer success: agent securely deletes temp file → POST /machine/jobs/:id/complete (idempotent)
8. Backend: status→COMPLETED, burn PIN, write ledger, notify user, ZREM queue, recompute ETAs
9. On printer failure: agent → POST /machine/jobs/:id/fail {reason, pagesPrinted}
       → backend FAILED → refund saga (full or pro-rated) → REFUNDED → notify
```

### 5.3 Crash recovery (reconciliation)
On agent restart/reconnect, the **reconciler** runs:
- Re-establish MQTT, publish presence `online`.
- For any local in-progress job, query backend for authoritative status and reconcile (resume, abandon, or mark fail).
- Securely delete any orphaned temp files from a previous run.
- This guarantees a power cut mid-print never leaves money taken with no resolution: the cloud state plus reconciliation always converges to `COMPLETED`, `FAILED→REFUNDED`, or `EXPIRED→REFUNDED`.

---

## 6. File Lifecycle (deliverable 16)

### 6.1 Cradle to grave

```
 UPLOADING ─▶ UPLOADED ─▶ RENDERING ─▶ READY ─▶ (printed) ─▶ DELETED
     │            │           │           │                     ▲
 presigned    /complete   BullMQ      print-ready PDF      purged from R2
 PUT to R2    called      worker:     + pageCount +        after success OR
 (browser     by client   normalize   colorMode            pin-expiry, whichever first
  → R2)                   to PDF
```

| Stage | Where the bytes are | Encryption | Access |
|-------|---------------------|-----------|--------|
| Upload | Browser → R2 (direct, presigned PUT) | TLS in transit, SSE at rest | none yet |
| Stored | R2 `original/{userId}/{fileId}` | SSE | server-only |
| Rendered | R2 `print/{userId}/{fileId}.pdf` | SSE | server-only |
| Download | R2 → Agent (presigned GET, 60s) | TLS | machine-only, one job |
| Deleted | gone from R2 | — | `FileObject.status=DELETED`, `deletedAt` set |

### 6.2 Deletion guarantees (privacy invariant)
- **Local (machine):** temp file securely deleted immediately after a successful print, and on agent startup reconciliation (orphan sweep).
- **Cloud (R2):** deleted on `COMPLETED`; or by a **garbage-collection worker** when a job hits `EXPIRED`/`CANCELLED`/`REFUNDED`; or by a TTL sweep for files that were uploaded but never paid (default 24h).
- **No admin or operator UI ever exposes file bytes.** Files are not public, not listable, not downloadable by staff. Access is only the machine, only via a one-time presigned URL.
- Every presign issuance is written to `AuditLog`.

### 6.3 Why direct-to-R2 (not through the API)
Routing file bytes through the API would make the API a bandwidth bottleneck at scale and a single point of failure for privacy. Presigned URLs let the browser upload and the machine download **straight from object storage**, while the API only ever handles tiny metadata + signs short-lived URLs.

---

## 7. Payment Lifecycle (deliverable 17)

### 7.1 Flow with the paid⇒dispatched guarantee

```
USER                 API                       RAZORPAY            MQTT/AGENT
 │  POST /orders ─────▶│ health gate PASS                              │
 │                     │ create Order(AWAITING_PAYMENT)                │
 │                     │ create Razorpay order ─────▶│                 │
 │ ◀─ razorpayOrderId ─│ ◀──────── orderId ──────────│                 │
 │  Razorpay Checkout ─┼────────────────────────────▶│ user pays       │
 │                     │ ◀══ webhook payment.captured ═│ (signed)       │
 │                     │ verify signature + amount                     │
 │                     │ ── TXN: Payment.CAPTURED,                      │
 │                     │         Order.PAID, Job.PAID,                  │
 │                     │         mint Pin, ledger CHARGE,               │
 │                     │         enqueue Outbox(PRINT cmd) ──┐          │
 │                     │ ── COMMIT ──────────────────────────┘          │
 │ ◀─ push "PIN ready"─│ Outbox dispatcher publishes PRINT ───────────▶│ DISPATCHED
```

### 7.2 Why the Outbox pattern here
The dangerous moment is **between** "DB says PAID" and "command published to broker." If the process crashes there, the user paid but the machine never hears about the job.

- Inside the **same DB transaction** that marks `PAID`, we insert an **Outbox row** (the PRINT command intent).
- A separate **Outbox dispatcher** reads unpublished outbox rows and publishes to MQTT, marking them sent.
- Result: **"paid ⇒ job will be dispatched"** is guaranteed even across crashes, because both facts commit atomically and dispatch is retried until acked.

### 7.3 Idempotency & no double-charge
- `Order.idempotencyKey` (client-provided) → retrying `POST /orders` returns the same order, never a second charge.
- Webhook processing is idempotent on `razorpayPaymentId` → Razorpay's at-least-once delivery can't double-credit.
- Amount is **re-validated server-side** against the order — the client's claimed amount is ignored.

### 7.4 Refund lifecycle

```
Trigger: job FAILED / EXPIRED / CANCELLED-after-pay / support-initiated
   │
   ▼
Compute refund amount (full, or pro-rated by pagesPrinted)
   │
   ▼
Razorpay refund API ─▶ Refund(INITIATED) ─▶ webhook refund.processed ─▶ Refund(PROCESSED)
   │                                                                       │
   └────────── ledger REFUND (signed -) ───────────────────────────────────┘
   │
   ▼
Job → REFUNDED, notify user, AuditLog
```

- **Involuntary refunds** (our fault: jam, offline) are **automatic** and full.
- **Partial refunds** apply when N of M pages printed before failure.
- All refunds write a signed `PaymentLedger` row; the ledger stays append-only and balances against Razorpay in the reconciliation report.

### 7.5 Reconciliation
A daily worker compares Razorpay settlements vs `PaymentLedger` vs job outcomes:
- captured-but-not-printed (should be refunded or in-flight) → flag,
- printed-but-no-capture (should be impossible) → alert,
- mismatched amounts → alert to FINANCE.

This closes the loop on invariant #4 (every rupee has a ledger row) and #1 (no pay without successful-printable health).

---

## 8. Command Set (cloud → machine)

| Command | Payload | Agent action |
|---------|---------|--------------|
| `PRINT` | jobId | Reserve job, await PIN, then download→print→confirm |
| `CANCEL_JOB` | jobId | Abort if not yet printed; report status |
| `REBOOT` | — | Graceful restart of agent/host |
| `ENTER_MAINTENANCE` / `EXIT_MAINTENANCE` | — | Toggle local + reflect in health |
| `UPDATE_CONFIG` | config blob | Apply new pricing/thresholds (also via retained `config` topic) |
| `SELF_UPDATE` | version, url | Download & swap agent binary, rotate secret |
| `CLEAR_QUEUE` | — | Drop local buffer (cloud queue is authoritative) |
| `TEST_PAGE` | — | Print a diagnostic page |

Every command is tracked in `MachineCommand` with `PENDING→SENT→ACKED→COMPLETED/FAILED/EXPIRED`, idempotent on `commandId`, and acked on `pk/m/{id}/cmd-ack`.

---

## 9. Hardware Portability (laptop → Raspberry Pi)

The protocol, topics, payloads, commands, auth, and backend are **identical** regardless of hardware. The only thing that changes is which **printer adapter** the agent's factory selects:

| Platform | Adapter | Print path |
|----------|---------|-----------|
| Windows laptop | `windows.adapter.ts` | Win32 print spooler API |
| Raspberry Pi / Linux | `cups.adapter.ts` | CUPS / IPP |
| Industrial PC | reuse one of the above | per OS |

> **No backend change. No DB change. No protocol change.** Swapping hardware is an adapter selection + an installer script (`install-windows.ps1` vs `install-systemd.sh`). This satisfies the requirement that replacing a laptop with a Pi needs zero architectural change.

---

## 10. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [Database](database-design.md) · [API](api-specification.md) · [Deployment](deployment.md)

---

## 11. Sprint 3 Implementation Notes (HTTPS control plane + Windows agent)

The vision above uses MQTT as the primary control plane. **Sprint 3 implements
the same logical protocol over authenticated HTTPS** (machine JWT), which is
simpler to ship, firewall-proof, and fully sufficient for the pilot. MQTT
remains the documented scale-out path; switching transports does not change the
heartbeat/health/queue *contracts* or the agent's hexagonal structure.

### 11.1 Implemented heartbeat (every 30s)
`POST /machine/heartbeat` (Bearer machine JWT). Backend: appends a
`MachineHeartbeat` row (history), upserts the `MachineHealth` snapshot +
`MachinePrinter`/`MachineNetwork`, caches the snapshot (Redis/in-memory, TTL =
75s staleness window), stamps `machine.lastHeartbeatAt`, and pushes
`machine.health` over Socket.IO. A snapshot older than the staleness window is
served as **BLOCKED** with reason `HEARTBEAT_STALE`.

### 11.2 Implemented health gate
`MachineHealthService.compute()` (pure, 100% tested) → 0–100 score +
READY/WARNING/BLOCKED. **Hard blockers** (force BLOCKED): stale heartbeat,
printer offline, out of paper, paper jam, error/maintenance state, printer error
code. **Soft warnings** (degrade only): low ink/toner, no internet, high
CPU/RAM/disk/temperature. A BLOCKED machine is where Sprint 4 will refuse payment.

### 11.3 Hardware portability — proven via hexagonal ports
The agent depends only on `PrinterPort`. `printer.factory.ts` selects:
`WindowsPrinterAdapter` (PowerShell `Get-CimInstance Win32_Printer`),
`CupsPrinterAdapter` (Raspberry Pi, `lpstat`), or `SimulatorPrinterAdapter`
(CI/no-hardware). **The backend never learns which adapter is active.** The
Electron tray daemon (Windows) and the systemd headless entry (Pi) share the
identical `bootstrapAgent()` core — only the process manager differs.

### 11.4 Queue infrastructure (no printing yet)
`GET /machine/jobs` always returns `{hasJob:false}`; `accept`/`reject` are wired
and audited but reject as "no such job" until Sprint 4 populates the queue.

## 12. Sprint 4 — Print Dispatch Protocol (implemented)

Sprint 4 turns the queue infrastructure into a real print pipeline while keeping
the agent protocol OS-agnostic (Windows == Raspberry Pi).

### 12.1 PIN-driven dispatch

A print job becomes available to a machine only after a valid PIN is entered **at
the machine**:

1. Customer pays → backend mints a 4-digit PIN (argon2id hash, 6h TTL, 3 attempts,
   one-time) and creates a `PrintJob` (QUEUED→DISPATCHED).
2. Customer enters the PIN on the machine keypad → `POST /machine/pin/redeem`
   (machine JWT) verifies it, moves the order to `WAITING_AT_MACHINE`, and returns
   the claimed `MachineJob`.
3. The agent's existing `GET /machine/jobs` poll also returns the claimed job
   (atomic claim with a lock token + visibility timeout).

### 12.2 The MachineJob payload

```jsonc
{
  "jobId": "...", "orderId": "...", "orderNumber": "PK-...",
  "downloadUrl": "<presigned GET, short-lived>",
  "checksum": "<sha256>",
  "printOptions": { "copies": 1, "colorMode": "BW", "duplex": false,
                    "paperSize": "A4", "pageRange": null },
  "expiresAt": "<ISO>"
}
```

### 12.3 Print sequence (agent)

```
GET /machine/jobs → MachineJob
  → POST /machine/job/accept {jobId}        (order → PRINTING)
  → PrintRunner: download(downloadUrl) → temp file → verify checksum
      → PrinterPort.print(...) → delete temp file (always)
  → POST /machine/job/report {jobId, success, errorCode?, pagesPrinted?}
      (order → COMPLETED, PIN expired | order → FAILED, job requeued/dead-lettered)
```

`PrinterPort` gains a `print(request)` method; Windows uses PowerShell's Print
verb, CUPS uses `lp`, and the simulator is a no-op success — the agent core,
api-client and heartbeat builder are unchanged across platforms.
