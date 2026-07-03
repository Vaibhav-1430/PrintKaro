// Print Karo frontend — Notification Center (nav bell + dropdown + toasts).
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, el, escapeHtml, relativeTime } from './utils.js';
import { toast } from './ui.js';
import { trapFocus, announce } from './a11y.js';

const ICONS = {
  ORDER_CREATED: '🧾',
  PAYMENT_SUCCEEDED: '✅',
  PAYMENT_FAILED: '⚠️',
  PIN_GENERATED: '🔑',
  PRINTING_STARTED: '🖨️',
  PRINTING_COMPLETED: '🎉',
  PRINTING_FAILED: '❌',
  ORDER_EXPIRED: '⌛',
  REFUND_ISSUED: '↩️',
};

const TOAST_ON = {
  PRINTING_STARTED: 'info',
  PRINTING_COMPLETED: 'success',
  PRINTING_FAILED: 'error',
  PIN_GENERATED: 'success',
  PAYMENT_FAILED: 'error',
  ORDER_EXPIRED: 'error',
};

let seen = new Set();
let items = [];
let pollTimer;
let releaseTrap;

/** Mount the bell into the nav slot (#nav-notify). Called by partials for authed users. */
export function mountNotifications() {
  const slot = $('#nav-notify');
  if (!slot) return;
  slot.innerHTML = `
    <div class="notify" style="position:relative">
      <button class="btn btn-icon" id="notify-bell" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        <span class="notify-badge hidden" id="notify-badge">0</span>
      </button>
      <div class="notify-panel glass hidden" id="notify-panel" role="dialog" aria-label="Notifications">
        <div class="notify-head"><b>Notifications</b><button class="btn btn-ghost" id="notify-readall" style="padding:4px 10px;font-size:var(--fs-xs)">Mark all read</button></div>
        <div class="notify-list" id="notify-list"></div>
      </div>
    </div>`;

  const bell = $('#notify-bell');
  const panel = $('#notify-panel');
  bell.addEventListener('click', () => togglePanel(bell, panel));
  $('#notify-readall').addEventListener('click', markAllRead);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notify') && !panel.classList.contains('hidden'))
      closePanel(bell, panel);
  });

  refresh(true);
  clearInterval(pollTimer);
  // Guard against a missing/too-small config value: setInterval(fn, undefined)
  // polls with a 0ms delay and floods the API. Never poll faster than 10s.
  const pollMs = Math.max(10_000, Number(CONFIG.NOTIFY_POLL_MS) || 30_000);
  pollTimer = setInterval(() => refresh(false), pollMs);
}

function togglePanel(bell, panel) {
  if (panel.classList.contains('hidden')) openPanel(bell, panel);
  else closePanel(bell, panel);
}
function openPanel(bell, panel) {
  panel.classList.remove('hidden');
  bell.setAttribute('aria-expanded', 'true');
  releaseTrap = trapFocus(panel, { onClose: () => closePanel(bell, panel), opener: bell });
  renderList();
}
function closePanel(bell, panel) {
  panel.classList.add('hidden');
  bell.setAttribute('aria-expanded', 'false');
  releaseTrap?.();
}

async function refresh(first) {
  let next;
  try {
    next = await api.notifications();
  } catch {
    return;
  }
  if (!Array.isArray(next)) return;

  // Toast genuinely new events (skip the initial load to avoid a burst).
  if (!first) {
    for (const n of next) {
      if (!seen.has(n.id) && TOAST_ON[n.type]) {
        toast(n.title || n.body, TOAST_ON[n.type]);
        announce(n.title || n.body);
      }
    }
  }
  next.forEach((n) => seen.add(n.id));
  items = next;
  updateBadge();
  if (!$('#notify-panel')?.classList.contains('hidden')) renderList();
}

function updateBadge() {
  const badge = $('#notify-badge');
  if (!badge) return;
  const unread = items.filter((n) => !n.read).length;
  badge.textContent = unread > 9 ? '9+' : String(unread);
  badge.classList.toggle('hidden', unread === 0);
}

function renderList() {
  const list = $('#notify-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="empty" style="padding:24px"><p>No notifications yet.</p></div>`;
    return;
  }
  list.innerHTML = items
    .slice(0, 30)
    .map(
      (n) => `
      <div class="notify-item ${n.read ? '' : 'unread'}" data-id="${escapeHtml(n.id)}">
        <span class="notify-ic" aria-hidden="true">${ICONS[n.type] || '🔔'}</span>
        <div style="min-width:0">
          <div class="notify-title">${escapeHtml(n.title || n.type)}</div>
          <div class="notify-body">${escapeHtml(n.body || '')}</div>
          <div class="notify-time">${relativeTime(n.createdAt)}</div>
        </div>
      </div>`,
    )
    .join('');
  list
    .querySelectorAll('.notify-item.unread')
    .forEach((row) => row.addEventListener('click', () => markRead(row.dataset.id, row)));
}

async function markRead(id, row) {
  try {
    await api.markNotificationRead(id);
    const item = items.find((n) => n.id === id);
    if (item) item.read = true;
    row?.classList.remove('unread');
    updateBadge();
  } catch {
    /* ignore */
  }
}

async function markAllRead() {
  const unread = items.filter((n) => !n.read);
  await Promise.all(unread.map((n) => api.markNotificationRead(n.id).catch(() => {})));
  unread.forEach((n) => (n.read = true));
  updateBadge();
  renderList();
}
