// Print Karo frontend — print options + live pricing.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { renderStepper } from './stepper.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, $$, store, goto, debounce, formatPaise, escapeHtml } from './utils.js';
import { isAuthed } from './auth.js';
import { getFile } from './filecache.js';
import { mountPreview, isPreviewable } from './pdf-preview.js';
import { trackFunnel } from './analytics.js';

const state = {
  uploadId: null,
  pageCount: 1,
  excluded: new Set(), // page numbers the user removed
  machineId: '',
  copies: 1,
  colorMode: 'BW',
  paperSize: 'A4',
  duplex: false,
  orientation: 'portrait',
};

let lastMeta = null; // upload metadata, for warnings that depend on current options

/** Pages that will actually print = all pages minus excluded. */
function pagesToPrint() {
  return Math.max(0, state.pageCount - state.excluded.size);
}

/** Build the backend pageRange string ("1-3,5") from the included pages. */
function pageRange() {
  if (state.excluded.size === 0) return undefined; // all pages
  const included = [];
  for (let p = 1; p <= state.pageCount; p++) if (!state.excluded.has(p)) included.push(p);
  if (!included.length) return undefined;
  // Compress consecutive runs.
  const parts = [];
  let start = included[0];
  let prev = included[0];
  for (let i = 1; i < included.length; i++) {
    if (included[i] === prev + 1) prev = included[i];
    else {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = included[i];
    }
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`);
  return parts.join(',');
}

const SHOWCASE_MACHINES = [
  { id: '', name: 'Sign in to choose a live machine', online: false },
];

async function loadMachines() {
  const sel = $('#machine');
  const note = $('#machine-note');
  let list = null;
  try {
    list = await api.machines();
  } catch {
    list = null;
  }

  if (Array.isArray(list) && list.length) {
    sel.innerHTML =
      '<option value="">Select a machine…</option>' +
      list
        .map((m) => {
          const ok = m.online && m.gateResult !== 'BLOCKED';
          const status = m.online ? m.gateResult : 'offline';
          return `<option value="${m.id}" ${ok ? '' : 'disabled'}>${m.name} (${m.code}) — ${status}</option>`;
        })
        .join('');
    const firstReady = list.find((m) => m.online && m.gateResult === 'READY');
    if (firstReady) {
      sel.value = firstReady.id;
      state.machineId = firstReady.id;
    }
  } else {
    // Customers can't read the machine list until signed in; allow choosing at
    // pay time. Provide a single placeholder + note.
    sel.innerHTML = SHOWCASE_MACHINES.map(
      (m) => `<option value="${m.id}">${m.name}</option>`,
    ).join('');
    note.classList.remove('hidden');
    note.style.color = 'var(--text-3)';
    note.textContent = 'Live machine selection unlocks after you verify your phone.';
  }
}

const recalc = debounce(async () => {
  const priceEl = $('#price');
  const bd = $('#price-breakdown');
  const pages = pagesToPrint();
  if (pages <= 0) {
    priceEl.textContent = formatPaise(0);
    bd.innerHTML = `<span class="field-error">You've removed every page — keep at least one.</span>`;
    return;
  }
  try {
    // Use a real machineId if chosen; otherwise the default global rule applies,
    // so send a zero-uuid to still get an accurate estimate.
    const machineId = state.machineId || '00000000-0000-0000-0000-000000000000';
    const b = await api.calculatePrice({
      machineId,
      copies: state.copies,
      colorMode: state.colorMode,
      duplex: state.duplex,
      paperSize: state.paperSize,
      pagesToPrint: pages,
    });
    priceEl.textContent = formatPaise(b.totalPaise);
    priceEl.classList.remove('flash');
    void priceEl.offsetWidth;
    priceEl.classList.add('flash');
    bd.innerHTML = `
      <div class="between"><span class="text-muted">${pages} page(s) × ${state.copies} cop(y/ies)</span><span>${formatPaise(b.subtotalPaise)}</span></div>
      ${b.duplexDiscountPaise ? `<div class="between"><span class="text-muted">Duplex discount</span><span style="color:var(--success)">−${formatPaise(b.duplexDiscountPaise)}</span></div>` : ''}
      <div class="between" style="font-weight:700;border-top:1px solid var(--border);padding-top:8px;margin-top:4px"><span>Total</span><span>${formatPaise(b.totalPaise)}</span></div>`;
  } catch (e) {
    priceEl.textContent = '—';
    bd.innerHTML = `<span class="field-error">${escapeHtml(e.message)}</span>`;
  }
}, 250);

/** "Delete pages" chips — toggling excludes a page from the print (→ pageRange). */
function renderPageChips() {
  const host = $('#page-chips');
  if (!host) return;
  const panel = host.closest('#pages-panel');
  if (state.pageCount <= 1) {
    panel?.classList.add('hidden');
    return;
  }
  panel?.classList.remove('hidden');
  host.innerHTML = '';
  for (let p = 1; p <= state.pageCount; p++) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'page-chip' + (state.excluded.has(p) ? ' excluded' : '');
    chip.setAttribute('aria-pressed', String(!state.excluded.has(p)));
    chip.setAttribute('aria-label', `Page ${p}${state.excluded.has(p) ? ' (removed)' : ''}`);
    chip.textContent = p;
    chip.addEventListener('click', () => {
      if (state.excluded.has(p)) state.excluded.delete(p);
      else state.excluded.add(p);
      renderPageChips();
      updatePagesLabel();
      recalc();
    });
    host.append(chip);
  }
  updatePagesLabel();
}

function updatePagesLabel() {
  const label = $('#pages-label');
  if (label) label.textContent = `${pagesToPrint()} of ${state.pageCount} pages will print`;
}

async function mountDocPreview() {
  const panel = $('#preview-panel');
  const body = $('#preview-body');
  if (!panel || !body) return;
  const file = await getFile(state.uploadId);
  if (!file || !isPreviewable(file)) {
    // Converted docs / images aren't previewable client-side — show a friendly note.
    body.innerHTML = `
      <div class="empty" style="padding:32px">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--text-3)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <p style="color:var(--text)">Preview isn't available for this file type, but it's validated and ready to print.</p>
      </div>`;
    return;
  }
  try {
    const ctrl = await mountPreview(body, file);
    if (ctrl.pageCount && ctrl.pageCount !== state.pageCount) {
      state.pageCount = ctrl.pageCount;
      renderPageChips();
      recalc();
    }
  } catch {
    body.innerHTML = `<div class="empty" style="padding:32px"><p>Couldn't render a preview — your file is still ready to print.</p></div>`;
  }
}

function renderWarnings(meta) {
  const host = $('#doc-warnings');
  if (!host || !meta) return;
  const w = [];
  if (meta.pageCount > 100) w.push(`Large document — ${meta.pageCount} pages. Double-check before paying.`);
  if (meta.isColor && state.colorMode === 'BW')
    w.push('This document has colour — printing in B&W will drop colours.');
  if (meta.orientation === 'landscape') w.push('Landscape orientation detected.');
  host.innerHTML = w.length
    ? w
        .map(
          (t) =>
            `<div class="warn-row"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>${escapeHtml(t)}</span></div>`,
        )
        .join('')
    : '';
}

function wireControls() {
  // Segments
  $$('.segment [data-color]').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.segment [data-color]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      state.colorMode = b.dataset.color;
      renderWarnings(lastMeta);
      recalc();
    }),
  );
  $$('.segment [data-paper]').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.segment [data-paper]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      state.paperSize = b.dataset.paper;
      recalc();
    }),
  );
  $$('.segment [data-orient]').forEach((b) =>
    b.addEventListener('click', () => {
      $$('.segment [data-orient]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      state.orientation = b.dataset.orient;
    }),
  );

  // Copies
  const copies = $('#copies');
  const setCopies = (n) => {
    state.copies = Math.max(1, Math.min(500, n || 1));
    copies.value = state.copies;
    recalc();
  };
  $('#copies-inc').addEventListener('click', () => setCopies(state.copies + 1));
  $('#copies-dec').addEventListener('click', () => setCopies(state.copies - 1));
  copies.addEventListener('input', () => setCopies(parseInt(copies.value, 10)));

  // Duplex
  $('#duplex').addEventListener('change', (e) => {
    state.duplex = e.target.checked;
    recalc();
  });

  // Machine
  $('#machine').addEventListener('change', (e) => {
    state.machineId = e.target.value;
    recalc();
  });
}

async function onContinue(e) {
  e.preventDefault();
  const errBox = $('#options-error');
  errBox.innerHTML = '';

  if (pagesToPrint() <= 0) {
    errBox.innerHTML = `<div class="field-error">Keep at least one page to print.</div>`;
    return;
  }

  // Persist the draft so the pay orchestrator can create the order post-auth.
  const options = {
    copies: state.copies,
    colorMode: state.colorMode,
    duplex: state.duplex,
    paperSize: state.paperSize,
    orientation: state.orientation,
  };
  const pr = pageRange();
  if (pr) options.pageRange = pr;
  store.set(CONFIG.KEYS.order, {
    draft: true,
    uploadId: state.uploadId,
    machineId: state.machineId,
    options,
  });
  trackFunnel('options_done', { pages: pagesToPrint(), color: state.colorMode });

  // If already signed in AND a machine is chosen, we can go straight to pay.
  const authed = await isAuthed();
  if (!authed) {
    store.set(CONFIG.KEYS.returnTo, CONFIG.ROUTES.pay);
    goto(CONFIG.ROUTES.auth);
    return;
  }
  if (!state.machineId) {
    errBox.innerHTML = `<div class="field-error">Please choose a machine to continue.</div>`;
    return;
  }
  const restore = loadingButton(e.currentTarget, 'Preparing…');
  try {
    goto(CONFIG.ROUTES.pay);
  } finally {
    restore();
  }
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();
  renderStepper('#stepper', 1);

  const up = store.get(CONFIG.KEYS.upload);
  if (!up || !up.uploadId) {
    toast('Please upload a document first', 'info');
    goto(CONFIG.ROUTES.upload);
    return;
  }
  state.uploadId = up.uploadId;

  // Fetch page count + metadata for accurate pricing, page chips and warnings.
  let meta = null;
  try {
    const u = await api.getUpload(up.uploadId);
    meta = u.metadata;
    lastMeta = meta;
    state.pageCount = meta?.pageCount || 1;
    $('#file-hint').textContent = `${up.filename || 'Document'} · ${state.pageCount} page(s)`;
  } catch {
    $('#file-hint').textContent = up.filename || 'Document';
  }

  await loadMachines();
  wireControls();
  renderPageChips();
  renderWarnings(meta);
  $('#continue-btn').addEventListener('click', onContinue);
  recalc();

  // Lazy-mount the PDF preview (pdf.js loads on demand).
  mountDocPreview();
  trackFunnel('options_view');
}

main();
