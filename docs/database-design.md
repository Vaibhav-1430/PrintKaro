# Print Karo — Database Design

**Document owner:** Database Architect
**Status:** v1.0 · 2026-06-30
**Covers deliverables:** 6 Database Design · 7 ER Diagram · 8 Complete Prisma Schema
**Engine:** PostgreSQL 16 (Neon) · **ORM:** Prisma

---

## 1. Design Principles

1. **Money and jobs are sacred** → strong constraints, foreign keys, and a single source of truth. No "eventually correct" money.
2. **Append-only where truth matters** → `PaymentLedger` and `AuditLog` are never updated or deleted; corrections are new rows.
3. **The DB does not store files** → only file *metadata* and the R2 object key. Bytes live in R2, deleted after print.
4. **PINs are hashed at rest** → the raw PIN is never persisted in PG; only an Argon2id hash + the live copy in Redis (TTL).
5. **State machines are encoded as enums** with status-transition guards in the service layer + partial unique indexes to enforce invariants.
6. **Every privileged action is auditable** → `AuditLog` references actor, resource, before/after.
7. **Designed to partition** → `PrintJob`, `Payment`, `PaymentLedger`, `AuditLog`, `Heartbeat`/`HealthSnapshot` history carry `createdAt` for range partitioning at scale.
8. **UUID/CUID primary keys** → globally unique, safe to expose, merge-friendly for future multi-region.

---

## 2. Entity Overview

| Entity | Purpose | Lifecycle owner |
|--------|---------|-----------------|
| `User` | Customers and staff (role-scoped) | auth/users |
| `Account` / `Session` / `Verification` | Better Auth tables | auth |
| `Machine` | A physical printing unit | machines |
| `MachineConfig` | Pricing/capability/threshold config per machine | machines/pricing |
| `MachineSecret` | Per-machine device credential (rotating) | machines |
| `HealthSnapshot` | Latest known health (also cached in Redis) | health |
| `HeartbeatLog` | Time-series heartbeats (partitioned, short retention) | health |
| `FileObject` | Metadata for an uploaded/rendered document in R2 | files |
| `PrintJob` | The unit of work: one document → one machine | jobs |
| `Order` | Commercial intent: job + price + health binding | orders |
| `Payment` | A Razorpay transaction tied to an order | payments |
| `Refund` | A refund against a payment | payments |
| `PaymentLedger` | Append-only money movements (double-entry-ish) | payments |
| `Pin` | One-time collection code (hash only) | pins |
| `MachineCommand` | Outbound command to an agent + its ack | commands |
| `SupportTicket` | Operator/customer issues | admin |
| `AuditLog` | Append-only privileged-action record | audit |
| `Notification` | Outbound message log (email/SMS/push) | notifications |
| `Campus` / `Operator` | Grouping + franchise ownership | machines |

---

## 3. ER Diagram

```
                        ┌──────────────┐
                        │    Campus    │
                        └──────┬───────┘
                               │ 1..*
          ┌────────────┐   ┌───▼────────┐   ┌──────────────┐
          │  Operator  │1 *│  Machine   │1 1│ MachineConfig│
          └─────┬──────┘   └───┬───┬────┘   └──────────────┘
                │              │   │ 1 1
                │              │   └────────┐
                │           1 *│            ▼
                │     ┌────────▼──────┐  ┌──────────────┐
                │     │ HealthSnapshot│  │ MachineSecret│
                │     └───────────────┘  └──────────────┘
                │              │ 1 *
                │     ┌────────▼──────┐
                │     │  HeartbeatLog │  (time-series, partitioned)
                │     └───────────────┘
                │
   ┌────────┐   │           ┌────────────┐        ┌──────────────┐
   │  User  │1 *│           │MachineCommand│◀──1 *─│   Machine    │
   └───┬────┘   │           └────────────┘        └──────┬───────┘
       │ 1 *    │                                        │ 1 *
       │        │                                        │
       ▼        │                                        ▼
   ┌────────┐   │   ┌──────────┐   1 1   ┌────────┐  1 * ┌────────────┐
   │FileObje│1 1│   │  Order   │◀────────│PrintJob│─────▶│ (Machine)  │
   │  ct    │◀──────│          │   1 1   │        │      └────────────┘
   └────────┘   │   └────┬─────┘         └───┬────┘
                │        │ 1 1               │ 1 1
                │        ▼                   ▼
                │   ┌──────────┐        ┌────────┐
                │   │ Payment  │1 *     │  Pin   │ (hash only)
                │   └────┬─────┘        └────────┘
                │        │ 1 *
                │        ▼
                │   ┌──────────┐     ┌────────────────┐
                │   │  Refund  │     │ PaymentLedger  │ (append-only)
                │   └──────────┘     └────────────────┘
                │
                ▼
          ┌──────────┐   ┌────────────┐   ┌──────────────┐
          │ AuditLog │   │SupportTicket│  │ Notification │
          └──────────┘   └────────────┘   └──────────────┘

Cardinality key:  User 1—* Order ;  Order 1—1 PrintJob ;  PrintJob 1—1 FileObject ;
Order 1—* Payment ;  Payment 1—* Refund ;  PrintJob 1—1 Pin ;  Machine 1—* PrintJob.
```

---

## 4. Key Relationships & Invariants (enforced in DB)

| Invariant | DB enforcement |
|-----------|----------------|
| One active PIN per job | Partial unique index: `UNIQUE (printJobId) WHERE status = 'ACTIVE'` |
| One non-terminal job per file | Partial unique index on `fileObjectId WHERE status NOT IN terminal` |
| Order ↔ Payment integrity | FK + `Payment.amount` checked vs `Order.amount` in service before insert |
| Ledger append-only | No UPDATE/DELETE grants; trigger blocks mutation |
| Machine owns its jobs | FK `PrintJob.machineId`; queries scoped by guard |
| Idempotent orders | `UNIQUE (idempotencyKey)` on Order/Payment |
| Health freshness | `HealthSnapshot.capturedAt`; gate logic compares to `now()` |

---

## 5. Indexing Strategy

| Table | Indexes |
|-------|---------|
| `User` | `UNIQUE(email)`, `INDEX(role)` |
| `Machine` | `UNIQUE(code)`, `INDEX(campusId)`, `INDEX(status)`, geo `INDEX(latitude, longitude)` |
| `HealthSnapshot` | `UNIQUE(machineId)` (one current row), `INDEX(isAvailable)` |
| `HeartbeatLog` | `INDEX(machineId, createdAt)` — partitioned by month |
| `PrintJob` | `INDEX(machineId, status)`, `INDEX(userId, createdAt)`, `INDEX(status)`, partition by `createdAt` |
| `Order` | `UNIQUE(idempotencyKey)`, `INDEX(userId, createdAt)`, `INDEX(status)` |
| `Payment` | `UNIQUE(razorpayOrderId)`, `UNIQUE(razorpayPaymentId)`, `INDEX(orderId)`, partition by `createdAt` |
| `Pin` | `UNIQUE(printJobId) WHERE status='ACTIVE'`, `INDEX(expiresAt)` |
| `PaymentLedger` | `INDEX(paymentId)`, `INDEX(type, createdAt)`, partition by `createdAt` |
| `AuditLog` | `INDEX(actorId, createdAt)`, `INDEX(resourceType, resourceId)`, partition by `createdAt` |
| `MachineCommand` | `INDEX(machineId, status)`, `INDEX(createdAt)` |

---

## 6. Complete Prisma Schema

> This is the canonical `apps/api/prisma/schema.prisma`. Better Auth tables (`Account`, `Session`, `Verification`) follow its adapter conventions.

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DATABASE_URL_UNPOOLED") // migrations bypass the pooler
  extensions = [pgcrypto, postgis(map: "postgis")] // postgis optional for geo
}

// ────────────────────────────── ENUMS ──────────────────────────────

enum Role {
  CUSTOMER
  OPERATOR
  SUPPORT
  FLEET_ADMIN
  FINANCE
  SUPER_ADMIN
}

enum MachineStatus {
  PROVISIONING
  ONLINE
  OFFLINE
  MAINTENANCE
  DECOMMISSIONED
}

enum PrinterStatus {
  READY
  BUSY
  PAPER_OUT
  TONER_LOW
  JAMMED
  ERROR
  DISCONNECTED
}

enum FileStatus {
  UPLOADING
  UPLOADED
  RENDERING
  READY        // print-ready PDF available
  FAILED
  DELETED      // purged from R2
}

enum JobStatus {
  CREATED          // file ready, order not yet paid
  AWAITING_PAYMENT
  PAID             // money captured, queued for machine
  DISPATCHED       // command sent to machine over MQTT
  DOWNLOADING      // machine pulling file
  PRINTING
  COMPLETED        // printed + file deleted + pin burned
  FAILED           // print failed → triggers refund
  CANCELLED
  EXPIRED          // pin/job timed out before collection
  REFUNDED
}

enum OrderStatus {
  CREATED
  AWAITING_PAYMENT
  PAID
  FAILED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  CREATED
  AUTHORIZED
  CAPTURED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
}

enum RefundStatus {
  INITIATED
  PROCESSED
  FAILED
}

enum LedgerType {
  CHARGE          // money in (customer paid)
  REFUND          // money out (refund to customer)
  PLATFORM_FEE
  OPERATOR_PAYOUT
  ADJUSTMENT
}

enum PinStatus {
  ACTIVE
  USED
  EXPIRED
  REVOKED
}

enum CommandType {
  PRINT
  CANCEL_JOB
  REBOOT
  ENTER_MAINTENANCE
  EXIT_MAINTENANCE
  UPDATE_CONFIG
  SELF_UPDATE
  CLEAR_QUEUE
  TEST_PAGE
}

enum CommandStatus {
  PENDING
  SENT
  ACKED
  COMPLETED
  FAILED
  EXPIRED
}

enum ColorMode {
  BW
  COLOR
}

enum NotificationChannel {
  EMAIL
  SMS
  PUSH
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

// ───────────────────────── AUTH (Better Auth) ─────────────────────────

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  phone         String?  @unique
  emailVerified Boolean  @default(false)
  image         String?
  role          Role     @default(CUSTOMER)
  isActive      Boolean  @default(true)

  // staff/operator scoping
  operatorId    String?
  operator      Operator? @relation(fields: [operatorId], references: [id])

  accounts      Account[]
  sessions      Session[]
  orders        Order[]
  printJobs     PrintJob[]
  files         FileObject[]
  tickets       SupportTicket[]
  auditLogs     AuditLog[]      @relation("ActorAudit")
  notifications Notification[]

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([role])
  @@map("users")
}

model Account {
  id                    String    @id @default(cuid())
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accountId             String
  providerId            String
  accessToken           String?
  refreshToken          String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  idToken               String?
  password              String?   // hashed by Better Auth
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@unique([providerId, accountId])
  @@map("accounts")
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  ipAddress String?
  userAgent String?
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@map("sessions")
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
  @@map("verifications")
}

// ───────────────────────── FLEET / MACHINES ─────────────────────────

model Campus {
  id        String    @id @default(cuid())
  name      String
  city      String
  state     String
  address   String?
  machines  Machine[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("campuses")
}

model Operator {
  id           String    @id @default(cuid())
  name         String
  contactEmail String
  contactPhone String?
  payoutVpa    String?   // UPI for settlements
  isActive     Boolean   @default(true)
  users        User[]
  machines     Machine[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@map("operators")
}

model Machine {
  id             String         @id @default(cuid())
  code           String         @unique          // human label e.g. PK-DEL-001
  name           String
  status         MachineStatus  @default(PROVISIONING)
  maintenanceMode Boolean       @default(false)

  campusId       String?
  campus         Campus?        @relation(fields: [campusId], references: [id])
  operatorId     String?
  operator       Operator?      @relation(fields: [operatorId], references: [id])

  // location
  latitude       Float?
  longitude      Float?
  locationLabel  String?

  // hardware portability metadata (no behavioral coupling)
  platform       String?        // "windows" | "linux-arm" | "industrial"
  agentVersion   String?
  printerModel   String?

  config         MachineConfig?
  secret         MachineSecret?
  health         HealthSnapshot?
  heartbeats     HeartbeatLog[]
  printJobs      PrintJob[]
  commands       MachineCommand[]

  lastSeenAt     DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([campusId])
  @@index([operatorId])
  @@index([status])
  @@index([latitude, longitude])
  @@map("machines")
}

model MachineConfig {
  id              String   @id @default(cuid())
  machineId       String   @unique
  machine         Machine  @relation(fields: [machineId], references: [id], onDelete: Cascade)

  // pricing (in paise to avoid float money)
  pricePerPageBw   Int     @default(200)   // ₹2.00
  pricePerPageColor Int    @default(1000)  // ₹10.00
  duplexDiscountBps Int    @default(0)     // basis points
  platformFee      Int     @default(0)

  // capabilities
  supportsColor    Boolean @default(false)
  supportsDuplex   Boolean @default(true)
  supportedSizes   String[] @default(["A4"])

  // health thresholds
  maxQueueLength   Int     @default(10)
  lowTonerPct      Int     @default(10)
  lowPaperSheets   Int     @default(20)
  heartbeatTtlSec  Int     @default(30)
  avgSecondsPerPage Int    @default(6)     // for ETA

  updatedAt        DateTime @updatedAt
  createdAt        DateTime @default(now())

  @@map("machine_configs")
}

model MachineSecret {
  id            String   @id @default(cuid())
  machineId     String   @unique
  machine       Machine  @relation(fields: [machineId], references: [id], onDelete: Cascade)
  secretHash    String   // hash of device secret (Argon2id)
  mqttUsername  String   @unique
  rotatedAt     DateTime @default(now())
  expiresAt     DateTime?
  createdAt     DateTime @default(now())

  @@map("machine_secrets")
}

// ───────────────────────── HEALTH ─────────────────────────

model HealthSnapshot {
  id             String        @id @default(cuid())
  machineId      String        @unique
  machine        Machine       @relation(fields: [machineId], references: [id], onDelete: Cascade)

  isOnline       Boolean       @default(false)
  printerStatus  PrinterStatus @default(DISCONNECTED)
  printerConnected Boolean     @default(false)
  paperSheets    Int?          // estimated sheets remaining
  tonerPct       Int?          // estimated %
  queueLength    Int           @default(0)
  isAvailable    Boolean       @default(false) // computed: passes the gate
  estimatedWaitSec Int         @default(0)

  capturedAt     DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  @@index([isAvailable])
  @@map("health_snapshots")
}

model HeartbeatLog {
  id             String   @id @default(cuid())
  machineId      String
  machine        Machine  @relation(fields: [machineId], references: [id], onDelete: Cascade)
  payload        Json     // raw health blob for forensics
  createdAt      DateTime @default(now())

  @@index([machineId, createdAt])
  @@map("heartbeat_logs") // PARTITION BY RANGE (createdAt) — see §7
}

// ───────────────────────── FILES ─────────────────────────

model FileObject {
  id            String     @id @default(cuid())
  userId        String
  user          User       @relation(fields: [userId], references: [id])

  originalName  String
  mimeType      String
  sizeBytes     Int
  r2KeyOriginal String     // uploaded source object key
  r2KeyPrintPdf String?    // rendered print-ready PDF key
  pageCount     Int?
  colorMode     ColorMode  @default(BW)
  checksum      String?    // sha256 of source

  status        FileStatus @default(UPLOADING)
  deletedAt     DateTime?  // when purged from R2

  printJob      PrintJob?

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@index([userId, createdAt])
  @@index([status])
  @@map("file_objects")
}

// ───────────────────────── JOBS / ORDERS ─────────────────────────

model PrintJob {
  id            String     @id @default(cuid())
  userId        String
  user          User       @relation(fields: [userId], references: [id])
  machineId     String
  machine       Machine    @relation(fields: [machineId], references: [id])
  fileObjectId  String     @unique
  fileObject    FileObject @relation(fields: [fileObjectId], references: [id])

  status        JobStatus  @default(CREATED)
  pages         Int
  copies        Int        @default(1)
  colorMode     ColorMode  @default(BW)
  duplex        Boolean    @default(false)

  order         Order?
  pin           Pin?

  queuePosition Int?
  dispatchedAt  DateTime?
  printedAt     DateTime?
  failureReason String?

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@index([machineId, status])
  @@index([userId, createdAt])
  @@index([status])
  @@map("print_jobs") // PARTITION BY RANGE (createdAt) at scale
}

model Order {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id])
  printJobId      String      @unique
  printJob        PrintJob    @relation(fields: [printJobId], references: [id])

  amount          Int         // paise
  currency        String      @default("INR")
  status          OrderStatus @default(CREATED)

  // the health gate binding (invariant: no pay on stale health)
  healthSnapshot  Json        // frozen copy of HealthSnapshot at order time
  healthCapturedAt DateTime
  healthTtlSec    Int         @default(90)

  idempotencyKey  String      @unique
  razorpayOrderId String?     @unique

  payments        Payment[]

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([userId, createdAt])
  @@index([status])
  @@map("orders")
}

// ───────────────────────── PAYMENTS ─────────────────────────

model Payment {
  id                String        @id @default(cuid())
  orderId           String
  order             Order         @relation(fields: [orderId], references: [id])

  amount            Int           // paise captured
  currency          String        @default("INR")
  status            PaymentStatus @default(CREATED)

  razorpayOrderId   String        @unique
  razorpayPaymentId String?       @unique
  razorpaySignature String?
  method            String?       // upi/card/netbanking
  idempotencyKey    String?       @unique

  refunds           Refund[]
  ledgerEntries     PaymentLedger[]

  capturedAt        DateTime?
  failureReason     String?

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([orderId])
  @@map("payments") // PARTITION BY RANGE (createdAt) at scale
}

model Refund {
  id               String       @id @default(cuid())
  paymentId        String
  payment          Payment      @relation(fields: [paymentId], references: [id])

  amount           Int          // paise
  reason           String
  status           RefundStatus @default(INITIATED)
  razorpayRefundId String?      @unique
  initiatedBy      String?      // userId of staff, null if automatic

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  @@index([paymentId])
  @@map("refunds")
}

// Append-only money ledger. No UPDATE/DELETE (enforced by trigger + grants).
model PaymentLedger {
  id          String     @id @default(cuid())
  paymentId   String?
  payment     Payment?   @relation(fields: [paymentId], references: [id])

  type        LedgerType
  amount      Int        // signed paise (+in / -out)
  currency    String     @default("INR")
  description String?
  operatorId  String?    // for payout attribution
  metadata    Json?

  createdAt   DateTime   @default(now())

  @@index([paymentId])
  @@index([type, createdAt])
  @@map("payment_ledger") // PARTITION BY RANGE (createdAt)
}

// ───────────────────────── PIN ─────────────────────────

model Pin {
  id           String    @id @default(cuid())
  printJobId   String    @unique
  printJob     PrintJob  @relation(fields: [printJobId], references: [id])
  machineId    String                            // PIN is machine-bound

  codeHash     String    // Argon2id hash; raw PIN only lives in Redis with TTL
  status       PinStatus @default(ACTIVE)
  attempts     Int       @default(0)
  maxAttempts  Int       @default(5)

  expiresAt    DateTime
  usedAt       DateTime?

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  // INVARIANT: one ACTIVE pin per job → partial unique index (raw SQL migration)
  @@index([expiresAt])
  @@map("pins")
}

// ───────────────────────── COMMANDS ─────────────────────────

model MachineCommand {
  id          String        @id @default(cuid())
  machineId   String
  machine     Machine       @relation(fields: [machineId], references: [id], onDelete: Cascade)

  type        CommandType
  payload     Json?
  status      CommandStatus @default(PENDING)
  issuedBy    String?       // userId (null if system)
  ackedAt     DateTime?
  completedAt DateTime?
  result      Json?
  expiresAt   DateTime?

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([machineId, status])
  @@index([createdAt])
  @@map("machine_commands")
}

// ───────────────────────── SUPPORT / AUDIT / NOTIF ─────────────────────────

model SupportTicket {
  id          String       @id @default(cuid())
  userId      String?
  user        User?        @relation(fields: [userId], references: [id])
  machineId   String?
  subject     String
  description String
  status      TicketStatus @default(OPEN)
  assignedTo  String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([status])
  @@map("support_tickets")
}

// Append-only. Every privileged action.
model AuditLog {
  id           String   @id @default(cuid())
  actorId      String?
  actor        User?    @relation("ActorAudit", fields: [actorId], references: [id])
  actorType    String   @default("USER") // USER | MACHINE | SYSTEM
  action       String   // e.g. "payment.refund", "machine.reboot"
  resourceType String
  resourceId   String?
  before       Json?
  after        Json?
  ip           String?
  correlationId String?
  createdAt    DateTime @default(now())

  @@index([actorId, createdAt])
  @@index([resourceType, resourceId])
  @@map("audit_logs") // PARTITION BY RANGE (createdAt)
}

model Notification {
  id        String              @id @default(cuid())
  userId    String?
  user      User?               @relation(fields: [userId], references: [id])
  channel   NotificationChannel
  template  String
  payload   Json
  sentAt    DateTime?
  status    String              @default("PENDING") // PENDING|SENT|FAILED
  createdAt DateTime            @default(now())

  @@index([userId, createdAt])
  @@map("notifications")
}
```

---

## 7. Raw-SQL Migrations (constraints Prisma can't express)

Applied as `prisma migrate` custom SQL:

```sql
-- One ACTIVE pin per print job
CREATE UNIQUE INDEX uniq_active_pin_per_job
  ON pins (print_job_id) WHERE status = 'ACTIVE';

-- One non-terminal job per file object
CREATE UNIQUE INDEX uniq_open_job_per_file
  ON print_jobs (file_object_id)
  WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED','EXPIRED','REFUNDED');

-- Ledger is append-only
CREATE OR REPLACE FUNCTION block_ledger_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'payment_ledger is append-only'; END;$$ LANGUAGE plpgsql;
CREATE TRIGGER no_update_ledger BEFORE UPDATE OR DELETE ON payment_ledger
  FOR EACH ROW EXECUTE FUNCTION block_ledger_mutation();

-- Money must be non-negative where it should be
ALTER TABLE orders   ADD CONSTRAINT chk_order_amount   CHECK (amount >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_payment_amount CHECK (amount >= 0);

-- Range partitioning (example for print_jobs)
-- Convert to partitioned table during a maintenance window once volume warrants it.
```

---

## 8. Money Representation

All monetary values are **integer paise** (₹1 = 100 paise). No floats for money, ever — avoids rounding drift across pricing, payments, refunds, and the ledger. Display formatting happens only in the UI layer.

---

## 9. Data Retention

| Data | Retention | Reason |
|------|-----------|--------|
| File bytes (R2) | Deleted on print-success or PIN-expiry (minutes) | Privacy invariant |
| `FileObject` metadata | 90 days then archive | Support/dispute window |
| `HeartbeatLog` | 7–30 days (partition drop) | Telemetry, not truth |
| `HealthSnapshot` | Current only (1 row/machine) | Live state |
| `PrintJob` | 13 months hot, then archive | Reporting, tax year |
| `Payment` / `PaymentLedger` | 7+ years | Legal/financial compliance |
| `AuditLog` | 2+ years | Security/forensics |

---

## 10. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [API](api-specification.md) · [Machine Protocol](machine-protocol.md) · [Deployment](deployment.md)

---

## 11. Sprint 3 — Machine Infrastructure Tables (implemented)

Added to `packages/database/prisma/schema.prisma`. All follow the house rules:
UUID PKs, `createdAt`/`updatedAt`, soft-delete where it's an entity, explicit
indexes + FKs (cascade on the owning `Machine`).

| Table | Cardinality | Purpose |
|-------|-------------|---------|
| `machine_capabilities` | Machine 1—1 | color/duplex/paperSizes/maxCopies (registration) |
| `machine_printers` | Machine 1—1 | latest printer snapshot (upserted by heartbeats) |
| `machine_networks` | Machine 1—1 | latest network/internet snapshot |
| `machine_configurations` | Machine 1—1 | server-owned cadences + maintenance + settings JSON |
| `machine_health` | Machine 1—1 | current health snapshot: score, gate result, checks |
| `machine_heartbeats` | Machine 1—* | **append-only** heartbeat history (time-series) |
| `machine_logs` | Machine 1—* | **append-only** event log (agent upload + server events) |

**Machine extensions:** `type` (`MachineType`), location (`college/building/floor/room/latitude/longitude`), `lastHeartbeatAt`, and relations to the seven tables.

**New enums:** `MachineRuntimeState` (ONLINE…MAINTENANCE — runtime, distinct from the lifecycle `MachineStatus`), `MachineType`, `PrinterState`, `HealthGateResult`, `MachineLogLevel`, `MachineLogEvent`. **AuditAction** gained `MACHINE_REGISTERED/SUSPENDED/REACTIVATED/RESTART_REQUESTED/LOGOUT/SECRET_ROTATED/HEARTBEAT_STALE`.

**Indexes of note:** `machine_heartbeats(machineId, createdAt)` + `(createdAt)` for time-series + retention; `machine_health(gateResult)` + `(runtimeState)` for dashboard filtering; `machines(college)`, `(lastHeartbeatAt)`, `(type)` for fleet queries.

**Migration:** additive only — no existing column changed. Run `pnpm db:migrate` (or `db:push`) against Neon; existing Sprint 1/2 data is unaffected.

**Retention (future):** `machine_heartbeats` and `machine_logs` are partition/drop candidates (range on `createdAt`) once volume warrants — the indexes are already shaped for it.

## 12. Sprint 4 — Print Pipeline Tables (implemented)

Additive only — no existing column/table was altered or dropped. New relation
back-references were added to existing models (`User.orders/notifications`,
`CustomerProfile.uploads/orders`, `Machine.orders/printJobs/pins/pricingRules`).
All money is integer **paise**; UUID PKs, `createdAt`/`updatedAt`, soft-delete on
owned records, explicit `@@index` — matching Sprint 1–3 conventions.

### 12.1 New models

| Table | Purpose | Key fields / indexes |
|-------|---------|----------------------|
| `uploads` | source document (bytes in R2; metadata only here) | `storageKey @unique`, `sha256` (dedupe), `status`, FK→`customer_profiles` |
| `file_metadata` | extracted print metadata (1:1) | `pageCount`, `isColor`, `orientation`, `paperSize`, `estimatedPrintSeconds`, `encrypted` |
| `orders` | print order spine | `orderNumber @unique`, `status`, `amountPaise`, FK→upload/machine/user; `@@index([machineId,status])`, `([status,createdAt])` |
| `print_options` | chosen options (1:1) | `copies`, `colorMode`, `duplex`, `paperSize`, `pageRange`, `pagesToPrint` |
| `payments` | provider-agnostic payment (1:1) | `provider`, `status`, `amountPaise`, `providerOrderId/PaymentId` |
| `transactions` | charge/refund attempts (append-only) | `type`, `result`, `providerRef`, `rawResponse` |
| `pins` | one-time PIN (hash only) | `codeHash` (argon2id), `status`, `attempts/maxAttempts`, `expiresAt`; `@@index([machineId,status])` |
| `receipts` | issued receipt (1:1) | `receiptNumber @unique`, `amountPaise`, optional R2 `storageKey` |
| `notifications` | in-app/email/sms records | `type`, `channel`, `read`; `@@index([userId,read])` |
| `print_jobs` | DB-backed queue (1:1 order) | `status`, `attempts`, `lockToken`, `lockedUntil` (atomic claim); `@@index([status,lockedUntil])` |
| `pricing_rules` | admin-configurable pricing | `(machineId,paperSize)`, `bw/colorPerPagePaise`, `duplexDiscountPct`, `active` |

### 12.2 New enums

`UploadStatus`, `OrderStatus` (DRAFT…COMPLETED/FAILED/EXPIRED/REFUNDED/CANCELLED),
`PaymentStatus`, `PaymentResult`, `PinStatus`, `PrintJobStatus`,
`NotificationType`, `NotificationChannel`; plus 22 new `AuditAction` values
(ORDER_*, PIN_*, PRINT_*, REFUND_ISSUED, FILE_*).

### 12.3 Queue design (no external infra)

`print_jobs` is a DB-backed FIFO queue. Dequeue is an atomic conditional
`updateMany` (status + visibility-timeout guard) that sets `CLAIMED` + a
`lockToken`, so concurrent pollers and machine restarts are safe without Redis.
Retry increments `attempts`; exhaustion → `DEAD_LETTER` + order `FAILED`. The
service boundary (`MachineQueueService`) lets BullMQ replace the storage later.

### 12.4 Migration

Additive — run `pnpm db:migrate` (authoring SQL) then `prisma migrate deploy` in
CI/prod. New permissions/role-permissions are seeded automatically by the existing
data-driven `prisma db seed` (it iterates `ALL_PERMISSIONS`/`DEFAULT_ROLE_PERMISSIONS`).
