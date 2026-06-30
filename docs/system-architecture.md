# Print Karo — System Architecture

**Document owner:** CTO / Principal Architect
**Status:** v1.0 · 2026-06-30
**Covers deliverables:** 1 Enterprise Architecture · 2 HLD · 3 LLD · 4 Folder Structure · 5 Monorepo · 18 Security · 19 RBAC · 26 Rate Limiting · 27 API Security · 31 Design Patterns · 32 Scalability · 33 Performance · 34 Future Expansion

---

## 1. Enterprise System Architecture

### 1.1 Architectural style & rationale

Print Karo is a **modular monolith backend + distributed edge agents**.

| Decision | Choice | Why |
|----------|--------|-----|
| Backend shape | **Modular monolith** (NestJS modules), not microservices on day 1 | A 3–6 person team ships features far faster in one well-bounded codebase. Module boundaries are enforced in code so we can later extract any module into a service without rewriting it. Premature microservices = distributed debugging hell. |
| Edge shape | **Autonomous agents** per machine | Machines must keep functioning logically even on bad networks; the agent owns the printer and reconciles with the cloud. |
| Comms (control plane) | **MQTT** broker for heartbeat + commands | Persistent, low-overhead, NAT/firewall-friendly, fan-out to 1,000s of devices is the broker's native job. Far cheaper than 1,000s of WebSockets on the API. |
| Comms (data plane) | **HTTPS + presigned R2 URLs** for files | Large binary transfer should never go through the message bus or the API process. The agent pulls bytes directly from object storage. |
| State of record | **PostgreSQL** (Neon) | Strong consistency for money + jobs is non-negotiable. |
| Hot state / coordination | **Redis** | Health snapshots, PIN cache, rate-limit counters, queue locks, idempotency keys, BullMQ jobs. |

> **The control plane / data plane split is the central idea.** Commands and status are tiny and frequent → MQTT. Files are large and rare-per-job → object storage. Never mix them.

### 1.2 The three planes

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLOUD CONTROL PLANE                            │
│                                                                            │
│   Customer Portal ─┐                                                       │
│   Admin Dashboard ─┼──HTTPS──▶  NestJS API (modular monolith)             │
│   Machine Portal  ─┘            ├─ Auth/RBAC   ├─ Jobs    ├─ Payments      │
│                                 ├─ Machines    ├─ Health  ├─ Files         │
│                                 ├─ Queue       ├─ Pricing ├─ Ledger        │
│                                 └─ Notifications  └─ Admin/Reports          │
│                                      │        │         │                  │
│                              ┌───────┘        │         └────────┐         │
│                              ▼                ▼                  ▼         │
│                         PostgreSQL         Redis            BullMQ workers  │
│                          (Neon)        (cache/locks)      (render, GC, …)   │
└───────────────────────────────┬──────────────────────────────┬────────────┘
                                 │ MQTT (TLS)                   │ HTTPS
                                 ▼                              ▼
                      ┌────────────────────┐         ┌───────────────────────┐
                      │   MQTT BROKER       │         │  Cloudflare R2 (files)│
                      │   (EMQX cluster)    │         │  encrypted, presigned │
                      └─────────┬──────────┘         └───────────┬───────────┘
                                │                                 │
        ════════════════════════ EDGE PLANE (per machine) ════════════════════
                                │                                 │
                      ┌─────────▼─────────────────────────────────▼─────────┐
                      │  MACHINE (Windows laptop → Raspberry Pi)             │
                      │   ┌──────────────┐   ┌───────────────┐               │
                      │   │ Machine Agent│──▶│  Local Printer │ (IPP/CUPS/   │
                      │   │ (Node daemon)│   │  via OS spooler│  Windows)    │
                      │   └──────┬───────┘   └───────────────┘               │
                      │          │ localhost                                  │
                      │   ┌──────▼───────┐                                    │
                      │   │ Machine Portal│ (Next.js kiosk: PIN entry UI)     │
                      │   └──────────────┘                                    │
                      └──────────────────────────────────────────────────────┘
```

**Why three planes:**
- **Control plane** (cloud) is the brain and the only source of truth for money and jobs.
- **Edge plane** (machine) is hands — it executes and reports, but cannot mint money or PINs.
- **Data plane** (R2) carries the heavy bytes out-of-band so neither the API nor the broker is a bandwidth bottleneck.

---

## 2. High-Level Architecture Diagram

### 2.1 End-to-end request/print flow (happy path)

```
USER (browser/PWA)              NESTJS API            REDIS / PG / R2        MQTT        AGENT
      │                              │                       │                │           │
 1.   │ POST /files (upload) ───────▶│                       │                │           │
      │                              │ store → R2 (enc)      │                │           │
      │                              │ enqueue render (BullMQ)│                │           │
      │ ◀──── fileId, pages, price ──│ render worker → PDF   │                │           │
 2.   │ GET /machines?near=… ───────▶│ read health (Redis)   │                │           │
      │ ◀──── machines + health ─────│                       │                │           │
 3.   │ POST /orders (machineId) ───▶│ re-check health gate  │                │           │
      │                              │ create order + Razorpay order          │           │
      │ ◀──── razorpayOrderId ───────│ bind healthSnapshot   │                │           │
 4.   │ Razorpay checkout (client) ─▶ Razorpay …                                          │
      │                              │ ◀── webhook: paid ────│  verify sig    │           │
      │                              │ issue PIN (hash→PG, cache→Redis)        │           │
      │ ◀──── PIN (shown to user) ───│ publish job → machine ─────────────────▶│ queued   │
 5.   │       (walks to machine)     │                       │                │           │
      │                              │                       │                │  user enters PIN
      │                              │ POST /machine/pin/verify ◀──────────────────────────│
      │                              │ validate (one-time)   │                │           │
      │                              │ presign R2 GET (60s) ─────────────────────────────▶│ download
      │                              │                       │                │  print → confirm
      │                              │ ◀── POST /jobs/:id/complete ───────────────────────│
      │                              │ mark COMPLETED, burn PIN, ledger        │           │
      │ ◀── push: "Printed!" ────────│                       │                │  delete local file
```

### 2.2 Component responsibilities (one line each)

| Component | Owns |
|-----------|------|
| Customer Portal | Upload, machine discovery, checkout, PIN display, job tracking |
| Admin Dashboard | Fleet, machines, users, revenue, refunds, tickets, alerts, config |
| Machine Portal | Kiosk PIN entry + status screen (no business logic) |
| Machine Agent | Printer I/O, heartbeat, job execution, file GC, command handling |
| NestJS API | Auth, RBAC, orders, payments, PIN minting, health gate, ledger, orchestration |
| MQTT Broker | Reliable command/heartbeat transport + presence |
| PostgreSQL | System of record (users, machines, jobs, payments, ledger, audit) |
| Redis | Health snapshots, PIN cache, rate limits, locks, idempotency, BullMQ |
| R2 | Encrypted file blobs, accessed only via short-lived presigned URLs |

---

## 3. Low-Level Architecture (Backend modules)

NestJS modules with **strict boundaries**. A module exposes a service interface; cross-module calls go through services, never through another module's repository.

```
api/src/modules/
├── auth/            # Better Auth integration, sessions, guards, RBAC
├── users/           # user profiles, roles, wallet (future)
├── machines/        # registration, config, maintenance, provisioning, secrets
├── health/          # heartbeat ingest, health snapshot, the PRE-PAYMENT GATE
├── files/           # upload, R2 storage, render-to-PDF, page count, presign, GC
├── jobs/            # print job lifecycle state machine, queue position
├── pricing/         # pricing engine (pages × rate × color × duplex + fee)
├── orders/          # order creation, health binding, idempotency
├── payments/        # Razorpay orders, webhook verify, refunds, ledger
├── pins/            # one-time PIN mint / validate / burn / expiry
├── queue/           # per-machine FIFO queue + ETA computation
├── commands/        # outbound commands to agents over MQTT (print, cancel, reboot…)
├── notifications/   # email/SMS/push (PIN ready, printed, refunded)
├── reports/         # revenue, reconciliation, settlement, fleet KPIs
├── audit/           # append-only audit log writer
└── admin/           # admin-only aggregation endpoints
```

**Shared/cross-cutting (not feature modules):**
```
api/src/common/
├── guards/          # AuthGuard, RolesGuard, MachineAuthGuard, ThrottlerGuard
├── interceptors/    # logging, correlationId, response envelope, timing
├── filters/         # global exception filter → consistent error shape
├── pipes/           # ZodValidationPipe
├── decorators/      # @CurrentUser, @Roles, @Idempotent, @Public
├── mqtt/            # MqttModule (publish/subscribe, topic builders)
├── redis/           # RedisModule (clients, lock helper, cache helper)
└── prisma/          # PrismaModule (single client, transaction helper)
```

### 3.1 Layering inside a module (Hexagonal-lite)

```
Controller (HTTP/MQTT edge)  →  Service (business rules)  →  Repository (Prisma)
        │                              │                            │
   DTOs + Zod                   domain logic, no I/O details   data access only
```

- Controllers are thin: validate, delegate, shape response.
- Services hold **all** business rules and are the only place transactions begin.
- Repositories wrap Prisma; no business logic leaks in.

> **Why:** this is what lets us later lift `payments/` out as a microservice — its service has no hidden dependency on another module's tables, only on injected interfaces.

---

## 4. Folder Structure (per app)

### 4.1 Customer / Admin / Machine Portal (Next.js 15, App Router)

```
apps/web-customer/
├── src/
│   ├── app/                      # App Router routes
│   │   ├── (marketing)/          # landing, pricing
│   │   ├── (auth)/login|register/
│   │   ├── (app)/
│   │   │   ├── upload/
│   │   │   ├── machines/
│   │   │   ├── checkout/[orderId]/
│   │   │   ├── pin/[jobId]/
│   │   │   └── jobs/
│   │   ├── api/                  # route handlers (BFF: webhooks proxy, presign relay)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── features/             # MachineCard, HealthBadge, UploadDropzone…
│   ├── lib/
│   │   ├── api-client.ts         # typed fetch to backend (shared @print-karo/api-contract)
│   │   ├── auth.ts               # Better Auth client
│   │   └── utils.ts
│   ├── hooks/
│   ├── stores/                   # zustand (upload progress, cart)
│   └── types/
├── public/
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

### 4.2 Backend (NestJS)

```
apps/api/
├── src/
│   ├── main.ts                   # bootstrap, helmet, cors, versioning
│   ├── app.module.ts
│   ├── modules/                  # (see §3)
│   ├── common/                   # (see §3)
│   ├── config/                   # typed config (zod-validated env)
│   └── workers/                  # BullMQ processors (render, gc, reconcile, alerts)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── test/
└── package.json
```

### 4.3 Machine Agent

```
apps/agent/
├── src/
│   ├── index.ts                  # entrypoint, supervisor
│   ├── config/                   # device config, secrets (OS keystore / file 600)
│   ├── transport/
│   │   ├── mqtt.client.ts        # connect, reconnect, topic handlers
│   │   └── http.client.ts        # presigned download, status POST
│   ├── core/
│   │   ├── heartbeat.ts          # collect + publish health every 15s
│   │   ├── job-runner.ts         # download → print → confirm → delete
│   │   ├── command-handler.ts    # print/cancel/reboot/maintenance/update
│   │   └── reconciler.ts         # on reconnect, sync state with cloud
│   ├── printer/
│   │   ├── printer.interface.ts  # PORT — hardware-agnostic contract
│   │   ├── windows.adapter.ts    # ADAPTER — Win32 print spooler
│   │   ├── cups.adapter.ts       # ADAPTER — CUPS/IPP (Linux/Pi)
│   │   └── printer.factory.ts    # picks adapter by platform
│   ├── storage/
│   │   └── local-file.ts         # temp dir, secure delete after print
│   └── telemetry/                # logs, metrics, self-update hooks
├── scripts/install-windows.ps1
├── scripts/install-systemd.sh    # for Raspberry Pi
└── package.json
```

> **Hardware portability (key requirement):** the Agent depends only on `printer.interface.ts`. `printer.factory.ts` selects `windows.adapter` or `cups.adapter` at runtime. **Swapping a laptop for a Raspberry Pi changes one adapter selection, not the protocol, not the backend, not the DB.** This is the Ports & Adapters (Hexagonal) pattern applied at the edge.

---

## 5. Monorepo Structure (Turborepo + pnpm)

**Chosen:** pnpm workspaces + Turborepo. *Why:* fastest CI via remote/local caching, first-class Next.js + NestJS support, minimal config, shared TypeScript packages with project references.

```
print-karo/
├── apps/
│   ├── web-customer/             # Next.js — Customer Portal
│   ├── web-admin/                # Next.js — Admin Dashboard
│   ├── web-machine/              # Next.js — Machine Portal (kiosk)
│   ├── api/                      # NestJS — Backend API
│   └── agent/                    # Node — Machine Agent
├── packages/
│   ├── api-contract/             # shared DTOs + Zod schemas + OpenAPI types (single source of truth)
│   ├── ui/                       # shared shadcn/ui components, theme tokens
│   ├── config-eslint/            # eslint config
│   ├── config-tsconfig/          # base tsconfig
│   ├── logger/                   # shared structured logger (pino wrapper)
│   ├── mqtt-topics/              # canonical MQTT topic builders + payload types
│   └── constants/                # enums, error codes, limits, shared between FE/BE/agent
├── infra/
│   ├── docker/                   # Dockerfiles per app
│   ├── compose/                  # local dev (pg, redis, emqx, minio-as-r2)
│   └── github-actions/           # reusable workflow fragments
├── docs/                         # ← this documentation
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

**Why a shared `api-contract` package matters:** the Customer Portal, Admin, Agent, and API all import the *same* Zod schemas and TypeScript types. A breaking change to an endpoint fails the type-check across every consumer at build time — the monorepo turns API drift into a compile error.

`turbo.json` pipelines: `build` (topological), `lint`, `test`, `typecheck`, `dev` (persistent). Tasks are cached; CI only rebuilds what changed.

---

## 6. Design Patterns (deliverable 31)

| Pattern | Where | Why |
|---------|-------|-----|
| **Ports & Adapters (Hexagonal)** | Agent printer layer; backend repositories | Hardware/storage swap without touching business logic |
| **Strategy** | Pricing engine, printer factory, notification channels | Pluggable rules per campus/platform/channel |
| **State Machine** | Print job lifecycle, payment lifecycle | Illegal transitions become impossible, not just discouraged |
| **Outbox** | Payments → MQTT command publish | Guarantees "paid ⇒ job dispatched" survives a crash between DB commit and broker publish |
| **Saga (orchestration)** | Order → Pay → PIN → Print → Settle/Refund | Long-running, cross-resource consistency without 2PC |
| **CQRS-lite** | Reports/dashboards read from read-models/materialized views | Heavy analytics never contend with transactional writes |
| **Idempotency key** | Orders, payment webhooks, job completion | Retries and duplicate webhooks are safe |
| **Repository** | All data access | Testable services, swappable persistence |
| **Decorator/Interceptor** | Logging, correlationId, RBAC, throttle | Cross-cutting concerns out of business code |
| **Circuit Breaker** | Calls to Razorpay, R2, MQTT | Fail fast + degrade gracefully on third-party outage |

---

## 7. Security Architecture (deliverable 18)

### 7.1 Trust boundaries

```
[ Public Internet ]  →  [ WAF / Edge (Vercel/Cloudflare) ]  →  [ API ]  →  [ PG / Redis / R2 ]
        ▲ untrusted users            ▲ rate limit, bot, TLS        ▲ authz       ▲ private network
[ Machines ] → MQTT(TLS, mutual-ish via per-machine token) → [ Broker ] → [ API ]
```

**Principle: the machine is semi-trusted.** It can report health and execute jobs, but it **cannot mint PINs, cannot create payments, cannot read another machine's jobs.** All authority flows from the cloud.

### 7.2 Controls by layer

| Layer | Controls |
|-------|----------|
| **Transport** | TLS 1.2+ everywhere; HSTS; MQTT over TLS (8883) |
| **AuthN (users)** | Better Auth — email/password + OAuth, sessions, secure cookies (HttpOnly, SameSite=Lax, Secure) |
| **AuthN (machines)** | Per-machine `machineId` + rotating `deviceSecret`; short-lived **machine JWT** for HTTPS calls; MQTT username/password = machineId/token, ACL scoped to that machine's topics only |
| **AuthZ** | RBAC (§8) enforced by guards; row-level scoping (a machine can only touch its own jobs) |
| **Files** | Encrypted at rest (R2 SSE); only ever served via presigned URLs valid ≤ 60 s; per-job key path; deleted post-print |
| **PIN** | Stored **hashed** (Argon2id) in PG; raw PIN only in Redis cache with TTL; one-time use enforced atomically (Lua/`GETDEL` + DB status guard) |
| **Payments** | Razorpay webhook **signature verification**; amount re-validated server-side; never trust client-sent amount |
| **Secrets** | All via env/secret manager; never in repo; machine secrets in OS keystore (Windows Credential Manager / Linux file mode 600) |
| **Input** | Zod validation on every boundary; file MIME/type sniffing + size/page caps; PDF sanitization on render |
| **Output** | Strict response envelope; no stack traces to clients; PII redaction in logs |
| **Audit** | Append-only `AuditLog` for every privileged action (refund, config change, machine command, role change) |
| **Headers** | helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |

### 7.3 Threat model highlights (STRIDE)

| Threat | Mitigation |
|--------|-----------|
| User pulls someone else's file | File access only via PIN→server-issued presigned URL bound to (job, machine); PIN one-time |
| Replay a captured PIN | One-time burn (atomic), 30-min expiry, machine-bound |
| Forged "paid" event | Razorpay signature verify + server-side amount check + idempotency |
| Compromised machine impersonates another | MQTT ACL + JWT scoped to its own machineId; can't subscribe/publish to other topics |
| DoS via uploads | Rate limits, size/page caps, auth required, per-user quotas |
| Stale-health charge | Health snapshot TTL bound to order; re-checked at payment time |
| Insider reads user docs | Files encrypted, never exposed in admin UI; access is logged; auto-deleted |

---

## 8. Role-Based Access Control (deliverable 19)

### 8.1 Roles

| Role | Scope | Can |
|------|-------|-----|
| `CUSTOMER` | self | upload, pay, view own jobs/PINs, request support |
| `OPERATOR` | assigned machine(s)/campus | view own machines' health & earnings, mark maintenance, raise tickets — **never** read user files |
| `SUPPORT` | global read + limited write | view jobs/users, issue refunds within policy, resolve tickets |
| `FLEET_ADMIN` | global | manage machines, provisioning, config, pricing, send commands |
| `FINANCE` | global financial | reconciliation, settlements, payouts, refunds, ledger export |
| `SUPER_ADMIN` | everything | role management, system config, destructive ops (with audit + 2FA) |
| `MACHINE` (non-human) | one machine | heartbeat, fetch assigned job, confirm/cancel, GC — scoped to self |

### 8.2 Enforcement

- **Permission model:** role → permission set (e.g., `payments:refund`, `machines:command`, `users:read`). Guards check **permissions**, not roles, so policy changes don't touch controllers.
- `@Roles()` / `@RequirePermissions()` decorators + `RolesGuard`.
- **Resource scoping:** an `OPERATOR` request for a machine is filtered by `WHERE operatorId = currentUser.id`. A `MACHINE` request for a job is filtered by `WHERE machineId = currentMachine.id`.
- Privileged actions (refund, role change, machine reboot) require **re-auth / step-up** and write an `AuditLog` row.

```
Request → AuthGuard (who?) → RolesGuard (allowed?) → Service (scoped query) → DB
```

---

## 9. Rate Limiting (deliverable 26)

Token-bucket counters in **Redis** (so limits hold across horizontally-scaled API instances).

| Surface | Limit (default, tunable) | Key |
|---------|--------------------------|-----|
| Auth (login/register/OTP) | 5 / min / IP + 10 / hour / account | IP + accountId |
| File upload | 10 / hour / user | userId |
| Order create | 20 / hour / user | userId |
| PIN verify (at machine) | 5 attempts / PIN, then lock | pinId |
| Public reads (machines list) | 60 / min / IP | IP |
| Machine heartbeat | broker-side flood protection + 1 / 10s expected | machineId |
| Webhooks (Razorpay) | allow-list source + signature (not rate-limited away) | — |
| Global per-IP | 600 / min burst guard | IP |

- Implemented via `@nestjs/throttler` with a **Redis storage adapter** + custom guards for resource-specific limits (PIN attempts).
- Responses use `429` + `Retry-After`. Limits are **per-route** and **per-identity**, not just per-IP, because campus NAT means thousands of students share one IP.

> **Why per-identity:** an entire college behind one NAT IP would trip IP-only limits instantly. We key on authenticated user/machine wherever possible.

---

## 10. API Security (deliverable 27)

- **Versioned API**: `/api/v1/...` (URI versioning) — never break existing machines/agents.
- **Auth on everything** except explicitly `@Public()` routes (health check, machine list, webhooks).
- **Idempotency-Key** header required on `POST /orders`, `POST /payments/*`, `POST /jobs/:id/complete`.
- **Webhook security**: HMAC signature verification (Razorpay), replay window, idempotent processing.
- **CORS**: allow-list of our own origins; credentials only for first-party.
- **Request size limits** + **timeout** + **payload schema validation** at the edge.
- **Response envelope** (consistent success/error) so clients never parse stack traces.
- **No secrets in URLs**; presigned URLs are short-lived and single-purpose.
- **mTLS-style machine auth** option for Pi fleet hardening (future).

Standard error envelope:
```json
{ "success": false,
  "error": { "code": "MACHINE_OFFLINE", "message": "Selected machine is offline", "correlationId": "01J…" } }
```

---

## 11. Scalability Strategy (deliverable 32)

### 11.1 Horizontal scaling

| Tier | How it scales |
|------|---------------|
| **Next.js apps** | Stateless on Vercel — scales automatically (edge + serverless) |
| **NestJS API** | Stateless Docker containers on **Render Web Service**; scale by raising the instance count behind Render's managed load balancer; sessions/state live in Redis/PG, never in-process |
| **Workers (BullMQ)** | Scale render/GC/reconcile workers independently of the API by job-queue depth |
| **MQTT broker** | EMQX cluster — shared subscriptions distribute device load across broker nodes; designed for millions of connections |
| **PostgreSQL** | Neon: autoscaling compute, read replicas for reports/admin reads; connection pooling (PgBouncer/Neon pooler) |
| **Redis** | Cluster mode for cache/locks; partition by key |
| **R2** | Object storage scales infinitely; no app concern |

### 11.2 Data-growth strategy
- **Partition** `print_jobs`, `payments`, `audit_logs` by month (range partitioning) — millions of rows stay queryable.
- **Archive** completed jobs + their (already deleted) file metadata to cold storage after N months.
- **Read models / materialized views** for dashboards refreshed async — analytics never block transactions.

### 11.3 Stateless-everywhere rule
No API instance holds machine state, sessions, queue position, or health in memory. **Everything shared lives in Redis or PG.** This is what makes "add a replica" a no-op and enables zero-downtime deploys.

### 11.4 Multi-region path (future)
- Phase 1: single region (Mumbai) — lowest latency for India.
- Phase 2: read replicas + regional MQTT brokers per zone; R2 is already global.
- Machines connect to the nearest broker; the API stays single-writer to keep money consistent.

---

## 12. Performance Optimization (deliverable 33)

| Area | Technique |
|------|-----------|
| **Health gate read** | Served from Redis (no DB hit on the hot path); < 200 ms p95 |
| **Machine list** | Cached health badges in Redis, geo-indexed query in PG, edge-cached for anonymous |
| **File render** | Offloaded to BullMQ workers, not request thread; user gets price async or via polling/WS |
| **PIN validate** | Single Redis atomic op (`GETDEL` via Lua) + one guarded DB update |
| **DB** | Proper indexes (see DB doc), connection pooling, prepared statements via Prisma, avoid N+1 with `include`/batching |
| **Payloads** | Pagination + cursor for lists; field selection; gzip/brotli |
| **Frontend** | RSC + streaming, code-splitting, image optimization, `next/font`, edge caching of static |
| **MQTT** | QoS tuned per message type (heartbeat QoS 0, commands QoS 1), retained presence |
| **Cold path vs hot path** | Reports run on read replicas / materialized views; never on the primary |

**Caching layers:** Edge (Vercel/CDN) → Redis (app cache) → PG. Each layer has an explicit TTL and invalidation rule (health = 30 s TTL, machine config = invalidate on update event).

---

## 13. Future Expansion Strategy (deliverable 34)

| Horizon | Expansion | Architectural readiness |
|---------|-----------|-------------------------|
| Near | Raspberry Pi / Industrial PC machines | Hexagonal agent — already swappable via adapter |
| Near | Wallet & subscriptions (campus plans) | `users` wallet table + ledger already designed |
| Near | Color/duplex/stapling, A3 | Pricing engine is Strategy-based; printer capabilities in machine config |
| Mid | Franchise/operator marketplace + payouts | RBAC `OPERATOR` + ledger + settlement reports already present |
| Mid | Extract `payments` / `health` to microservices | Modules already isolated behind service interfaces |
| Mid | Public API for partner kiosks | Versioned API + api-contract package |
| Long | Multi-region, multi-country | Single-writer PG + regional brokers + global R2 path defined |
| Long | ML: predictive paper/toner refill, demand forecasting, dynamic pricing | Telemetry + audit + job history already captured as the dataset |
| Long | Scan / photocopy / pay-at-machine UPI | Agent command set is extensible; commands module versioned |

**Guiding rule for all future work:** add capability behind an existing seam (adapter, strategy, module interface, command type) — never by breaking a published contract.

---

## 14. Architecture Decision Records (index)

Track major decisions as ADRs in `docs/adr/`:
- ADR-001 Modular monolith over microservices (v1)
- ADR-002 MQTT control plane + presigned-URL data plane
- ADR-003 Turborepo + pnpm monorepo
- ADR-004 Better Auth for user auth, custom token auth for machines
- ADR-005 Health snapshot bound to order (no payment on stale health)
- ADR-006 Outbox + Saga for paid⇒dispatched guarantee
- ADR-007 Hexagonal agent for hardware portability

---

## 15. Related Documents
[PRD](product-requirements.md) · [Database](database-design.md) · [API](api-specification.md) · [Machine Protocol](machine-protocol.md) · [Deployment](deployment.md) · [UI](ui-design.md) · [Roadmap](development-roadmap.md)

## 16. Sprint 4 — Print Pipeline Architecture (implemented)

The print pipeline is built from hexagonal ports so every external dependency has
a safe in-process fallback (the app boots green with no R2/Redis/LibreOffice):

- **`StoragePort`** — `R2StorageProvider` (Cloudflare R2, S3-compatible, presigned
  PUT/GET only) or `FakeStorageProvider` (in-process). Files never traverse the API.
- **`PaymentProvider`** — `PaymentSimulator` (demo, deterministic outcomes) today;
  a Razorpay adapter binds the same interface in Sprint 5 with no service change.
  ALL payment business logic lives in `PaymentService`, never in the provider.
- **`FileConverterPort`** — `StubFileConverter` (default) or `LibreOfficeFileConverter`
  (`FILE_CONVERTER=libreoffice`). PDF metadata uses pure-JS `pdf-lib`.
- **`VirusScanPort`** / **`NotificationProvider`** — noop/log stubs, documented seams.

**Order lifecycle** is a strict state machine (`ORDER_TRANSITIONS` map + `assertTransition`
guard); every transition is audited. The **health gate** runs before payment —
`OrderService.verifyMachine` reuses `MachineHeartbeatService.getHealth`; a `BLOCKED`
(or absent) machine cannot be paid.

**Queue**: a DB-backed `print_jobs` table with an atomic claim (`updateMany` guarded
by status + visibility timeout + `lockToken`) provides FIFO + locking + retry +
dead-letter + restart recovery with no external queue. The seam
(`MachineQueueService`) lets BullMQ replace the storage later.

**PIN trust boundary**: the PIN is entered **at the machine** (`/machine/pin/redeem`,
machine JWT), not the customer app — guaranteeing physical presence. The agent stays
a generic executor (Windows == Pi); only the `PrinterPort.print` adapter differs.

### ADR (Sprint 4)
- **ADR-S4-1**: DB-backed queue over BullMQ/Redis — deterministic, testable, no infra.
- **ADR-S4-2**: PIN redeemed at the machine, not the web app — physical-presence trust.
- **ADR-S4-3**: Money as integer paise everywhere — no floating-point currency.
- **ADR-S4-4**: Provider-agnostic payment (demo simulator) — Razorpay-ready for Sprint 5.
