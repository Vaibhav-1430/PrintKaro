# Print Karo — API Specification & Engineering Standards

**Document owner:** Principal Backend Architect
**Status:** v1.0 · 2026-06-30
**Covers deliverables:** 9 REST API · 10 Authentication Flow · 28 Environment Variables · 29 Naming Conventions · 30 Coding Standards
**Base URL:** `https://api.printkaro.in/api/v1`

---

## 1. API Conventions

| Aspect | Convention |
|--------|-----------|
| Style | REST, resource-oriented, JSON |
| Versioning | URI: `/api/v1` (machines pin to a version; never break it) |
| Auth | Session cookie (web) or Bearer JWT (machine); `@Public()` for open routes |
| Validation | Zod schemas from shared `@print-karo/api-contract` |
| Idempotency | `Idempotency-Key` header on all unsafe money/job mutations |
| Pagination | Cursor-based: `?cursor=&limit=` → `{ data, nextCursor }` |
| Errors | Consistent envelope (below); never leak internals |
| Correlation | `X-Correlation-Id` accepted/echoed; generated if absent |
| Rate limits | `429` + `Retry-After`; see [Architecture §9](system-architecture.md) |
| Time | All timestamps ISO-8601 UTC |
| Money | Integer paise in all request/response bodies |

### 1.1 Response envelope

```jsonc
// success
{ "success": true, "data": { /* ... */ }, "meta": { "correlationId": "01J…" } }

// error
{ "success": false,
  "error": { "code": "MACHINE_OFFLINE", "message": "Selected machine is offline",
             "details": [], "correlationId": "01J…" } }
```

### 1.2 Canonical error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Zod failed; `details[]` has field errors |
| `UNAUTHENTICATED` | 401 | No/expired session or token |
| `FORBIDDEN` | 403 | Authenticated but lacks permission |
| `NOT_FOUND` | 404 | Resource missing or not owned |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different payload |
| `MACHINE_OFFLINE` | 409 | Health gate: machine not reachable |
| `MACHINE_NOT_READY` | 409 | Health gate: printer/paper/toner/queue fails |
| `HEALTH_SNAPSHOT_STALE` | 409 | Order's health binding expired; re-check |
| `PIN_INVALID` | 401 | Wrong/expired/used PIN |
| `PIN_LOCKED` | 423 | Too many attempts |
| `PAYMENT_FAILED` | 402 | Razorpay declined |
| `RATE_LIMITED` | 429 | Throttle hit |
| `INTERNAL_ERROR` | 500 | Unexpected; correlationId for tracing |

---

## 2. Authentication Flow (deliverable 10)

### 2.1 User authentication (Better Auth)

```
┌────────┐                 ┌──────────────┐              ┌──────────┐
│ Browser│                 │  NestJS API  │              │ Postgres │
└───┬────┘                 └──────┬───────┘              └────┬─────┘
    │  POST /auth/sign-up         │                           │
    │  {email,password}           │                           │
    │ ───────────────────────────▶│ Better Auth hashes pw     │
    │                             │ ─────── create User ──────▶│
    │                             │ ◀────── session ──────────│
    │ ◀── Set-Cookie: session ────│ (HttpOnly, Secure,        │
    │     emailVerify token (mail)│  SameSite=Lax)            │
    │                             │                           │
    │  GET /me  (cookie sent)     │                           │
    │ ───────────────────────────▶│ AuthGuard validates       │
    │ ◀── user profile ───────────│ session                   │
```

- **Sessions** are server-side (DB-backed), revocable, sliding-expiry. Cookie is `HttpOnly + Secure + SameSite=Lax`.
- **OAuth** (Google) via Better Auth providers → same `User`, linked `Account`.
- **Email verification** + **password reset** via `Verification` tokens.
- **Step-up auth**: privileged staff actions (refund, role change, machine reboot) require recent re-auth / 2FA; enforced by a `@StepUp()` guard.

### 2.2 Machine authentication (custom, two-channel)

A machine is provisioned once and then authenticates itself on **both** the HTTPS and MQTT channels.

```
PROVISIONING (one-time, by FLEET_ADMIN):
   Admin creates Machine → API generates machineId + deviceSecret (shown once)
   → installer writes them to the machine's OS keystore.

RUNTIME (HTTPS):
   Agent POST /machine/auth/token  { machineId, deviceSecretProof }
        → API verifies against MachineSecret.secretHash
        → returns short-lived machineJWT (e.g. 15 min) + refresh
   Agent calls machine endpoints with  Authorization: Bearer <machineJWT>
        → MachineAuthGuard validates JWT, sets currentMachine (scoped to its own id)

RUNTIME (MQTT):
   Agent connects with username=mqttUsername, password=deviceSecret(or token)
        → Broker ACL restricts it to topics  pk/m/{machineId}/#  only.
```

**Why two channels with one identity:** MQTT carries control (heartbeat/commands), HTTPS carries authenticated data ops (token, job confirm, file presign request). Both derive authority from the same `MachineSecret`, and both are scoped so **a machine can never act as another machine**. Secrets rotate on a schedule; rotation is a `MachineCommand` (`SELF_UPDATE`/credential refresh).

### 2.3 Authorization
Guards run in order: `AuthGuard` → `RolesGuard`/`MachineAuthGuard` → service-level resource scoping. See [Architecture §8 RBAC](system-architecture.md).

---

## 3. REST API Design (deliverable 9)

> Conventions: `🔒` auth required, `👤` user-scoped, `🛠️` admin/role-gated, `🤖` machine-only, `🌐` public. All list endpoints are cursor-paginated.

### 3.1 Auth & Profile
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/auth/sign-up` | 🌐 | Register |
| POST | `/auth/sign-in` | 🌐 | Login (sets session) |
| POST | `/auth/sign-out` | 🔒 | Logout |
| POST | `/auth/verify-email` | 🌐 | Confirm email |
| POST | `/auth/forgot-password` | 🌐 | Start reset |
| POST | `/auth/reset-password` | 🌐 | Complete reset |
| GET | `/me` | 🔒 | Current user profile |
| PATCH | `/me` | 🔒👤 | Update profile |

### 3.2 Files
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/files/presign-upload` | 🔒👤 | Get presigned R2 PUT URL + fileId |
| POST | `/files/:id/complete` | 🔒👤 | Mark upload done → triggers render worker |
| GET | `/files/:id` | 🔒👤 | File metadata + status (pages, color, price-ready) |

`POST /files/presign-upload` request/response:
```jsonc
// → { "originalName": "thesis.pdf", "mimeType": "application/pdf", "sizeBytes": 1048576 }
// ← { "fileId": "cuid", "uploadUrl": "https://r2…?X-Amz…", "expiresIn": 120 }
```
The browser PUTs bytes **directly to R2** (API never proxies file bytes). Then calls `/files/:id/complete`; a BullMQ worker renders to print-ready PDF, counts pages, detects color, sets `status=READY`.

### 3.3 Machines & Health Gate
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/machines` | 🌐 | List machines `?near=lat,lng&radiusKm=&campusId=` with live health badge |
| GET | `/machines/:id` | 🌐 | Machine detail + current health |
| GET | `/machines/:id/health` | 🌐 | **The pre-payment health snapshot** (from Redis) |
| POST | `/machines/:id/health-gate` | 🔒👤 | Evaluate gate for a specific job (pages, color) → pass/fail + reasons |

`POST /machines/:id/health-gate` response (the gate decision):
```jsonc
{ "machineId": "…", "jobId": "…",
  "passed": false,
  "checks": {
    "online": true, "printerConnected": true, "printerReady": true,
    "paperSufficient": false, "tonerSufficient": true,
    "queueWithinLimit": true, "notInMaintenance": true },
  "blockingReasons": ["PAPER_OUT"],
  "estimatedWaitSec": 0,
  "healthCapturedAt": "2026-06-30T10:00:00Z",
  "snapshotTtlSec": 90 }
```
**A `passed:false` gate makes `/orders` reject with `MACHINE_NOT_READY`.**

### 3.4 Pricing & Orders
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/pricing/quote` | 🔒👤 | Quote for {fileId, machineId, copies, color, duplex} |
| POST | `/orders` | 🔒👤 | Create order (re-runs health gate, binds snapshot) — `Idempotency-Key` required |
| GET | `/orders/:id` | 🔒👤 | Order status |

`POST /orders` is the critical guarded mutation:
```jsonc
// → headers: Idempotency-Key: <uuid>
//   body: { "fileId": "…", "machineId": "…", "copies": 1, "colorMode": "BW", "duplex": false }
// server: re-evaluates health gate → if pass, creates PrintJob(CREATED), Order(AWAITING_PAYMENT),
//         freezes healthSnapshot+healthCapturedAt, creates Razorpay order.
// ← { "orderId": "…", "amount": 1200, "currency": "INR",
//     "razorpayOrderId": "order_xyz", "jobId": "…", "healthTtlSec": 90 }
```

### 3.5 Payments
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/payments/webhook` | 🌐(signed) | Razorpay webhook (signature-verified, idempotent) |
| POST | `/payments/:orderId/verify` | 🔒👤 | Client-side confirm (defense-in-depth; truth is the webhook) |
| GET | `/payments/:id` | 🔒👤 | Payment status |
| POST | `/refunds` | 🛠️ | Manual refund (SUPPORT/FINANCE) — audited, step-up |

**Webhook is the source of truth.** On `payment.captured`: verify signature → re-check amount vs order → mark `PAID` → **mint PIN** → publish `PRINT` command to machine (via Outbox). All idempotent on `razorpayPaymentId`.

### 3.6 PIN (collection)
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/jobs/:id/pin` | 🔒👤 | Reveal PIN to the owning user (post-payment) |
| POST | `/machine/pin/verify` | 🤖 | Machine submits entered PIN → returns presigned file URL if valid |

`POST /machine/pin/verify` (machine-only):
```jsonc
// → Bearer <machineJWT> ; { "code": "483920" }
// server: atomic one-time check (Redis GETDEL + DB guard), machine-bound, attempt-limited.
// ← on success: { "jobId": "…", "fileUrl": "https://r2…?X-Amz… (60s)",
//                 "copies": 1, "colorMode": "BW", "duplex": false, "pages": 12 }
// ← on fail: 401 PIN_INVALID  (or 423 PIN_LOCKED after maxAttempts)
```

### 3.7 Jobs (machine + user)
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/jobs` | 🔒👤 | User's job history |
| GET | `/jobs/:id` | 🔒👤 | Job detail/status |
| POST | `/machine/jobs/:id/downloading` | 🤖 | Agent: starting download |
| POST | `/machine/jobs/:id/printing` | 🤖 | Agent: print started |
| POST | `/machine/jobs/:id/complete` | 🤖 | Agent: printed + file deleted — `Idempotency-Key` |
| POST | `/machine/jobs/:id/fail` | 🤖 | Agent: print failed → triggers refund saga |

### 3.8 Machine telemetry & commands
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/machine/auth/token` | 🤖 | Exchange device secret → machineJWT |
| POST | `/machine/heartbeat` | 🤖 | HTTPS fallback heartbeat (primary is MQTT) |
| GET | `/machine/commands/next` | 🤖 | HTTPS fallback command pull |
| POST | `/machine/commands/:id/ack` | 🤖 | Acknowledge a command |
| POST | `/machines/:id/commands` | 🛠️ | Admin issues a command (reboot, maintenance…) — audited |

### 3.9 Admin / Fleet / Reports
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| POST | `/machines` | 🛠️ | Provision a machine (returns one-time secret) |
| PATCH | `/machines/:id` | 🛠️ | Update config/status |
| POST | `/machines/:id/maintenance` | 🛠️ | Toggle maintenance |
| GET | `/admin/fleet/overview` | 🛠️ | Fleet KPIs (online %, queues, alerts) |
| GET | `/admin/users` | 🛠️ | User management |
| PATCH | `/admin/users/:id/role` | 🛠️(SUPER) | Change role — audited, step-up |
| GET | `/reports/revenue` | 🛠️(FINANCE) | Revenue/settlement |
| GET | `/reports/reconciliation` | 🛠️(FINANCE) | Razorpay vs print-success reconciliation |
| GET | `/support/tickets` | 🛠️ | Tickets |

### 3.10 System
| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/health` | 🌐 | Liveness (API up) |
| GET | `/ready` | 🌐 | Readiness (DB/Redis/MQTT reachable) |
| GET | `/metrics` | internal | Prometheus metrics |

---

## 4. Environment Variables (deliverable 28)

Validated at boot by a Zod schema (`config/env.schema.ts`); the app **refuses to start** if any required var is missing/invalid. Never commit `.env`; provide `.env.example`.

### 4.1 Backend API (`apps/api`)
```bash
# Core
NODE_ENV=production
PORT=10000                                    # Render sets $PORT; bind to it (do not hardcode)
API_BASE_URL=https://api.printkaro.in
CORS_ORIGINS=https://printkaro.in,https://admin.printkaro.in
# (Render auto-injects RENDER, RENDER_SERVICE_NAME, RENDER_GIT_COMMIT — usable for log/release tagging)

# Database (Neon)
DATABASE_URL=postgresql://…?pgbouncer=true   # pooled, for app
DATABASE_URL_UNPOOLED=postgresql://…          # direct, for migrations

# Redis (Render Key Value — internal connection string from the Blueprint)
REDIS_URL=rediss://…

# Auth (Better Auth)
BETTER_AUTH_SECRET=…            # 32+ byte random
BETTER_AUTH_URL=https://api.printkaro.in
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…

# Machine auth
MACHINE_JWT_SECRET=…
MACHINE_JWT_TTL=900            # seconds
MACHINE_SECRET_PEPPER=…        # added before hashing device secrets

# Cloudflare R2
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=printkaro-files
R2_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
R2_PRESIGN_UPLOAD_TTL=120
R2_PRESIGN_DOWNLOAD_TTL=60

# Razorpay
RAZORPAY_KEY_ID=…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…

# MQTT
MQTT_URL=mqtts://broker.printkaro.in:8883
MQTT_API_USERNAME=…            # backend's broker identity
MQTT_API_PASSWORD=…

# PIN / business rules
PIN_LENGTH=6
PIN_TTL_SECONDS=1800
HEALTH_SNAPSHOT_TTL_SECONDS=90
HEARTBEAT_OFFLINE_THRESHOLD_SECONDS=30

# Observability
LOG_LEVEL=info
SENTRY_DSN=…
OTEL_EXPORTER_OTLP_ENDPOINT=…
```

### 4.2 Web apps (`apps/web-*`)
```bash
NEXT_PUBLIC_API_BASE_URL=https://api.printkaro.in/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=…        # public key only
NEXT_PUBLIC_SENTRY_DSN=…
NEXT_PUBLIC_APP_ENV=production
```

### 4.3 Machine Agent (`apps/agent`)
```bash
PK_API_BASE_URL=https://api.printkaro.in/api/v1
PK_MQTT_URL=mqtts://broker.printkaro.in:8883
PK_MACHINE_ID=cuid                   # from provisioning, stored in OS keystore
PK_DEVICE_SECRET=…                   # from provisioning, stored in OS keystore
PK_HEARTBEAT_INTERVAL_MS=15000
PK_TEMP_DIR=/var/lib/printkaro/tmp
PK_LOG_LEVEL=info
```

> **Rule:** public-safe values use `NEXT_PUBLIC_`/`PK_` prefixes; all secrets are server/keystore only and never reach the browser bundle.

---

## 5. Naming Conventions (deliverable 29)

| Thing | Convention | Example |
|-------|-----------|---------|
| Files (TS) | kebab-case | `print-job.service.ts` |
| NestJS classes | PascalCase + role suffix | `PrintJobService`, `OrdersController`, `RolesGuard` |
| React components | PascalCase | `MachineCard.tsx`, `HealthBadge.tsx` |
| Variables/functions | camelCase | `healthSnapshot`, `mintPin()` |
| Constants/enums | UPPER_SNAKE | `PIN_TTL_SECONDS`, `JobStatus.PAID` |
| Types/interfaces | PascalCase, no `I` prefix | `PrintJob`, `HealthGateResult` |
| DB tables | snake_case plural | `print_jobs`, `payment_ledger` |
| DB columns | snake_case | `razorpay_payment_id` |
| Prisma models | PascalCase singular | `PrintJob` (mapped to `print_jobs`) |
| API routes | kebab-case, plural nouns | `/print-jobs`, `/machines/:id/health` |
| MQTT topics | `pk/<scope>/<id>/<channel>` | `pk/m/{machineId}/heartbeat` |
| Env vars | UPPER_SNAKE, prefixed | `PK_…`, `NEXT_PUBLIC_…`, `R2_…` |
| Branches | `type/short-desc` | `feat/health-gate`, `fix/pin-replay` |
| Commits | Conventional Commits | `feat(payments): verify webhook signature` |
| Correlation IDs | ULID | sortable, traceable |

---

## 6. Coding Standards (deliverable 30)

### 6.1 Language & tooling
- **TypeScript strict mode everywhere** (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **ESLint** (shared `@print-karo/config-eslint`) + **Prettier**; CI fails on lint/format violations.
- **No `any`** (use `unknown` + narrowing); no non-null `!` except provably safe with a comment.
- Imports sorted; absolute imports via TS path aliases.

### 6.2 Backend (NestJS) rules
- Controllers are thin: validate → delegate → shape. **No business logic in controllers.**
- **Services own business rules**; only services open Prisma transactions.
- **Repositories** are the only place that touch Prisma directly.
- Every DTO has a **Zod schema** in `@print-karo/api-contract`; validate at the boundary with `ZodValidationPipe`.
- All money math in **paise integers**; a shared `Money` helper for formatting.
- All external calls (Razorpay, R2, MQTT) wrapped with timeout + retry + circuit breaker.
- **No throwing strings** — throw typed domain exceptions mapped by the global exception filter.
- State transitions go through a **single `transition()` guard** per state machine; illegal transitions throw.

### 6.3 Frontend (Next.js) rules
- **Server Components by default**; `"use client"` only when interactive.
- Data fetching via the typed `api-client` (shares `api-contract` types) — no untyped `fetch`.
- UI from `@print-karo/ui` (shadcn/ui); no ad-hoc inline styles; Tailwind tokens only.
- Forms validated with the **same Zod schemas** as the backend.
- Accessibility: semantic HTML, labels, focus states, keyboard nav (kiosk especially).

### 6.4 Testing
- **Unit** (Vitest/Jest) for services, pricing, state machines, gate logic — the brain.
- **Integration** (Testcontainers: PG + Redis) for repositories and money flows.
- **E2E** (Playwright) for the upload→pay→PIN happy path and gate-blocking path.
- **Contract tests** between API and consumers via `api-contract`.
- Critical-path coverage target ≥ 85%; money/PIN/gate paths near 100%.

### 6.5 Git & review
- Trunk-based with short-lived branches; PRs required; ≥1 review; CI green to merge.
- Conventional Commits drive changelog/versioning.
- No secrets in code (CI secret-scanning blocks merges).
- Every PR updates relevant docs in `/docs` when behavior/contracts change.

### 6.6 Error & logging discipline
- Structured logs (pino) with `correlationId`, `userId`/`machineId`, never PII or file contents.
- User-facing errors use the envelope; internals only in logs + Sentry.

---

## 7. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [Database](database-design.md) · [Machine Protocol](machine-protocol.md) · [Deployment](deployment.md)

---

## 8. Machine Infrastructure APIs (Sprint 3 — implemented)

> Sprint 3 implements the machine control plane over **authenticated HTTPS**
> (machine JWT). The MQTT transport described in [Machine Protocol](machine-protocol.md)
> is the future evolution; the request/response *contracts* below are stable and
> Sprint 4 reuses them unchanged.

### 8.1 Machine-authenticated endpoints (`Authorization: Bearer <machineJWT>`, role `MACHINE`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/machine/login` | id+secret → access + refresh JWT (rotation, reuse-detection) |
| POST | `/machine/refresh` | rotate refresh token |
| POST | `/machine/logout` | revoke all refresh tokens for this machine |
| POST | `/machine/heartbeat` | ingest a heartbeat → returns computed health snapshot |
| GET | `/machine/status` | current health snapshot (stale ⇒ BLOCKED) |
| GET | `/machine/config` | server-owned cadences + capabilities |
| GET | `/machine/jobs` | queue poll — Sprint 3 always `{hasJob:false}` |
| POST | `/machine/job/accept` | acknowledge a dispatched job (Sprint 4) |
| POST | `/machine/job/reject` | reject a dispatched job (Sprint 4) |
| POST | `/machine/log` | batch-upload agent event logs |

`POST /machine/heartbeat` body (Zod `heartbeatSchema`): `runtimeState`, `printerState`,
`printerName?`, `cpu/ram/disk/temperature?`, `networkOnline`, `internet`,
`paperRemaining?`, `paperSize?`, `color/duplexAvailable`, `ink/tonerLevel?`,
`currentJobId?`, `errorCode?`, `timestamp` (ISO). Response = `MachineHealthResponse`
(`healthScore` 0–100, `gateResult` READY/WARNING/BLOCKED, `blockingReasons[]`, `checks{}`).

### 8.2 Admin/operator machine management (Better Auth session + permissions)

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| POST | `/admin/machines` | `machine:register` (ADMIN+) | register machine → one-time secret |
| GET | `/admin/machines` | `machine:view:assigned` | list fleet (operators scoped to own) |
| GET | `/admin/machines/:id` | `machine:view:assigned` | machine detail + health/printer |
| GET | `/admin/machines/:id/logs` | `machine:logs:view` (ADMIN+) | machine event logs |
| POST | `/admin/machines/:id/suspend` | `machine:suspend` (ADMIN+) | suspend lifecycle |
| POST | `/admin/machines/:id/reactivate` | `machine:suspend` (ADMIN+) | reactivate |
| POST | `/admin/machines/:id/restart` | `machine:restart` | request restart (audited) |

### 8.3 Real-time
Socket.IO namespace `/machines` broadcasts `machine.health` and `machine.state`
to subscribed admin dashboards.

## 9. Core Printing Pipeline APIs (Sprint 4 — implemented)

Sprint 4 adds the upload → health gate → payment → PIN → print flow. Files never
pass through the API: clients PUT to a presigned URL and the agent GETs from one.
**Demo payment only** — a `PaymentSimulator` behind a provider-agnostic interface
(Razorpay drops in for Sprint 5 with no business-logic change). All money is
integer **paise**.

### 9.1 Customer endpoints (session + permission)

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| POST | `/uploads/request` | `order:create` | presigned PUT ticket (+ duplicate flag) |
| POST | `/uploads/:id/confirm` | `order:create` | scan → convert → metadata → validate |
| GET | `/uploads/:id` · `/uploads` | `order:create` | upload status / list |
| POST | `/pricing/calculate` | `order:create` | price a set of options (paise) |
| POST | `/orders` | `order:create` | create order from upload + machine |
| POST | `/orders/:id/options` | `order:create` | set print options → recalc price |
| POST | `/orders/:id/verify-machine` | `order:create` | **health gate** → PAYMENT_PENDING |
| GET | `/orders` · `/orders/:id` | `order:view` | my orders / detail (+ PIN status) |
| POST | `/orders/:id/cancel` | `order:cancel` | cancel before payment |
| POST | `/payments/:orderId/initiate` | `order:pay` | begin payment (provider order) |
| POST | `/payments/:orderId/simulate` | `order:pay` | demo outcome SUCCESS/FAILURE/TIMEOUT/CANCELLED |
| GET | `/payments/:orderId` | `order:view` | payment status |
| GET | `/notifications` · POST `/notifications/:id/read` | (any auth) | in-app notifications |

### 9.2 Admin / operator endpoints

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/admin/orders` · `/admin/orders/:id` | `order:view:all` | all orders / detail |
| GET | `/admin/revenue` | `revenue:view:all` | revenue summary (gross/refunded/net) |
| GET | `/admin/pins/active` | `pin:view` | active (unredeemed) PINs |
| POST | `/admin/payments/:id/refund` | `refund:manage` | refund a succeeded payment |
| GET/POST | `/admin/pricing/rules` | `pricing:manage` (SUPER_ADMIN) | manage pricing rules |
| GET | `/operator/orders` · `/operator/revenue` | `order:view:assigned` / `operator:revenue:view` | scoped to assigned machines |

### 9.3 Machine endpoints (PIN-driven dispatch)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/machine/pin/redeem` | MACHINE | redeem a PIN at the keypad → unlock + dispatch job |
| GET | `/machine/jobs` | MACHINE | claim the next dispatched job (atomic) |
| POST | `/machine/job/accept` | MACHINE | confirm printing started → order PRINTING |
| POST | `/machine/job/reject` | MACHINE | requeue or dead-letter |
| POST | `/machine/job/report` | MACHINE | report success/failure → order COMPLETED/FAILED |

The job payload (`MachineJob`) carries a presigned `downloadUrl`, the file
`checksum`, and the print options. The PIN is entered **at the machine** (not the
customer web app), guaranteeing physical presence.
