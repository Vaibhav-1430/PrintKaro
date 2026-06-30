# Print Karo — Product Requirements Document (PRD)

> **Upload. Pay. Print Anywhere.**
> India's largest automated cloud-printing network.

**Document owner:** CTO / Product
**Status:** Living document — v1.0
**Last reviewed:** 2026-06-30

---

## 1. Executive Summary

Print Karo is a **Smart Cloud Printing Network**. A user uploads a document from a phone or laptop, picks a nearby Print Karo vending machine, pays online, and receives a **secure one-time PIN**. At the machine the user enters the PIN; the machine downloads **only that user's file**, prints it, deletes the file locally, and the PIN expires.

The product is not a single printer hooked to a website. It is a **distributed fleet operating system** that must remain correct and safe when:

- The network is unreliable (college Wi-Fi, hostel power cuts).
- The machine is offline at the exact moment a user wants to pay.
- Money has changed hands but the print physically failed (paper jam, toner out).
- A malicious user tries to retrieve someone else's document.

Every requirement below is written with those four realities as the design pressure.

---

## 2. Problem Statement

Students and campus users today face:

| Pain | Consequence |
|------|-------------|
| Long queues at the shop | 15–40 min wasted before an exam/submission |
| Shops closed evenings/nights | No printing when assignments are actually due |
| Must carry a pen drive | Data loss, malware transfer, forgotten drives |
| Manual operator handling | Operator sees private documents (ID proofs, medical, legal) |
| No 24×7 access | Hard dependency on human availability |
| Cash-only | No record, disputes, no refunds |

**Core insight:** the bottleneck is not printing — it is the **human operator and fixed shop hours**. Print Karo removes the human from the loop while preserving privacy and payment integrity.

---

## 3. Solution Overview

```
 ┌──────────┐   upload    ┌──────────────┐  health gate  ┌──────────────┐
 │  User    │ ──────────▶ │  Cloud (API) │ ◀───────────▶ │  Machine N   │
 │ phone/PC │             │              │   heartbeat   │ (laptop/Pi)  │
 └────┬─────┘             └──────┬───────┘               └──────┬───────┘
      │   pay (Razorpay)         │                              │
      │ ◀────────── PIN ─────────┘                              │
      │                                                         │
      │   walk to machine, enter PIN                            │
      └────────────────────────────────────────────────────────▶ print → delete → PIN expires
```

The platform is composed of **five products** sharing one backend:

1. **Customer Portal** (Next.js) — upload, select machine, pay, get PIN, track jobs.
2. **Admin Dashboard** (Next.js) — fleet ops, machines, revenue, refunds, users, alerts.
3. **Machine Portal** (Next.js, runs on the machine's screen) — the PIN-entry kiosk UI.
4. **Machine Agent** (Node/TypeScript daemon on the machine) — talks to the printer, executes jobs, reports health.
5. **Backend API** (NestJS) — the system of record, orchestrator, and security boundary.

---

## 4. Goals & Non-Goals

### 4.1 Goals (v1)
- 24×7 unattended printing at a single-college pilot, then multi-campus.
- **Money is never taken if the print cannot succeed.** (Health gate before payment.)
- **A document is only ever readable by its owner**, on exactly one machine, once.
- Zero-touch fleet: a machine that goes offline self-heals and rejoins.
- Hardware-agnostic: replacing a Windows laptop with a Raspberry Pi requires **no backend or protocol change**.

### 4.2 Non-Goals (v1)
- We do **not** build our own payment rails (Razorpay only).
- We do **not** support arbitrary file types in v1 (PDF, DOCX, images, PPTX → normalized to PDF).
- We do **not** do binding, lamination, or color-calibration certification in v1.
- We do **not** ship a native mobile app in v1 (responsive PWA instead).

---

## 5. Personas

| Persona | Needs | Key constraint |
|---------|-------|----------------|
| **Student (primary)** | Fast, cheap, private, works at 2 AM before a deadline | Low trust, price-sensitive, mobile-first, flaky network |
| **Campus Admin / Franchise Operator** | Refill paper/toner, see earnings, raise tickets | Non-technical, wants a simple panel + alerts |
| **Print Karo Ops (internal)** | Monitor 1,000+ machines, resolve disputes, refund | Needs fleet-wide observability, RBAC, audit trail |
| **Finance (internal)** | Reconcile Razorpay vs. print success, payouts | Needs immutable ledger, settlement reports |
| **Field Technician** | Diagnose a dead machine remotely before driving out | Needs machine telemetry + remote commands |

---

## 6. Core Functional Requirements

### 6.1 The Pre-Payment Health Gate (the heart of the product)

**Payment must be blocked unless the chosen machine passes ALL checks.** This is the single most important business rule — it is what makes the product trustworthy.

| Check | Source | Block payment if |
|-------|--------|------------------|
| Machine Online | Heartbeat age < threshold | Last heartbeat > 30s old |
| Printer Connected | Agent → OS print subsystem | Printer not enumerated |
| Paper Remaining | Agent estimate / sensor | Below pages required for this job |
| Queue | Backend job count for machine | Queue length > configured max |
| Printer Ready | Agent printer status | Status ≠ `READY` (jam, error, offline) |
| Not Under Maintenance | Admin flag | `maintenanceMode = true` |
| Toner / Ink Level | Agent estimate | Below threshold for job page count |
| Estimated Wait Time | Queue × avg job time | Shown to user; soft signal, not a hard block |

**Rule:** the health snapshot used to authorize payment is **bound to the order** with a short TTL (e.g., 90s). If the user takes too long, the gate is re-evaluated. We never charge against a stale "healthy" reading.

> **Why:** A user who pays and then can't print is a refund, a support ticket, and a lost customer. Refunds also cost us Razorpay fees both ways. Blocking *before* money moves is cheaper and builds trust.

### 6.2 Upload
- Accepted: PDF, DOCX, DOC, PPTX, PPT, JPG, PNG, TXT (configurable).
- Max size: configurable (default 50 MB), max pages capped (default 200).
- Server-side: virus/type validation, render to a canonical **print-ready PDF**, count pages, detect color vs B/W.
- File stored **encrypted at rest** in Cloudflare R2 under a per-job key path; never public.

### 6.3 Machine Selection
- User sees machines by distance/campus with a **live health badge** (Available / Busy / Offline / Maintenance) and **ETA**.
- Only `Available` machines are selectable for payment.

### 6.4 Payment
- Razorpay order created **only after** the health gate passes.
- Pricing engine: pages × per-page rate × (color multiplier) × (duplex discount) + platform fee. All configurable per machine/campus.
- On payment success → **PIN issued**. On failure → no PIN, file retained briefly then GC'd.

### 6.5 PIN & Collection
- PIN: short, human-enterable (e.g., 6 digits), **single-use**, **time-boxed** (default 30 min), bound to one machine and one job.
- At machine: user enters PIN → agent pulls file via **presigned, expiring R2 URL** → prints → confirms → file deleted locally → job marked `COMPLETED` → PIN burned.

### 6.6 Failure & Refund
- If print fails after payment (jam, out of paper mid-job), system auto-creates a **refund** (full or pro-rated by pages printed) and notifies the user.
- All money events are written to an **immutable payment ledger**.

---

## 7. Non-Functional Requirements (NFRs)

| Category | Target |
|----------|--------|
| **Scale** | 10,000+ concurrent users, 1,000+ machines, millions of jobs |
| **Availability** | Cloud control plane 99.9%; individual machine outages are expected and isolated |
| **Latency** | Health snapshot read < 200 ms p95; PIN validation at machine < 1 s |
| **Heartbeat** | Every machine reports ≤ every 15 s; offline detection ≤ 30 s |
| **Durability** | No double-charge, no lost payment record, no orphaned paid-but-unprinted job |
| **Security** | Per-job file isolation, one-time PIN, encrypted at rest + in transit, full audit trail |
| **Privacy** | Files auto-deleted after print or expiry; no operator/admin can read user files |
| **Portability** | Same agent binary/protocol on Windows laptop and Raspberry Pi (ARM) |
| **Observability** | Every job traceable end-to-end by `correlationId`; fleet dashboards real-time |

---

## 8. Key Invariants (must always hold)

1. **No payment without a passing, fresh health snapshot bound to that order.**
2. **A file is downloadable exactly once, only by the owning machine, only via a short-lived presigned URL.**
3. **A PIN authorizes exactly one job on exactly one machine and self-destructs on use or expiry.**
4. **Every rupee in/out has a ledger row; the ledger is append-only.**
5. **A machine's reported health is never trusted past its TTL.**
6. **A document never persists after print-success or PIN-expiry.**

These invariants drive the database constraints, API contracts, and machine protocol in the other documents.

---

## 9. Success Metrics (North Star + guardrails)

- **North Star:** successful prints / week.
- Print success rate (paid → printed) ≥ 98%.
- Refund rate ≤ 2%; involuntary refunds (our fault) ≤ 0.5%.
- Machine uptime (per machine, monthly) ≥ 95%.
- Median time: upload → PIN ≤ 60 s; PIN → printed ≤ 2 min at the machine.
- Support tickets per 1,000 jobs ≤ 5.

---

## 10. Related Documents
- [System Architecture](system-architecture.md) — components, monorepo, security, scaling.
- [Database Design](database-design.md) — schema, ER, Prisma.
- [API Specification](api-specification.md) — REST contracts, auth, env vars, standards.
- [Machine Protocol](machine-protocol.md) — heartbeat, lifecycles, queue, file/payment.
- [Deployment](deployment.md) — infra, CI/CD, observability, DR.
- [UI Design](ui-design.md) — design system & screens.
- [Development Roadmap](development-roadmap.md) — phased plan.
