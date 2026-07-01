# Print Karo — Premium Customer Frontend (vanilla)

A brand-new, framework-free customer experience for Print Karo. Pure **HTML5 +
CSS3 + ES6-module JavaScript**, enhanced with **GSAP/Lenis/Lottie/Swiper** (loaded
from CDN, progressive enhancement — the app works without them). It consumes the
existing NestJS REST APIs unchanged.

> This lives alongside — and does not touch — the three Next.js apps
> (`apps/web-customer`, `apps/web-admin`, `apps/web-machine`) or any backend code.

## What's here

```
frontend/
  index.html          Premium landing (hero, live machines, features, how-it-works,
                      pricing, stats, testimonials, FAQ, CTA, footer)
  upload.html         Drag & drop upload → presigned PUT → validate
  options.html        Print options with live pricing
  auth.html           Name → Phone → OTP-styled sign-in (see "Auth" below)
  pay.html            Order creation + health gate + demo payment
  success.html        Payment success, PIN, countdown, machine details
  dashboard.html      Active order + PIN, order history, saved files, invoices, profile
  profile.html        Edit name/phone, active sessions
  pricing / machines / how-it-works / about / contact / faq / 404
  assets/css/         tokens, base, components, animations, landing, app
  assets/js/          config, utils, api, ui, theme, animations, auth, partials,
                      stepper, page + per-page controllers
  assets/animations/  (optional) Lottie JSON, e.g. success.json
```

## Run it

The frontend is static — serve the `frontend/` folder with any static server:

```bash
# from the repo root
npx serve frontend            # → http://localhost:3000
# or
python -m http.server 5173 --directory frontend
# or VS Code "Live Server"
```

Then start the API (already built in earlier sprints):

```bash
node apps/api/dist/main.js
```

### Point the frontend at your API

By default the client calls `http://localhost:4000`. To override without editing
code, set a global before the modules load (e.g. via a reverse proxy or an inline
snippet), or edit `assets/js/config.js`:

```js
window.PK_API_BASE = 'https://api.your-host.com';
```

### CORS (one config value)

The API reads allowed origins from the `CORS_ORIGINS` env var (comma-separated)
and sends `credentials: true`. Add the origin you serve this frontend from, e.g.:

```
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

This is a **config value only** — no backend code/logic is changed. `.env.example`
is intentionally left untouched.

## Auth (important, honest note)

The existing backend uses **Better Auth email/password** with HttpOnly cookie
sessions; it has **no SMS-OTP, phone-login, or guest-checkout endpoints**, and the
order/upload/payment/PIN routes require a signed-in `CUSTOMER`.

So this frontend delivers the requested **Name → Phone → OTP** *experience* as a
premium UX layer over the real auth:

- The OTP screen is a real, animated flow, but verification is client-side (demo).
- On "verify", we establish a **real session** by deriving a deterministic
  credential from the phone number (same phone → same account), so a returning
  user's **previous orders are linked by phone** exactly as asked.
- The display name + phone are saved to the profile (`PATCH /auth/profile`).

Turning this into true SMS-OTP / real guest checkout requires **backend changes**
that were explicitly out of scope for this task.

## Live machine availability

The customer-facing machine list uses `GET /admin/machines`, which requires a
staff permission (`machine:view:assigned`) the `CUSTOMER` role does not hold. So:

- When live data is reachable, real machine cards render.
- Otherwise the landing/machines pages show a polished **example showcase** with an
  honest "sign in to see live status" note — never fabricated as live.

A dedicated public machine-status endpoint would be a backend change (out of scope).

## Design & quality

- Dark/light mode (`[data-theme]` + CSS variables, persisted, respects system).
- Glassmorphism, soft shadows, skeletons, toasts, empty states, button ripples.
- Scroll reveals + counters via IntersectionObserver (GSAP/Lenis enhance, don't gate).
- Fully responsive & mobile-first; semantic HTML + ARIA; `prefers-reduced-motion`
  fully honored; lazy fonts; targets Lighthouse 95+ on the landing page.
- Zero build step. Zero framework. Zero backend changes.

---

## Production hardening (Sprint 5.5)

This build adds startup-quality polish and cross-cutting infrastructure — all
additive, still consuming the existing REST APIs unchanged.

**Experience**
- **Landing** — GSAP hero timeline, an animated printer illustration that "prints"
  the ticket, parallax blobs (all progressive-enhancement over the IntersectionObserver
  reveals; fully skipped under `prefers-reduced-motion`).
- **Live machine dashboard** (`machines.html`) — paper/ink meters, queue length,
  estimated wait, "last updated", plus search + status filter + sort and auto-refresh.
  Live data when reachable; honest example showcase otherwise (customers 403 on the
  staff machines endpoint).
- **Document preview** (`options.html`) — pdf.js (lazy-loaded from CDN) with zoom/rotate/
  page-count; "delete pages" builds the existing `pageRange` (no new API); live cost +
  warnings. The just-uploaded file is cached in IndexedDB so it can be previewed on the
  next page. Non-PDF (converted) files degrade to a metadata summary.
- **Advanced upload** (`upload.html`) — multi-file + folder upload, per-file queue with
  progress, retry / cancel / resume, and validation.
- **Customer dashboard** — active order + PIN + countdown, PIN history, invoices
  (printable receipt), saved files, **duplicate order** (re-print), and search + filter +
  pagination.
- **Notification center** — nav bell + dropdown polling `/notifications`, unread badge,
  mark-read, and toasts for PIN/printing/machine events (authed users only).

**Cross-cutting**
- **Accessibility (WCAG-AA)** — skip link, focus traps for menus/dropdowns, roving-tabindex
  grids, `aria-live` announcements, strong visible focus rings, reduced-motion + high-contrast.
- **Performance** — lazy images (`data-src`), on-demand loading of pdf.js/Swiper/GSAP,
  debounce/throttle, IntersectionObserver everywhere, skeletons, preconnect. Target
  Lighthouse > 95 on the landing.
- **Offline / PWA** — service worker (`sw.js`) precaches the app shell, **network-only for
  all `/api`/auth/cross-origin** (sessions & live data never cached), `offline.html` fallback,
  `manifest.webmanifest`, install prompt, and online/offline reconnect toasts.
- **Security** — a practical allowlist **CSP** on every page, `escapeHtml()` on all
  API/user data rendered via `innerHTML`, and the existing client file validation. The
  API's own rate-limit/CSRF/Helmet are unchanged; the frontend stays cookie-auth compatible.
- **SEO** — canonical URLs, OpenGraph + Twitter cards, JSON-LD (`Organization`, `WebSite`,
  `FAQPage`), `robots.txt`, `sitemap.xml`, per-page titles/descriptions.
- **Analytics** — GA4 + Microsoft Clarity load **only** when their IDs are set in
  `config.js` (`window.PK_GA_ID` / `PK_CLARITY_ID`); empty by default → zero third-party
  requests. Funnel events fire at upload → options → pay → success.

### Tests (opt-in — not part of the monorepo pipeline)

```bash
cd frontend
npm install                 # installs @playwright/test
npm run test:e2e:install    # one-time browser download
npm run test:e2e            # Playwright smoke + a11y (desktop + mobile)
npm run serve &             # static server on :4173
npm run lighthouse          # Lighthouse vs tests/budget.json → tests/lighthouse-report.html
```

The Playwright config spins up its own static server; the smoke spec loads every page
(no console errors), the a11y spec checks landmarks/alt/focus/reduced-motion, and
`budget.json` sets performance budgets. None of this is wired into `pnpm test`.
