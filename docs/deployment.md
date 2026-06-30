# Print Karo — Deployment, CI/CD & Operations

**Document owner:** DevOps Architect / SRE
**Status:** v1.0 · 2026-06-30
**Covers deliverables:** 20 Deployment Architecture · 21 CI/CD Pipeline · 22 Logging Strategy · 23 Monitoring Strategy · 24 Backup Strategy · 25 Disaster Recovery

---

## 1. Deployment Architecture (deliverable 20)

### 1.1 Topology

```
                         ┌──────────────────────────────────────────┐
                         │            Cloudflare (DNS + WAF + CDN)   │
                         └───────────────┬──────────────────────────┘
            ┌────────────────────────────┼───────────────────────────────┐
            ▼                            ▼                                ▼
   ┌──────────────────┐      ┌──────────────────────────────┐  ┌─────────────────────┐
   │ Vercel           │      │ Render                        │  │ Cloudflare R2       │
   │  web-customer    │      │  Web Service: NestJS API (×N) │  │  encrypted files    │
   │  web-admin       │ HTTPS│  Background Worker: BullMQ (×M)│  └─────────────────────┘
   │  web-machine     │─────▶│  Background Worker: Outbox     │
   └──────────────────┘      └─────────┬────────────────────┘
                                       │
              ┌────────────────────────┼───────────────────────────┐
              ▼                        ▼                            ▼
   ┌────────────────────┐   ┌────────────────────┐      ┌──────────────────────┐
   │ Neon PostgreSQL    │   │ Render Key Value    │      │ EMQX MQTT cluster     │
   │  primary + replicas│   │  (managed Redis)    │      │  (TLS 8883)           │
   │  + pooler          │   └────────────────────┘      └──────────┬───────────┘
   └────────────────────┘                                          │ mqtts
                                                                   ▼
                                              ┌──────── Machines (laptop/Pi fleet) ────────┐
                                              │  Agent + Machine Portal, OS-supervised      │
                                              └─────────────────────────────────────────────┘
```

### 1.2 Where each thing runs & why

| Component | Platform | Why |
|-----------|----------|-----|
| web-customer / web-admin / web-machine | **Vercel** | First-class Next.js 15, edge CDN, preview deploys per PR, autoscale, zero ops |
| NestJS API | **Render Web Service** (Docker) | Native zero-downtime rolling deploys, health checks, horizontal scaling (instance count), auto-deploy from Git, managed TLS; portable Dockerfile keeps us provider-independent |
| BullMQ workers + Outbox dispatcher | **Render Background Workers** | Long-running non-HTTP processes Render runs and supervises separately from the API; scaled independently by queue depth |
| Cron / scheduled jobs (reconciliation, GC) | **Render Cron Jobs** | Managed scheduled runs without a standing worker |
| PostgreSQL | **Neon** | Serverless Postgres, branching for previews, autoscale, read replicas, PITR (kept over Render Postgres for DB branching + PITR) |
| Redis | **Render Key Value** (managed Redis) | Same-provider low-latency private networking to the API, managed, TLS; one less vendor |
| MQTT broker | **EMQX** (managed cloud or self-hosted cluster) | Built for massive device fan-out, ACLs, clustering |
| Object storage | **Cloudflare R2** | No egress fees, S3-compatible, global |
| Machine runtime | the device | Agent as a supervised OS service (Windows Service / systemd) |

### 1.3 Environments

| Env | Branch | API (Render) | DB | Purpose |
|-----|--------|--------------|----|---------|
| **Preview** | every PR | **Render Preview Environment** (spun from `render.yaml`) | Neon branch (ephemeral) | Per-PR full-stack preview (Vercel + ephemeral Render API + workers) |
| **Staging** | `main` (auto-deploy) | Render staging services | Neon staging | Pre-prod, machine simulator fleet, smoke tests |
| **Production** | `release` tag (deploy hook) | Render prod services | Neon prod | Live |

**Render specifics:**
- All Render services (API, workers, cron, Key Value) are declared as code in a **`render.yaml` Blueprint** at the repo root — infra is reviewed in PRs, not clicked in a dashboard.
- **Auto-deploy** is enabled for `main` → staging. **Production deploys** are triggered by a **Render Deploy Hook** fired from the release GitHub Action (so prod ships the exact tested commit, not on every push).
- **Preview Environments** are enabled on the Blueprint so each PR gets its own ephemeral API + workers, wired to an ephemeral Neon branch.
- Private services (workers, Key Value) talk to the API over Render's **private network**; only the API Web Service is public.

### 1.4 Zero-downtime deploys
- Render Web Service does **native rolling deploys**: a new instance must pass the configured **Health Check Path** (`/ready` → DB/Redis/MQTT reachable) before it receives traffic and the old instance is drained.
- Stateless API (state in Redis/PG) → old and new instances coexist safely during the roll.
- **Backward-compatible DB migrations** (expand → migrate → contract); never drop a column the running version still reads.
- **API is versioned** (`/api/v1`) so deployed machines/agents are never broken by a release.
- Worker deploys drain in-flight BullMQ jobs before exit (graceful `SIGTERM` handling within Render's shutdown grace period).
- Scaling is changing the Web Service **instance count** (and worker count) — no in-process state means scaling up/down is a no-op for correctness.

### 1.5 Containerization (Docker)
- Multi-stage Dockerfiles (`infra/docker/`): build with full toolchain → slim runtime image (distroless/alpine). Render builds and runs these images directly (`runtime: image`/Dockerfile in `render.yaml`).
- One image per app (`api`, `agent` optionally), pinned Node version, non-root user, read-only FS where possible.
- The same Dockerfile runs locally (compose), in CI, and on Render — **no Render-specific code**, so the provider stays swappable (Fly/ECS) if ever needed.
- Agent ships as: (a) a packaged Node binary for Windows + installer, (b) an `arm64` build + systemd unit for Pi — same source, two targets. (The Agent runs on the device, not on Render.)

---

## 2. CI/CD Pipeline (deliverable 21)

### 2.1 GitHub Actions stages

```
 PR opened/updated
      │
      ▼
 [1] Install (pnpm, cached)         ──┐
 [2] Lint + Typecheck (turbo, only changed) │ fast feedback < 5 min
 [3] Unit tests (vitest/jest)        ──┘
      │
      ▼
 [4] Integration tests (Testcontainers: PG + Redis)
 [5] Build all apps (turbo cache)
 [6] Security: secret-scan, npm audit, SAST (CodeQL), Trivy image scan
 [7] E2E (Playwright) against ephemeral preview (Vercel + Neon branch)
      │
      ▼ (merge to main → Render auto-deploy)
 [8] Deploy STAGING (api+workers → Render, web → Vercel) + run DB migrations (release-phase / pre-deploy)
 [9] Smoke tests + machine-simulator health-gate test
      │
      ▼ (tag release/* → fire Render Deploy Hook)
 [10] Deploy PROD (Render rolling deploy, health-gated), run migrations (expand/contract)
 [11] Post-deploy synthetic checks + auto-rollback (Render "Rollback" to previous deploy) on failure
```

### 2.2 Principles
- **Turborepo remote cache** → only changed packages rebuild/test; CI stays fast as the monorepo grows.
- **Migrations run in CI**, never by hand: `prisma migrate deploy` gated behind successful build; destructive migrations require a labeled PR + manual approval.
- **Required checks** to merge: lint, typecheck, unit, integration, security, build.
- **Preview per PR**: reviewers click a live environment.
- **Promotion, not rebuild**: the image tested in staging is the image deployed to prod (digest pinned); prod is triggered by a Render Deploy Hook on the release tag, not on every push.
- **Migrations on Render**: run via a **pre-deploy command** (or release-phase step) so `prisma migrate deploy` completes before new instances take traffic.
- **Auto-rollback**: failed post-deploy synthetic → **Render Rollback** to the previous successful deploy; DB contract steps are reversible or deferred (expand/contract keeps the old version runnable).
- **Secrets** in GitHub Environments / provider secret stores, scoped per environment, never in the repo.

### 2.3 Agent release channel
- Agent versions are published to a release bucket; machines self-update via `SELF_UPDATE` command in **canary → staged → fleet** waves, with automatic halt if error rate rises. A machine can always roll back to the last-known-good binary.

---

## 3. Logging Strategy (deliverable 22)

### 3.1 Principles
- **Structured JSON logs** (pino) everywhere — API, workers, agent.
- Every log line carries `correlationId` (ULID), plus `userId`/`machineId`/`jobId` where relevant, so a single print can be traced upload→pay→PIN→print across services.
- **Levels:** `error` (actionable), `warn` (degraded), `info` (business events: order created, paid, printed, refunded), `debug` (dev only).
- **PII/secret redaction** is mandatory: never log file contents, raw PINs, tokens, card data, full emails. A pino redaction list enforces it.

### 3.2 Pipeline
```
API/Workers/Agent (pino JSON)
        │
        ▼
 stdout → Render Log Stream (drain) → Log aggregator (Better Stack / Grafana Loki / Datadog)
        │                                   │
   short-term hot search (14–30d)      cold archive (S3/R2, 1yr+)
```

- Agent logs are buffered locally and shipped opportunistically (survives offline), with rotation + size caps so a disconnected machine never fills its disk.

### 3.3 Audit logs are separate
Business-critical privileged actions go to the **`AuditLog` table** (append-only) in addition to application logs — durable, queryable, and immutable for compliance/forensics (refunds, role changes, machine commands, presign issuance).

---

## 4. Monitoring Strategy (deliverable 23)

### 4.1 Three pillars
| Pillar | Tool | What |
|--------|------|------|
| **Metrics** | Prometheus + Grafana (or Datadog) | RED (rate/errors/duration) per endpoint, queue depth, gate pass/fail, fleet online %, payment success rate |
| **Tracing** | OpenTelemetry → Tempo/Datadog | Distributed traces by `correlationId` across API→workers→MQTT |
| **Errors** | Sentry | Frontend + backend exceptions with release + user/machine context |

### 4.2 Golden signals & business SLOs

| Signal | Alert when |
|--------|-----------|
| API error rate | > 1% over 5 min |
| API p95 latency | > 500 ms |
| Health-gate read p95 | > 200 ms |
| Payment success rate | < 98% over 15 min |
| Paid-but-not-printed (stuck jobs) | any job stuck > PIN TTL |
| Fleet online % | < 90% |
| MQTT broker connections | sudden drop > 10% |
| Queue saturation | machine queue > maxQueueLength sustained |
| Worker lag (BullMQ) | render queue depth growing |
| Reconciliation mismatch | any ledger vs Razorpay diff |

### 4.3 Dashboards
- **Fleet dashboard** (Admin + Grafana): map of machines by status, queues, consumables, alerts.
- **Money dashboard** (Finance): captures, refunds, ledger balance, settlement, reconciliation diffs.
- **Reliability dashboard** (SRE): SLOs, error budgets, deploy markers, trace samples.

### 4.4 Synthetic monitoring
A scheduled job runs the **golden path** (upload→quote→gate→order→mock-pay→PIN→simulated print) against a machine simulator in staging every few minutes, and a read-only health probe against prod. Failures page on-call.

### 4.5 On-call
PagerDuty/Opsgenie rotation; runbooks per alert in `docs/runbooks/`; severity levels (SEV1 money/down, SEV2 degraded, SEV3 single machine).

---

## 5. Backup Strategy (deliverable 24)

| Asset | Method | Frequency | Retention |
|-------|--------|-----------|-----------|
| **PostgreSQL** | Neon automated backups + **PITR** (point-in-time recovery) | continuous WAL | 30 days PITR; daily snapshots 90 days |
| **PG logical dumps** | `pg_dump` to R2 (independent of provider) | nightly | 35 days |
| **Redis** | Treated as **rebuildable cache**, not source of truth; critical durable state (PIN hash, jobs) lives in PG | RDB snapshot | 7 days (best-effort) |
| **R2 files** | Intentionally ephemeral (privacy) — **not backed up**; only metadata in PG | — | — |
| **AuditLog / Ledger** | Part of PG backups + periodic immutable export to R2 (WORM) | nightly export | 7 yrs |
| **Infra config** | Everything as code in Git (IaC, workflows, Dockerfiles) | per commit | forever |
| **Secrets** | Stored in provider secret manager; documented recovery, not plaintext backup | — | — |

**Why Redis isn't a backup concern:** by design, all durable truth (jobs, payments, PIN hashes, ledger) is in Postgres. Redis holds derived/hot state (live PIN copy, health cache, queues) that can be rebuilt from PG. Losing Redis degrades latency, not correctness.

**Backup verification:** automated **monthly restore drill** into a scratch Neon branch + integrity checks. An untested backup is not a backup.

---

## 6. Disaster Recovery (deliverable 25)

### 6.1 Objectives
| Metric | Target |
|--------|--------|
| **RPO** (max data loss) | ≤ 5 min (PG PITR / WAL) |
| **RTO** (max downtime) | ≤ 60 min for control plane |
| Machine-level outage | Isolated by design — fleet keeps running; affected machines self-heal |

### 6.2 Failure scenarios & responses

| Scenario | Blast radius | Response |
|----------|-------------|----------|
| **API region down** | control plane | Re-create Render services in another Render region from the `render.yaml` Blueprint (Docker image is portable); Vercel already multi-region; Neon failover. Because state lives in Neon/Redis, recovery is "stand up stateless services + point at the DB" |
| **Render Key Value (Redis) loss** | hot state | Provision a new Render Key Value instance from the Blueprint; rebuild cache from PG (see §6.2 below) — correctness unaffected |
| **Postgres failure** | system of record | Neon HA failover; if catastrophic, PITR restore to last WAL; app reconnects via pooler |
| **Redis loss** | hot state | Rebuild from PG: re-warm health cache from heartbeats, re-derive queues from `PrintJob` rows; in-flight PINs re-mintable from `Pin` table if needed |
| **MQTT broker down** | machine comms | Agents auto-fall back to **HTTPS polling**; no jobs lost; reconnect when broker returns |
| **R2 unavailable** | file I/O | New uploads/prints pause (gate already blocks); existing money safe; retries resume on recovery |
| **Razorpay outage** | payments | Health gate still lets users upload; checkout fails gracefully with retry; no PIN minted without capture |
| **Single machine dies mid-print** | one user | Reconciler + auto-refund saga; user notified; job EXPIRED/FAILED→REFUNDED |
| **Bad deploy** | control plane | Auto-rollback to previous image digest; migrations are expand/contract so old version still runs |

### 6.3 DR principles baked into the design
- **No single point of failure for correctness:** money/jobs in HA Postgres; everything else degrades, not corrupts.
- **Edge autonomy:** the fleet doesn't go dark just because one cloud dependency hiccups (MQTT→HTTPS fallback, local job execution, reconciliation).
- **Idempotency + Outbox + Saga** mean retries after any failure converge to a correct end state (printed, refunded, or expired-refunded) — never "paid and lost."
- **Runbooks + drills:** documented DR runbook in `docs/runbooks/dr.md`, rehearsed quarterly (game days), including a full region-failover and a PITR restore.

### 6.4 DR runbook skeleton
```
1. Declare incident, page on-call, open incident channel, assign IC.
2. Identify failed component (dashboards/synthetics).
3. Apply scenario response (table above).
4. Verify control plane via /ready + synthetic golden path.
5. Verify money integrity via reconciliation report.
6. Communicate status (status page) to operators/users.
7. Post-incident review within 48h; action items tracked.
```

---

## 7. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [Database](database-design.md) · [API](api-specification.md) · [Machine Protocol](machine-protocol.md) · [Roadmap](development-roadmap.md)

---

## 8. Machine Agent Deployment (Sprint 3)

The agent (`apps/machine-agent`) is **not** deployed to the cloud — it runs **on
each machine**. The same compiled core ships two ways:

| Target | Process manager | Entry | Install |
|--------|-----------------|-------|---------|
| **Windows PC** | Electron tray daemon | `dist/main/main.js` | `electron .` (auto-start on login, single-instance, system tray) |
| **Raspberry Pi / Linux** | systemd | `dist/headless.js` | `scripts/install-systemd.sh` (auto-start on boot, `Restart=always`) |

Both call the identical `bootstrapAgent()`; only the printer adapter and process
manager differ. Provisioning: an admin registers the machine
(`POST /admin/machines`), copies the **one-time secret**, and writes
`PK_MACHINE_ID` + `PK_MACHINE_SECRET` into the agent's env / OS keystore. The
agent then self-authenticates (JWT login + refresh-rotation) and runs unattended.

### 8.1 Backend additions (Render)
- **Redis** (`REDIS_URL`) now powers the machine-health hot cache. Optional — the
  API falls back to an in-process cache if unset, so dev/CI need no Redis. In
  prod, point it at Render Key Value.
- **Socket.IO** (`/machines` namespace) shares the API web service port — no new
  service; Render's HTTP service proxies WebSocket upgrades.
- New env: `REDIS_URL?`, `MACHINE_HEARTBEAT_STALE_SEC`, `MACHINE_LOGIN_MAX_ATTEMPTS`, `MACHINE_LOGIN_LOCKOUT_SEC`.

### 8.2 Agent auto-update (ready, not enabled)
The agent build is structured for canary→staged→fleet self-update (Sprint 4+);
Sprint 3 ships the version metadata and tray "Restart agent" control.

## 9. Print Pipeline Deployment (Sprint 4)

### 9.1 New environment variables (all optional with safe fallbacks)

The app boots green with none of these set — storage falls back to an in-process
Fake, payment to the simulator, and conversion to a deterministic stub (mirroring
the Sprint 3 Redis/printer fallbacks).

| Var | Default | Purpose |
|-----|---------|---------|
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | — | Cloudflare R2 (S3-compatible). All four present → R2; else Fake storage |
| `R2_PUBLIC_URL` | — | optional public base (never exposed; presigned URLs only) |
| `R2_PRESIGN_TTL_SEC` | `900` | presigned URL lifetime |
| `UPLOAD_MAX_BYTES` | `104857600` | 100 MB upload ceiling |
| `FILE_CONVERTER` | `stub` | `stub` (no native deps) or `libreoffice` (needs `soffice`) |
| `PIN_TTL_SEC` | `21600` | PIN lifetime (6h) |
| `PIN_MAX_ATTEMPTS` | `3` | PIN attempts before lockout |
| `PAYMENT_PROVIDER` | `simulator` | demo only in Sprint 4; `razorpay` in Sprint 5 |
| `PRINT_JOB_TIMEOUT_SEC` | `300` | print-job visibility timeout / lock TTL |

### 9.2 Storage (Cloudflare R2)

Create an R2 bucket and an API token with object read/write. Files are uploaded
and downloaded directly via presigned URLs — they never traverse the API. Set the
four `R2_*` vars to switch from Fake to real R2; no code change.

### 9.3 LibreOffice conversion (optional)

For real DOCX/PPT→PDF conversion, deploy on an image with LibreOffice and set
`FILE_CONVERTER=libreoffice`. The default stub keeps CI/sandbox green without it.

### 9.4 Migration & seed

`prisma migrate deploy` applies the additive Sprint 4 tables; `prisma db seed`
re-seeds permissions (data-driven, picks up new order/revenue/refund/pin keys).
Socket.IO adds a `/uploads` namespace alongside the existing `/machines`.
