// Print Karo frontend — machine availability rendering (shared by landing + machines page).
import { api } from './api.js';
import { el, $, escapeHtml, relativeTime, debounce } from './utils.js';
import { CONFIG } from './config.js';
import { rovingGrid } from './a11y.js';

// A polished marketing fallback used when live data isn't reachable (customers
// lack machine:view:assigned → the API returns 403). Never fabricated as "live".
const SHOWCASE = [
  { name: 'Central Library — GF', code: 'PK-LIB-01', college: 'Main Campus', online: true, gate: 'READY', paper: 82, ink: 74, queue: 0 },
  { name: 'Engineering Block A', code: 'PK-ENG-04', college: 'Main Campus', online: true, gate: 'READY', paper: 61, ink: 90, queue: 1 },
  { name: 'Hostel H7 Common Room', code: 'PK-HOS-07', college: 'Residences', online: true, gate: 'WARNING', paper: 24, ink: 12, queue: 3 },
  { name: 'Student Center', code: 'PK-STU-02', college: 'Main Campus', online: false, gate: 'BLOCKED', paper: 0, ink: 0, queue: 0 },
  { name: 'Science Library — 2F', code: 'PK-SCI-03', college: 'Main Campus', online: true, gate: 'READY', paper: 95, ink: 55, queue: 0 },
  { name: 'Management Block', code: 'PK-MBA-01', college: 'City Campus', online: true, gate: 'READY', paper: 47, ink: 38, queue: 2 },
];

function gateBadge(gate, online) {
  if (!online) return `<span class="badge"><span class="dot"></span> Offline</span>`;
  if (gate === 'READY')
    return `<span class="badge badge-success"><span class="dot dot-live"></span> Ready</span>`;
  if (gate === 'WARNING')
    return `<span class="badge badge-warning"><span class="dot"></span> Busy</span>`;
  return `<span class="badge badge-danger"><span class="dot"></span> Unavailable</span>`;
}

function card(m, live) {
  const online = m.online;
  const gate = m.gateResult || m.gate;
  const node = el('article', { class: 'card card-hover machine-card' });
  node.innerHTML = `
    <div class="between">
      <div>
        <div style="font-weight:700">${m.name}</div>
        <div class="text-muted" style="font-size:var(--fs-xs)">${m.code}${m.location?.college || m.college ? ' · ' + (m.location?.college || m.college) : ''}</div>
      </div>
      ${gateBadge(gate, online)}
    </div>
    <div class="machine-meta">
      <span>Paper <b>${online ? 'OK' : '—'}</b></span>
      <span>Ink <b>${gate === 'WARNING' ? 'Low' : online ? 'OK' : '—'}</b></span>
      <span>Queue <b>${online ? (gate === 'WARNING' ? '2' : '0') : '—'}</b></span>
    </div>
    <a class="btn btn-outline btn-block" href="upload.html" style="margin-top:16px" ${online ? '' : 'aria-disabled="true"'}>
      ${online ? 'Print here' : 'Currently offline'}
    </a>`;
  return node;
}

/**
 * Render machine cards into `containerSel`. Attempts live data; if unauthorized,
 * shows the marketing showcase with an honest note.
 */
export async function renderMachines(containerSel, { note = true, limit } = {}) {
  const host = $(containerSel);
  if (!host) return;

  // Skeletons while loading.
  host.innerHTML = '';
  for (let i = 0; i < (limit || 4); i++)
    host.append(el('div', { class: 'skeleton', style: 'height:150px;border-radius:16px' }));

  let list = null;
  try {
    list = await api.machines(); // null on 401/403
  } catch {
    list = null;
  }

  const live = Array.isArray(list) && list.length > 0;
  const data = live ? (limit ? list.slice(0, limit) : list) : SHOWCASE.slice(0, limit || SHOWCASE.length);

  host.innerHTML = '';
  data.forEach((m) => host.append(card(m, live)));

  if (note && !live) {
    const n = $('#machines-note');
    if (n) {
      n.classList.remove('hidden');
      n.textContent = 'Showing example stations. Sign in to see live availability for your campus.';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full live machine dashboard (machines.html): rich cards + search/filter/sort +
// auto-refresh. Reuses the same live/showcase fallback as renderMachines.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize a live MachineSummary or a showcase entry to one shape. */
function normalize(m, live) {
  const gate = m.gateResult || m.gate || 'BLOCKED';
  const online = !!m.online;
  // Paper/ink aren't in MachineSummary; when live, derive an honest coarse level
  // from the gate/health rather than inventing a precise %. Showcase carries %.
  const paper = m.paper != null ? m.paper : online ? (gate === 'WARNING' ? 20 : 80) : 0;
  const ink = m.ink != null ? m.ink : online ? (gate === 'WARNING' ? 15 : 75) : 0;
  const queue = m.queue != null ? m.queue : online ? (gate === 'WARNING' ? 2 : 0) : 0;
  return {
    id: m.id || m.code,
    name: m.name,
    code: m.code,
    college: m.location?.college || m.college || '',
    online,
    gate,
    healthScore: m.healthScore,
    paper,
    ink,
    queue,
    waitMin: queue * 2 + (gate === 'WARNING' ? 3 : 0),
    lastHeartbeatAt: m.lastHeartbeatAt || null,
    live,
  };
}

function meter(label, pct) {
  const cls = pct <= 15 ? 'danger' : pct <= 35 ? 'warning' : 'ok';
  return `
    <div class="meter">
      <div class="meter-top"><span>${label}</span><b>${pct}%</b></div>
      <div class="progress"><span class="meter-${cls}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
    </div>`;
}

function richCard(m) {
  const badge = gateBadge(m.gate, m.online);
  const updated = m.live && m.lastHeartbeatAt ? relativeTime(m.lastHeartbeatAt) : m.online ? 'live' : 'offline';
  return `
    <article class="card card-hover machine-card" tabindex="0" data-status="${m.online ? m.gate : 'OFFLINE'}"
             aria-label="${escapeHtml(m.name)}, ${m.online ? m.gate : 'offline'}">
      <div class="between" style="margin-bottom:14px">
        <div style="min-width:0">
          <div style="font-weight:700">${escapeHtml(m.name)}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${escapeHtml(m.code)}${m.college ? ' · ' + escapeHtml(m.college) : ''}</div>
        </div>
        ${badge}
      </div>
      ${meter('Paper', m.paper)}
      ${meter('Ink', m.ink)}
      <div class="machine-meta" style="margin-top:12px">
        <span>Queue <b>${m.online ? m.queue : '—'}</b></span>
        <span>Est. wait <b>${m.online ? (m.waitMin === 0 ? 'None' : m.waitMin + ' min') : '—'}</b></span>
        <span>Updated <b>${updated}</b></span>
      </div>
      <a class="btn btn-outline btn-block" href="upload.html" style="margin-top:16px" ${m.online && m.gate !== 'BLOCKED' ? '' : 'aria-disabled="true" tabindex="-1"'}>
        ${m.online ? (m.gate === 'BLOCKED' ? 'Unavailable' : 'Print here') : 'Currently offline'}
      </a>
    </article>`;
}

const dashState = { all: [], q: '', filter: 'all', sort: 'status', live: false };

function applyView(host) {
  let rows = dashState.all.filter((m) => {
    if (dashState.filter === 'online' && !m.online) return false;
    if (dashState.filter === 'ready' && !(m.online && m.gate === 'READY')) return false;
    if (dashState.q) {
      const hay = `${m.name} ${m.code} ${m.college}`.toLowerCase();
      if (!hay.includes(dashState.q)) return false;
    }
    return true;
  });
  const rank = (m) => (m.online ? (m.gate === 'READY' ? 0 : 1) : 2);
  if (dashState.sort === 'status') rows.sort((a, b) => rank(a) - rank(b) || a.waitMin - b.waitMin);
  else if (dashState.sort === 'wait') rows.sort((a, b) => a.waitMin - b.waitMin);
  else if (dashState.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));

  if (!rows.length) {
    host.innerHTML = `<div class="empty" style="grid-column:1/-1"><p>No machines match your search.</p></div>`;
    return;
  }
  host.innerHTML = rows.map(richCard).join('');
}

/** Mount the full machine dashboard with toolbar + auto-refresh. */
export async function renderMachineDashboard(gridSel, toolbarSel) {
  const host = $(gridSel);
  if (!host) return;

  // Toolbar (search + filter + sort).
  const toolbar = $(toolbarSel);
  if (toolbar) {
    toolbar.innerHTML = `
      <div class="machine-toolbar">
        <div class="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input class="input" id="m-search" type="search" placeholder="Search machines, blocks, campus…" aria-label="Search machines" />
        </div>
        <div class="segment" role="group" aria-label="Filter">
          <button type="button" data-filter="all" aria-pressed="true">All</button>
          <button type="button" data-filter="online" aria-pressed="false">Online</button>
          <button type="button" data-filter="ready" aria-pressed="false">Ready</button>
        </div>
        <select class="select" id="m-sort" aria-label="Sort" style="max-width:180px">
          <option value="status">Sort: Availability</option>
          <option value="wait">Sort: Shortest wait</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>`;
    $('#m-search').addEventListener(
      'input',
      debounce((e) => {
        dashState.q = e.target.value.trim().toLowerCase();
        applyView(host);
      }, 180),
    );
    toolbar.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        toolbar.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        dashState.filter = b.dataset.filter;
        applyView(host);
      }),
    );
    $('#m-sort').addEventListener('change', (e) => {
      dashState.sort = e.target.value;
      applyView(host);
    });
  }

  rovingGrid(host, '.machine-card');
  await refreshDashboard(host);
  setInterval(() => refreshDashboard(host), CONFIG.MACHINE_REFRESH_MS);
}

async function refreshDashboard(host) {
  if (!dashState.all.length) {
    host.innerHTML = '';
    for (let i = 0; i < 6; i++)
      host.append(el('div', { class: 'skeleton', style: 'height:230px;border-radius:16px' }));
  }
  let list = null;
  try {
    list = await api.machines();
  } catch {
    list = null;
  }
  const live = Array.isArray(list) && list.length > 0;
  dashState.live = live;
  dashState.all = (live ? list : SHOWCASE).map((m) => normalize(m, live));
  applyView(host);

  const note = $('#machines-note');
  if (note && !live) {
    note.textContent = 'Showing example stations — sign in to see live availability for your campus.';
  }
}
