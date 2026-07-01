// Print Karo frontend — customer dashboard (active order/PIN, history, files, invoices, profile).
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, copyText } from './ui.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, $$, el, formatPaise, formatDate, remaining, escapeHtml, store } from './utils.js';
import { guardPage, signOut } from './auth.js';

let orders = [];
let uploads = [];
let notifications = [];
let countdownTimer = null;

const ACTIVE_STATES = ['PAID', 'PIN_GENERATED', 'WAITING_AT_MACHINE', 'PRINTING'];

function statusBadge(status) {
  const map = {
    COMPLETED: 'badge-success',
    FAILED: 'badge-danger',
    EXPIRED: 'badge-danger',
    CANCELLED: 'badge-danger',
    REFUNDED: 'badge-danger',
    PRINTING: 'badge-warning',
    WAITING_AT_MACHINE: 'badge-warning',
    PIN_GENERATED: 'badge-brand',
  };
  return `<span class="badge ${map[status] || ''}">${status.replaceAll('_', ' ')}</span>`;
}

function pinFor(orderId) {
  for (const n of notifications) {
    if (n.orderId === orderId || n.type === 'PIN_GENERATED') {
      const m = /\b(\d{4})\b/.exec(n.body || '');
      if (m) return m[1];
    }
  }
  return null;
}

function renderActiveOrder() {
  const host = $('#active-order');
  const active = orders.find((o) => ACTIVE_STATES.includes(o.status));
  if (!active) {
    host.innerHTML = `
      <div class="card empty">
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--text-3)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h2"/></svg>
        <h3 style="color:var(--text)">No active print</h3>
        <p>Upload a document to get started.</p>
        <a class="btn btn-primary" href="upload.html" style="margin-top:12px">Start printing</a>
      </div>`;
    return;
  }

  const pin = pinFor(active.id);
  const card = el('div', { class: 'card' });
  card.style.borderColor = 'var(--brand-500)';
  card.innerHTML = `
    <div class="between" style="margin-bottom:16px">
      <div>
        <div class="text-muted" style="font-size:var(--fs-sm)">Active order</div>
        <div style="font-weight:700;font-size:var(--fs-lg)">${active.orderNumber}</div>
      </div>
      ${statusBadge(active.status)}
    </div>
    ${
      pin
        ? `<div class="text-center">
            <div class="text-muted" style="font-size:var(--fs-sm)">Your PIN</div>
            <div class="pin-display" style="margin:12px 0">${pin.split('').map((d) => `<div class="pin-digit">${d}</div>`).join('')}</div>
            <div class="between" style="justify-content:center;gap:16px">
              <span class="countdown" data-expires="${active.pinExpiresAt || ''}"><span data-cd>—</span></span>
              <button class="btn btn-outline" data-copy="${pin}">Copy PIN</button>
            </div>
          </div>`
        : `<p class="text-muted">Your PIN will appear here once your payment is confirmed.</p>`
    }
    <div class="between" style="margin-top:16px;font-size:var(--fs-sm)">
      <span class="text-muted">Amount</span><b>${formatPaise(active.amountPaise)}</b>
    </div>`;
  host.innerHTML = '';
  host.append(card);

  const copyBtn = card.querySelector('[data-copy]');
  if (copyBtn) copyBtn.addEventListener('click', () => copyText(copyBtn.dataset.copy));
  startCountdown();
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const update = () => {
    $$('.countdown[data-expires]').forEach((wrap) => {
      const iso = wrap.dataset.expires;
      const cd = wrap.querySelector('[data-cd]');
      if (!iso) {
        cd.textContent = '—';
        return;
      }
      const r = remaining(iso);
      cd.textContent = r.expired ? 'PIN expired' : `Expires in ${r.text}`;
      wrap.classList.toggle('danger', r.ms < 5 * 60 * 1000);
    });
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

const view = { q: '', filter: 'all', page: 1, perPage: 6 };

function filteredOrders() {
  return orders.filter((o) => {
    if (view.filter === 'active' && !ACTIVE_STATES.includes(o.status)) return false;
    if (view.filter === 'completed' && o.status !== 'COMPLETED') return false;
    if (view.q && !`${o.orderNumber} ${o.status}`.toLowerCase().includes(view.q)) return false;
    return true;
  });
}

function renderOrders() {
  const all = filteredOrders();
  const toolbar = `
    <div class="dash-toolbar">
      <div class="search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="input" id="o-search" type="search" placeholder="Search orders…" aria-label="Search orders" value="${escapeHtml(view.q)}" />
      </div>
      <div class="segment" role="group" aria-label="Filter orders">
        <button type="button" data-ofilter="all" aria-pressed="${view.filter === 'all'}">All</button>
        <button type="button" data-ofilter="active" aria-pressed="${view.filter === 'active'}">Active</button>
        <button type="button" data-ofilter="completed" aria-pressed="${view.filter === 'completed'}">Done</button>
      </div>
    </div>`;

  if (!all.length) return toolbar + `<div class="empty"><p>No orders match.</p></div>`;

  const pages = Math.ceil(all.length / view.perPage);
  view.page = Math.min(view.page, pages);
  const slice = all.slice((view.page - 1) * view.perPage, view.page * view.perPage);

  const rows = slice
    .map(
      (o) => `
    <div class="order-row" style="margin-top:10px">
      <div style="min-width:0">
        <div style="font-weight:600">${escapeHtml(o.orderNumber)}</div>
        <div class="text-muted" style="font-size:var(--fs-xs)">${formatDate(o.createdAt)}</div>
      </div>
      <div class="flex" style="gap:12px;align-items:center">
        <b>${formatPaise(o.amountPaise)}</b>
        ${statusBadge(o.status)}
        <button class="btn btn-ghost" data-dup="${escapeHtml(o.id)}" title="Print this again" aria-label="Duplicate order">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
      </div>
    </div>`,
    )
    .join('');

  const pager =
    pages > 1
      ? `<div class="pager">
          <button class="btn btn-outline" data-pg="prev" ${view.page === 1 ? 'disabled' : ''}>Prev</button>
          <span class="text-muted" style="font-size:var(--fs-sm)">Page ${view.page} of ${pages}</span>
          <button class="btn btn-outline" data-pg="next" ${view.page === pages ? 'disabled' : ''}>Next</button>
        </div>`
      : '';

  return toolbar + rows + pager;
}

function renderPins() {
  const withPins = orders.filter((o) => pinFor(o.id) || o.pinStatus);
  if (!withPins.length) return `<div class="empty"><p>No PINs yet.</p></div>`;
  return withPins
    .map((o) => {
      const pin = pinFor(o.id);
      const active = o.status === 'PIN_GENERATED' || o.status === 'WAITING_AT_MACHINE';
      return `
      <div class="order-row" style="margin-top:10px">
        <div>
          <div style="font-weight:600">${escapeHtml(o.orderNumber)}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${formatDate(o.createdAt)}</div>
        </div>
        <div class="flex" style="gap:12px;align-items:center">
          <span class="mono" style="font-weight:800;letter-spacing:0.2em">${pin ? escapeHtml(pin) : '••••'}</span>
          <span class="badge ${active ? 'badge-brand' : 'badge'}">${active ? 'Active' : 'Used'}</span>
          ${pin ? `<button class="btn btn-ghost" data-copypin="${escapeHtml(pin)}" aria-label="Copy PIN">Copy</button>` : ''}
        </div>
      </div>`;
    })
    .join('');
}

function renderFiles() {
  if (!uploads.length) return `<div class="empty"><p>No saved files yet.</p></div>`;
  return uploads
    .map(
      (u) => `
    <div class="order-row" style="margin-top:10px">
      <div class="flex" style="gap:12px;align-items:center;min-width:0">
        <div class="file-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></div>
        <div style="min-width:0">
          <div class="file-name">${u.originalFilename}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${u.metadata?.pageCount || '?'} page(s) · ${u.status}</div>
        </div>
      </div>
      <div class="flex" style="gap:8px">
        <button class="btn btn-ghost" data-dl="${escapeHtml(u.id)}" aria-label="Download again">Download</button>
        <a class="btn btn-outline" href="upload.html">Reuse</a>
      </div>
    </div>`,
    )
    .join('');
}

function renderInvoices() {
  const paid = orders.filter((o) => ['PAID', 'PIN_GENERATED', 'WAITING_AT_MACHINE', 'PRINTING', 'COMPLETED', 'REFUNDED'].includes(o.status));
  if (!paid.length) return `<div class="empty"><p>No invoices yet.</p></div>`;
  return paid
    .map(
      (o) => `
    <div class="order-row" style="margin-top:10px">
      <div>
        <div style="font-weight:600">Receipt · ${o.orderNumber}</div>
        <div class="text-muted" style="font-size:var(--fs-xs)">${formatDate(o.createdAt)} · ${formatPaise(o.amountPaise)}</div>
      </div>
      <button class="btn btn-outline" data-receipt="${o.orderNumber}">Download</button>
    </div>`,
    )
    .join('');
}

let activeTab = 'orders';

function switchTab(tab) {
  activeTab = tab;
  $$('#tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  const content = $('#tab-content');
  content.innerHTML =
    tab === 'orders'
      ? renderOrders()
      : tab === 'pins'
        ? renderPins()
        : tab === 'files'
          ? renderFiles()
          : renderInvoices();
  wireTabEvents(content, tab);
}

function wireTabEvents(content, tab) {
  // Orders: search / filter / pager / duplicate.
  const search = content.querySelector('#o-search');
  if (search)
    search.addEventListener('input', (e) => {
      view.q = e.target.value.trim().toLowerCase();
      view.page = 1;
      rerenderOrders();
    });
  content.querySelectorAll('[data-ofilter]').forEach((b) =>
    b.addEventListener('click', () => {
      view.filter = b.dataset.ofilter;
      view.page = 1;
      rerenderOrders();
    }),
  );
  content.querySelectorAll('[data-pg]').forEach((b) =>
    b.addEventListener('click', () => {
      view.page += b.dataset.pg === 'next' ? 1 : -1;
      rerenderOrders();
    }),
  );
  content.querySelectorAll('[data-dup]').forEach((b) =>
    b.addEventListener('click', () => duplicateOrder(b.dataset.dup)),
  );
  content.querySelectorAll('[data-copypin]').forEach((b) =>
    b.addEventListener('click', () => copyText(b.dataset.copypin)),
  );
  content.querySelectorAll('[data-dl]').forEach((b) =>
    b.addEventListener('click', () => toast('Your file stays private — re-print it via Duplicate.', 'info')),
  );
  content.querySelectorAll('[data-receipt]').forEach((b) =>
    b.addEventListener('click', () => downloadReceipt(b.dataset.receipt)),
  );
}

/** Re-render only the orders tab in place (keeps focus in the search box). */
function rerenderOrders() {
  if (activeTab !== 'orders') return;
  const content = $('#tab-content');
  const focused = document.activeElement?.id === 'o-search';
  content.innerHTML = renderOrders();
  wireTabEvents(content, 'orders');
  if (focused) {
    const s = content.querySelector('#o-search');
    s?.focus();
    s?.setSelectionRange(s.value.length, s.value.length);
  }
}

/** Duplicate an order: reuse its upload + options to start a fresh print. */
async function duplicateOrder(orderId) {
  const src = orders.find((o) => o.id === orderId);
  if (!src) return;
  try {
    const full = await api.getOrder(orderId);
    store.set(CONFIG.KEYS.upload, { uploadId: full.uploadId, filename: 'Reprint' });
    if (full.printOption) {
      store.set(CONFIG.KEYS.order, {
        draft: true,
        uploadId: full.uploadId,
        machineId: full.machineId,
        options: {
          copies: full.printOption.copies,
          colorMode: full.printOption.colorMode,
          duplex: full.printOption.duplex,
          paperSize: full.printOption.paperSize,
          orientation: full.printOption.orientation,
          ...(full.printOption.pageRange ? { pageRange: full.printOption.pageRange } : {}),
        },
      });
    }
    toast('Starting a re-print…', 'success');
    window.location.href = CONFIG.ROUTES.options;
  } catch {
    toast('Could not duplicate this order.', 'error');
  }
}

/** A lightweight printable receipt (opens the browser print dialog). */
function downloadReceipt(orderNumber) {
  const o = orders.find((x) => x.orderNumber === orderNumber);
  if (!o) return;
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to view the receipt.', 'info');
  w.document.write(`<!doctype html><title>Receipt ${escapeHtml(orderNumber)}</title>
    <body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto">
      <h1 style="margin:0">Print Karo</h1><p style="color:#666">Receipt</p>
      <hr><p><b>Order:</b> ${escapeHtml(orderNumber)}</p>
      <p><b>Date:</b> ${escapeHtml(formatDate(o.createdAt))}</p>
      <p><b>Status:</b> ${escapeHtml(o.status)}</p>
      <p style="font-size:24px"><b>Total:</b> ${escapeHtml(formatPaise(o.amountPaise))}</p>
      <hr><p style="color:#666;font-size:12px">Thank you for using Print Karo.</p>
      <script>window.print()</scr` + `ipt></body>`);
  w.document.close();
}

function renderProfile(user) {
  const phone = user.phone ? `+91 ${user.phone}` : '—';
  $('#profile-card').innerHTML = `
    <div class="flex" style="gap:14px;align-items:center;margin-bottom:16px">
      <span class="t-avatar" style="width:52px;height:52px;font-size:var(--fs-xl)">${(user.name || 'U')[0].toUpperCase()}</span>
      <div>
        <div style="font-weight:700">${user.name || 'Guest'}</div>
        <div class="text-muted" style="font-size:var(--fs-sm)">${phone}</div>
      </div>
    </div>
    <div class="stack" style="gap:8px">
      <a class="btn btn-outline btn-block" href="profile.html">Edit profile</a>
      <button class="btn btn-ghost btn-block" id="dash-signout">Sign out</button>
    </div>`;
  $('#dash-signout').addEventListener('click', async () => {
    await signOut();
    window.location.href = CONFIG.ROUTES.home;
  });
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();

  const user = await guardPage(CONFIG.ROUTES.dashboard);
  if (!user) return;
  $('#hi-name').textContent = user.name ? ', ' + user.name.split(' ')[0] : '';
  renderProfile(user);

  // Load data in parallel.
  const [o, u, n] = await Promise.all([
    api.listOrders().catch(() => []),
    api.listUploads().catch(() => []),
    api.notifications().catch(() => []),
  ]);
  orders = o || [];
  uploads = u || [];
  notifications = n || [];

  renderActiveOrder();
  switchTab('orders');
  $$('#tabs .tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // Poll the active order so PRINTING → COMPLETED updates live.
  setInterval(async () => {
    orders = (await api.listOrders().catch(() => orders)) || orders;
    notifications = (await api.notifications().catch(() => notifications)) || notifications;
    renderActiveOrder();
    // Refresh the orders list in place (preserves the search box focus/value).
    if (activeTab === 'orders' && document.activeElement?.id !== 'o-search') rerenderOrders();
  }, 8000);
}

main();
