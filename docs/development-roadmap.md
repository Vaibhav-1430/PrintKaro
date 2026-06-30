# Print Karo — Development Roadmap

**Document owner:** CTO
**Status:** v1.0 · 2026-06-30
**Covers deliverable:** 35 Complete Development Roadmap
**Strategy:** ship the riskiest invariant first (money + health gate + one-time PIN), prove it on one machine, then harden, then scale the fleet.

---

## 1. Guiding Sequence

> **Build order is risk order.** The thing most likely to kill the company is "user paid, couldn't print, lost trust." So the **health gate → payment → one-time PIN → print → refund** loop is built and proven before anything cosmetic. Everything else (admin polish, multi-campus, analytics) layers on a correct core.

```
Phase 0  Foundations  ──▶ Phase 1  Vertical Slice (1 machine, real money)
   ──▶ Phase 2  Fleet & Admin ──▶ Phase 3  Hardening & Pilot
   ──▶ Phase 4  Scale & Multi-Campus ──▶ Phase 5  Expansion
```

---

## 2. Phase 0 — Foundations (Weeks 1–3)

**Goal:** the monorepo, contracts, and infra skeleton exist; "hello world" deploys end-to-end.

- [ ] Turborepo + pnpm monorepo; `apps/*` + `packages/*` scaffolding ([Architecture §5](system-architecture.md)).
- [ ] Shared packages: `api-contract` (Zod), `ui` (tokens + shadcn), `logger`, `mqtt-topics`, `constants`, `config-*`.
- [ ] NestJS API skeleton: config (Zod env validation), Prisma, Redis, global filter/interceptor, `/health` + `/ready`.
- [ ] Prisma schema from [Database Design](database-design.md); first migration; seed script.
- [ ] Better Auth wired (sign-up/in, sessions, guards); RBAC roles + permission guards.
- [ ] CI: lint, typecheck, unit, build (Turbo cache); Dockerfiles; preview deploys (Vercel + Neon branch).
- [ ] Local dev compose: Postgres, Redis, EMQX, MinIO (R2-compatible).

**Exit criteria:** a logged-in user hits an authenticated endpoint in a deployed preview; CI green; migrations run in CI.

---

## 3. Phase 1 — The Vertical Slice (Weeks 4–9) ★ most important

**Goal:** one real machine, one real rupee, one real print — the full invariant loop working. This is the make-or-break phase.

### Backend
- [ ] **Files:** presigned R2 upload, `/complete`, BullMQ **render-to-PDF** worker, page count + color detect.
- [ ] **Machines + Health:** registration/provisioning (one-time secret), MQTT ingest, `HealthSnapshot`, Redis live cache w/ TTL-based offline.
- [ ] **Health Gate:** `/machines/:id/health-gate` job-aware computation ([Machine Protocol §3](machine-protocol.md)).
- [ ] **Pricing engine** (Strategy) + `/pricing/quote`.
- [ ] **Orders:** `/orders` with idempotency + **frozen health snapshot binding**.
- [ ] **Payments:** Razorpay order create, **webhook signature verify**, amount re-check, **Outbox** dispatch.
- [ ] **PIN:** mint (Argon2id hash + Redis copy), one-time atomic verify (`GETDEL` + DB guard), expiry, attempt lock.
- [ ] **Jobs:** full state machine + transition guard; queue (Redis ZSET) + dispatch lock.
- [ ] **Refund saga:** auto-refund on FAIL/EXPIRE; append-only ledger.

### Agent (Windows laptop first)
- [ ] MQTT client (reconnect, LWT presence) + HTTPS fallback.
- [ ] Heartbeat collector (printer status via Windows adapter, consumables estimate).
- [ ] Job runner: PIN-triggered presigned download → print → confirm → **secure delete**.
- [ ] Command handler + reconciler (crash recovery, orphan file sweep).
- [ ] **Hexagonal printer port** + `windows.adapter` (Pi adapter stubbed).

### Frontend
- [ ] Customer Portal: upload → configure → select machine → gate checklist → Razorpay checkout → PIN screen → track.
- [ ] Machine Portal kiosk: idle → PinPad → verifying/downloading/printing/done.

### Tests
- [ ] E2E golden path + **gate-blocking path** (offline/paper-out must block pay).
- [ ] Money/PIN/gate unit + integration tests near 100%.

**Exit criteria:** From a phone, a real user uploads, pays a real ₹ via Razorpay, walks to the laptop, enters the PIN, the document prints, the file is deleted, the PIN is dead, and a forced failure auto-refunds. **All six invariants from the [PRD §8](product-requirements.md) demonstrably hold.**

---

## 4. Phase 2 — Fleet & Admin (Weeks 10–15)

**Goal:** operate more than one machine and give ops/finance the tools to run them.

- [ ] **Admin Dashboard:** Overview KPIs, FleetMap, Machines (detail + commands), Jobs, Payments, Refunds, Users, Operators, Tickets, Settings — role-gated.
- [ ] **Commands:** remote reboot/maintenance/test-page/clear-queue (audited `MachineCommand`).
- [ ] **Notifications:** email/SMS/push for PIN ready, printed, refunded (queue-driven).
- [ ] **Reports:** revenue, **reconciliation** (Razorpay vs ledger vs job outcomes), operator earnings.
- [ ] **Audit log** surfaced; step-up auth on privileged actions.
- [ ] **Operators/Campus** model + assignment + payout fields.
- [ ] Multi-machine queue/ETA, alerting thresholds, fleet online %.

**Exit criteria:** Ops can provision, monitor, command, and refund across several machines without DB access; finance can reconcile a day's money.

---

## 5. Phase 3 — Hardening & Pilot (Weeks 16–21)

**Goal:** production-grade reliability/security; run a real single-college pilot.

- [ ] **Security pass:** rate limiting (Redis), helmet/CSP, CORS lockdown, secret rotation for machines, SAST/Trivy in CI, pen-test of file-isolation + PIN-replay + webhook-forgery.
- [ ] **Observability:** Prometheus/Grafana, OpenTelemetry tracing by `correlationId`, Sentry, SLO dashboards, synthetic golden-path monitor, PagerDuty + runbooks.
- [ ] **Resilience:** circuit breakers (Razorpay/R2/MQTT), Outbox dispatcher hardening, reconciliation worker, GC worker for orphaned files.
- [ ] **Backups/DR:** Neon PITR + nightly dumps, restore drill, DR runbook + first game day.
- [ ] **Load test:** simulate 10k concurrent users + 100 machine simulators; tune indexes, pooling, cache TTLs.
- [ ] **Pilot:** 5–10 machines at one campus; collect print-success rate, refund rate, support tickets.

**Exit criteria:** SLOs met under load; pilot print-success ≥ 98%, involuntary refunds ≤ 0.5%; DR drill passes; security findings closed.

---

## 6. Phase 4 — Scale & Multi-Campus (Weeks 22–30)

**Goal:** scale the fleet and the org.

- [ ] **Raspberry Pi target:** build `cups.adapter`, arm64 agent, systemd installer — **zero backend/protocol change** ([Machine Protocol §9](machine-protocol.md)). Validate laptop↔Pi parity.
- [ ] **Horizontal scale:** API replicas + LB, BullMQ worker autoscaling, EMQX cluster + shared subscriptions, Neon read replicas for reports, Redis cluster.
- [ ] **Data growth:** partition `print_jobs`/`payments`/`audit_logs`/`payment_ledger`; archival jobs; materialized views for dashboards.
- [ ] **Self-update channel:** canary→staged→fleet agent rollout with auto-halt + rollback.
- [ ] **Multi-campus ops:** operator marketplace basics, automated **payouts/settlements**, per-campus pricing.
- [ ] Wallet & campus subscription plans (schema already supports ledger/wallet).

**Exit criteria:** mixed laptop/Pi fleet of 100+ machines across multiple campuses; control plane scales horizontally with no in-process state; reports run off replicas.

---

## 7. Phase 5 — Expansion (Quarter 3+)

**Goal:** grow capability behind existing seams (no contract breaks).

- [ ] Color/duplex/A3/stapling via pricing Strategy + machine capabilities.
- [ ] Pay-at-machine (UPI) + scan/photocopy via extended command set.
- [ ] Extract `payments`/`health` into microservices if scale demands (modules already isolated).
- [ ] Public partner API (versioned, `api-contract`-backed) for third-party kiosks.
- [ ] ML on captured telemetry: predictive paper/toner refill, demand forecasting, dynamic pricing.
- [ ] Multi-region: regional MQTT brokers + read replicas, single-writer PG for money consistency.

---

## 8. Team & Workstreams

| Workstream | Owns | Phases peak |
|------------|------|-------------|
| **Platform/Backend** | API, modules, money, gate, queue | 1–4 |
| **Edge/Agent** | Agent, adapters, MQTT, reconciler | 1, 4 |
| **Frontend** | Customer, Admin, Kiosk | 1–2 |
| **DevOps/SRE** | CI/CD, infra, observability, DR | 0, 3 |
| **Design** | Design system, flows, kiosk UX | 0–2 |
| **Security** | Threat model, pen-test, RBAC, secrets | 3 |

A 4–6 engineer team can deliver Phases 0–3 (pilot-ready) in roughly **~5 months**; Phase 4 scale work runs in parallel once the core is frozen.

---

## 9. Milestones & Definition of Done

| Milestone | DoD |
|-----------|-----|
| **M1 Foundations** | CI green, preview deploys, auth works, schema migrated |
| **M2 First Print** ★ | Real payment → PIN → print → delete → refund on one laptop; all 6 invariants hold |
| **M3 Fleet Ops** | Admin/finance run multiple machines, reconcile money, no DB access needed |
| **M4 Pilot** | Single-campus pilot, SLOs met, success ≥ 98%, DR drill passed |
| **M5 Scale** | Laptop+Pi parity, horizontal scale proven, multi-campus, payouts |
| **M6 Expand** | New capabilities (color, UPI-at-machine, partner API) without contract breaks |

---

## 10. Top Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Paid-but-not-printed | Health gate + Outbox + Saga + auto-refund + reconciliation (built in Phase 1) |
| File privacy breach | Per-job presigned URLs, one-time PIN, encryption, auto-delete, no staff access, audit |
| Flaky campus networks | MQTT + HTTPS fallback + edge autonomy + reconciliation |
| Hardware lock-in | Hexagonal agent; Pi validated in Phase 4 with zero protocol change |
| Payment disputes | Immutable ledger + daily reconciliation + full refund trail |
| Scaling pain later | Stateless API, Redis-backed shared state, partitioning + replicas designed from day 1 |
| Scope creep | Build order = risk order; cosmetic/expansion work strictly after the core invariant loop |

---

## 11. Sprint progress log

| Sprint | Scope | Status |
|--------|-------|--------|
| **1** | Monorepo foundation (Turborepo, Next×3, NestJS, Prisma, Better Auth, Docker, CI) | ✅ Complete |
| **2** | Authentication & Identity (RBAC, sessions, machine JWT, audit, password policy) | ✅ Complete |
| **3** | **Machine infrastructure + Windows agent** (registration, heartbeat, health gate, queue infra, logs, config, dashboard, hexagonal Electron agent) | ✅ Complete |
| **4** | **Core printing pipeline** (upload→R2, conversion, pricing, orders, demo payment, PIN, DB-backed queue dispatch, agent print runner, dashboards) | ✅ Complete |
| 5 | Real payments (Razorpay), coupons, GST, invoices, wallet, refunds | ⏭ Next |

### Sprint 4 delivered
- 11 new tables (uploads, file_metadata, orders, print_options, payments, transactions, pins, receipts, notifications, print_jobs, pricing_rules) + 8 enums + 22 audit actions; additive-only.
- Hexagonal ports with safe fallbacks: `StoragePort` (R2 | Fake), `PaymentProvider` (Simulator | future Razorpay), `FileConverterPort` (stub | LibreOffice), `VirusScanPort` (noop), `NotificationProvider` (log).
- Modules: Upload (validation/conversion/metadata via pdf-lib/virus-scan/`/uploads` gateway), Pricing (pure paise calculator + admin rules), Order (strict state machine + health-gate-before-payment + operator scoping), Payment (demo simulator behind provider-agnostic interface), Pin (argon2id, 6h TTL, 3 attempts, one-time), Notification.
- **Real print dispatch**: `MachineQueueService` upgraded from stub to a DB-backed FIFO queue with atomic claim/lock + retry + dead-letter; new `/machine/pin/redeem` + `/machine/job/report` endpoints.
- **Agent print pipeline**: `PrinterPort.print()` on all three adapters + a `PrintRunner` (download presigned → checksum → silent print → delete temp); `tickQueue` runs accept→print→report.
- Customer pages (upload → options → demo pay → orders + live PIN countdown), admin pages (orders/revenue/active PINs/pricing), web-machine PIN keypad.
- 265 tests total (224 API + 33 agent + 8 types); pure logic (pricing, state machine, PIN policy, page-range, simulator, metadata) exhaustively covered.

> **Demo payment only** in Sprint 4 — all payment code is provider-agnostic, so Sprint 5 binds Razorpay with zero business-logic change.

### Sprint 3 delivered
- 7 new machine tables (heartbeat history, health snapshot, logs, config, capabilities, printer, network) + `MachineRuntimeState` runtime enum (lifecycle `MachineStatus` untouched).
- Machine module: repository + registration, heartbeat-ingest, health-gate (READY/WARNING/BLOCKED), queue infrastructure, logs, config, printer, and admin-management services + Socket.IO gateway.
- Machine APIs (heartbeat/status/jobs/accept/reject/log/config/logout) + admin APIs (register/list/detail/logs/suspend/reactivate/restart) with RBAC.
- **Windows Machine Agent** (`apps/machine-agent`): Electron tray daemon, hexagonal printer port with Windows + CUPS(Pi) + simulator adapters, system metrics, JWT login/refresh, 30s heartbeat, queue polling, buffered log upload, auto-reconnect. Headless systemd entry proves Pi parity.
- Cache-aside layer (Redis or in-memory fallback) for the health hot path.
- Admin dashboard machine pages (fleet list, detail, register-with-one-time-secret).
- 107 tests added (84 API + 23 agent); machine business-logic services 98–100% covered.

> Explicitly **not** in Sprint 3 (Sprint 4): printing, files, R2, payments, PIN. The queue/job contracts are stubbed so Sprint 4 drops in the pipeline without protocol changes.

---

## 12. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [Database](database-design.md) · [API](api-specification.md) · [Machine Protocol](machine-protocol.md) · [Deployment](deployment.md) · [UI](ui-design.md)
