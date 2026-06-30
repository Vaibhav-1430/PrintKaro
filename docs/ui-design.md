# Print Karo — UI / UX Design System

**Document owner:** Senior Product Designer
**Status:** v1.0 · 2026-06-30
**Stack:** Next.js 15 · Tailwind CSS · shadcn/ui · Radix primitives
**Covers:** design system + screen specs for all 5 products.

---

## 1. Design Principles

1. **Trust before payment.** The health state must be obvious and honest. A green "Ready" badge is a promise; we only show it when the gate truly passes.
2. **Mobile-first.** Students are on phones, on flaky Wi-Fi, often in a hurry. Every customer flow works thumb-only.
3. **Fewest taps to a PIN.** Upload → pay → PIN in as few screens as possible.
4. **Kiosk simplicity.** The Machine Portal is operated by strangers under stress (exam in 10 min). Big targets, no jargon, one job per screen.
5. **Operational density (admin).** Ops staff need information density and fast actions, not whitespace.
6. **Accessible by default.** WCAG 2.1 AA: contrast, focus rings, keyboard nav, screen-reader labels, reduced-motion.

---

## 2. Design Tokens

```
Color (semantic, light/dark):
  brand        #2563EB (blue-600)      → primary actions, logo
  brand-fg     #FFFFFF
  success      #16A34A (green-600)     → "Ready / Available / Printed"
  warning      #D97706 (amber-600)     → "Low paper/toner / Busy"
  danger       #DC2626 (red-600)       → "Offline / Failed / Jam"
  neutral      slate scale 50–950      → surfaces, text
  muted-fg     slate-500

Typography:
  font-sans    Inter (next/font)
  display      32/40 semibold
  h1 24/32     h2 20/28     body 16/24     small 14/20     mono (PIN) 36 tabular

Spacing: 4-pt scale (4,8,12,16,24,32,48,64)
Radius:  sm 6 · md 10 · lg 16 · full (pills, PIN dots)
Shadow:  card sm · modal lg
Motion:  150–250ms ease-out; respect prefers-reduced-motion
Breakpoints: sm 640 · md 768 · lg 1024 · xl 1280
```

Shared in `packages/ui` as a Tailwind preset + CSS variables, consumed by all three web apps so brand stays consistent.

---

## 3. Shared Component Library (`packages/ui`)

Built on shadcn/ui: `Button`, `Input`, `Card`, `Dialog`, `Sheet`, `Badge`, `Toast`, `Table`, `Tabs`, `Tooltip`, `Skeleton`, `Stepper`, `Pagination`.

Print-Karo domain components:
| Component | Purpose |
|-----------|---------|
| `HealthBadge` | Available / Busy / Offline / Maintenance with color + icon + tooltip reason |
| `MachineCard` | Name, distance, health badge, ETA, "Select" |
| `UploadDropzone` | Drag/drop + file picker, progress, type/size validation |
| `PriceBreakdown` | Pages × rate, color, duplex, fee, total |
| `PinDisplay` | Big tabular PIN, copy, countdown to expiry |
| `PinPad` | Kiosk numeric keypad (Machine Portal) |
| `JobStatusTimeline` | Upload→Paid→Dispatched→Printing→Done stepper |
| `GateChecklist` | The 8 health checks as pass/fail rows |
| `StatTile` | Admin KPI tile |
| `FleetMap` | Admin machine map by status |

---

## 4. Product 1 — Customer Portal (mobile-first web/PWA)

### 4.1 Flow
```
Landing → (Login/Register) → Upload → Configure → Select Machine → Health Gate
       → Checkout (Razorpay) → PIN screen → Track Job → Done
```

### 4.2 Key screens

**Upload**
```
┌───────────────────────────┐
│  Print Karo        ☰      │
│                           │
│   ┌───────────────────┐   │
│   │   ⬆  Drop file or │   │
│   │     tap to upload │   │  PDF, DOCX, PPT, JPG…
│   └───────────────────┘   │
│   thesis.pdf  •  12 pages │  ← shown after render
│   ◉ B/W   ○ Color         │
│   Copies [ 1 ]  ☑ Duplex  │
│            [ Continue ]    │
└───────────────────────────┘
```

**Select Machine** (only `Available` are tappable)
```
┌───────────────────────────┐
│  Nearby machines          │
│ ┌───────────────────────┐ │
│ │ PK-DEL-001  •  120m   │ │
│ │ 🟢 Available · ~2 min │ │ ← HealthBadge + ETA
│ │              [Select] │ │
│ ├───────────────────────┤ │
│ │ PK-DEL-002  •  300m   │ │
│ │ 🟠 Busy · ~8 min      │ │
│ ├───────────────────────┤ │
│ │ PK-DEL-003            │ │
│ │ 🔴 Offline (disabled) │ │
│ └───────────────────────┘ │
└───────────────────────────┘
```

**Health Gate + Checkout** — before the Pay button, show the live `GateChecklist`. Pay is **disabled** until all hard checks pass.
```
┌───────────────────────────┐
│  PK-DEL-001               │
│  ✅ Online                 │
│  ✅ Printer ready          │
│  ✅ Paper enough (12 pg)   │
│  ✅ Toner ok               │
│  ✅ Queue ok · Wait ~2 min │
│  ──────────────────────── │
│  12 pages × ₹2  = ₹24      │
│  Platform fee   = ₹2       │
│  Total          = ₹26      │
│        [ Pay ₹26 ]         │  ← enabled only if gate passed
└───────────────────────────┘
```

**PIN screen** (the payoff)
```
┌───────────────────────────┐
│      🎉 Payment done       │
│   Your print PIN           │
│   ┌───────────────────┐    │
│   │   4 8 3 9 2 0     │    │ ← PinDisplay, mono, big
│   └───────────────────┘    │
│   Expires in 29:41  ⏳      │
│   Go to PK-DEL-001 and     │
│   enter this PIN.          │
│        [ Copy ]  [ Track ] │
└───────────────────────────┘
```

**Track Job** — `JobStatusTimeline`: Paid → Dispatched → PIN entered → Printing → Printed ✅ (or Failed → Refund initiated).

### 4.3 Empty/error/edge states
- No machines nearby → "Expand radius" CTA.
- Gate fails after upload → inline reason + "pick another machine".
- Payment failed → retry, no PIN minted, file retained briefly.
- PIN expired before collection → auto-refund banner + "print again".

---

## 5. Product 2 — Admin Dashboard (desktop-first, dense)

Sidebar nav: **Overview · Fleet · Machines · Jobs · Payments · Refunds · Users · Operators · Reports · Tickets · Settings.** Role-gated per [RBAC](system-architecture.md).

**Overview**
```
┌──────────────────────────────────────────────────────────────┐
│ Fleet 938/1000 online   Jobs today 14,203   Revenue ₹3.1L     │
│ [StatTile][StatTile][StatTile][StatTile]                      │
│ ┌── Alerts ──────────────┐ ┌── Live queues ───────────────┐  │
│ │ 🔴 PK-MUM-014 offline 6m│ │ PK-DEL-001  ▓▓░ 2            │  │
│ │ 🟠 PK-PUN-009 toner low │ │ PK-DEL-002  ▓▓▓▓ 7          │  │
│ └────────────────────────┘ └─────────────────────────────┘  │
│ ┌── FleetMap (machines by status) ─────────────────────────┐ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Machine detail** — health history, consumables, current job, command buttons (Reboot / Maintenance / Test page / Clear queue) → each is an audited `MachineCommand`. **No file contents anywhere** (privacy invariant).

**Payments / Refunds** — searchable ledger, reconciliation status, one-click refund (step-up auth + reason → audited). **Finance** sees settlements & payouts.

**Users / Operators** — role management (SUPER_ADMIN only, audited), operator→machine assignment, earnings.

---

## 6. Product 3 — Machine Portal (kiosk, runs on the machine screen)

Full-screen, touch-first, **no scrolling, no jargon, one task per screen.** Auto-returns to idle after timeout.

**Idle / attract**
```
┌──────────────────────────────────────────┐
│                                          │
│            PRINT  KARO                    │
│        Enter your PIN to print           │
│                                          │
│            [  Enter PIN  ]                │
│   🟢 Ready · Paper ok · Queue: 0          │  ← mirrors health
└──────────────────────────────────────────┘
```

**PIN entry** (`PinPad`, large targets, masked dots)
```
┌──────────────────────────────────────────┐
│           Enter your 6-digit PIN          │
│            ● ● ● ● _ _                     │
│        ┌───┬───┬───┐                      │
│        │ 1 │ 2 │ 3 │                       │
│        ├───┼───┼───┤                      │
│        │ 4 │ 5 │ 6 │                       │
│        ├───┼───┼───┤                      │
│        │ 7 │ 8 │ 9 │                       │
│        ├───┼───┼───┤                      │
│        │ ⌫ │ 0 │ ✓ │                       │
│        └───┴───┴───┘                       │
│   attempts left: 5                         │
└──────────────────────────────────────────┘
```

**States after submit:** Verifying → Downloading → **Printing (progress)** → ✅ "Done! Collect your prints" → returns to idle and deletes the file. Failure → "Print failed, refund initiated" + ticket option. Wrong PIN → shake + decrement attempts; lock after 5.

The Machine Portal holds **no business logic** — it only calls the local Agent / API and renders status.

---

## 7. Product 4 — Machine Agent (headless, no UI)

The Agent has **no human UI**; its "interface" is logs + a tiny local diagnostics page (`localhost`) for a technician:
```
┌──────────── Print Karo Agent (local diag) ────────────┐
│ Machine: PK-DEL-001   Agent v1.4.2   Platform: windows │
│ MQTT: connected ✅   API: reachable ✅                   │
│ Printer: HP M404 · READY · paper ~180 · toner 64%      │
│ Current job: none   Local queue: 0                     │
│ Last heartbeat: 3s ago   Uptime: 20h 3m                │
│ [ Test page ] [ Reconnect ] [ View logs ]              │
└────────────────────────────────────────────────────────┘
```
Visible only on the device to a field technician; not exposed to the public or the kiosk user.

---

## 8. Product 5 — Backend API (developer interface)

No GUI; its "design" is the contract surface: **Swagger/OpenAPI UI** (generated from the same Zod/`api-contract` schemas) at `/api/docs` (protected in prod), plus the typed `api-client`. See [API Specification](api-specification.md).

---

## 9. Responsive, A11y & i18n

- **Responsive:** customer = mobile-first → scales up; admin = desktop-first → collapses to usable tablet; kiosk = fixed full-screen.
- **A11y:** Radix primitives give focus management + ARIA; visible focus rings; 44px min touch targets on kiosk; color is never the only signal (icon + text with every HealthBadge).
- **i18n-ready:** copy externalized; launch English + Hindi; numbers/currency localized (₹).
- **Dark mode** for admin (long shifts); kiosk stays high-contrast light.

---

## 10. Related Documents
[PRD](product-requirements.md) · [Architecture](system-architecture.md) · [API](api-specification.md) · [Machine Protocol](machine-protocol.md) · [Roadmap](development-roadmap.md)
