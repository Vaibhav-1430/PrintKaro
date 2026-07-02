// Print Karo frontend — advanced upload queue (multi-file/folder, retry/cancel/resume).
//
// Works with or without a session. Signed-in customers upload straight to
// storage (presigned PUT + server validation). Guests stay local: the file is
// validated, hashed and cached in IndexedDB, and the real upload happens right
// after phone verification (pay page orchestrator) — so nobody has to create
// an account before choosing their print.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast } from './ui.js';
import { renderStepper } from './stepper.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, el, store, sha256, guessMime, fileExt, formatBytes, escapeHtml } from './utils.js';
import { putFile, pruneExcept } from './filecache.js';
import { trackFunnel } from './analytics.js';
import { currentUser, verifySession } from './auth.js';

let seq = 0;
let authed = false; // resolved in main(); drives server vs local processing
const queue = new Map(); // id → item

function validateLocal(file) {
  if (!CONFIG.ALLOWED_TYPES.includes(fileExt(file.name)))
    return `Unsupported type — use ${CONFIG.ALLOWED_TYPES.join(', ')}.`;
  if (file.size <= 0) return 'File is empty.';
  if (file.size > CONFIG.MAX_UPLOAD_BYTES) return 'Larger than the 100 MB limit.';
  return null;
}

function rowMarkup(item) {
  return `
    <div class="file-ic">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
    </div>
    <div class="file-meta">
      <div class="file-name">${escapeHtml(item.file.name)}</div>
      <div class="file-sub" data-sub>${formatBytes(item.file.size)}</div>
      <div class="progress" style="margin-top:8px"><span data-bar></span></div>
    </div>
    <div class="file-actions" data-actions></div>`;
}

function renderActions(item) {
  const box = item.node.querySelector('[data-actions]');
  const status = item.node.querySelector('[data-sub]');
  const setStatus = (t) => (status.textContent = t);

  if (item.state === 'done') {
    box.innerHTML = `<span class="badge badge-success"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg> Ready</span>`;
    const m = item.result?.metadata;
    setStatus(
      m
        ? `${m.pageCount} page(s) · ${m.paperSize} · ${m.orientation}`
        : item.result?.local
          ? 'Ready — uploads securely at checkout'
          : 'Validated',
    );
  } else if (item.state === 'error') {
    box.innerHTML = `<button class="btn btn-outline" data-retry>Retry</button>`;
    box.querySelector('[data-retry]').onclick = () => startItem(item);
    setStatus(item.error || 'Failed');
  } else if (item.state === 'uploading') {
    box.innerHTML = `<button class="btn btn-ghost" data-cancel aria-label="Cancel">✕</button>`;
    box.querySelector('[data-cancel]').onclick = () => cancelItem(item);
  } else {
    box.innerHTML = `<button class="btn btn-ghost" data-remove aria-label="Remove">✕</button>`;
    box.querySelector('[data-remove]').onclick = () => removeItem(item);
  }
}

function setBar(item, pct) {
  const bar = item.node.querySelector('[data-bar]');
  if (bar) bar.style.width = pct + '%';
}

function addFiles(files) {
  const list = $('#file-list');
  for (const file of files) {
    const local = validateLocal(file);
    const id = ++seq;
    const item = {
      id,
      file,
      state: local ? 'error' : 'queued',
      error: local,
      result: null,
      aborted: false,
    };
    item.node = el('div', { class: 'file-row', html: rowMarkup(item) });
    list.append(item.node);
    queue.set(id, item);
    renderActions(item);
    if (!local) startItem(item);
  }
  refreshContinue();
}

/** Guest path: validate + hash locally, cache in IndexedDB, upload at checkout. */
async function processLocally(item) {
  const status = item.node.querySelector('[data-sub]');
  status.textContent = 'Preparing…';
  const hash = await sha256(item.file);
  if (item.aborted) return;
  setBar(item, 60);

  const localId = `local-${crypto.randomUUID()}`;
  await putFile(localId, item.file);
  setBar(item, 100);

  item.state = 'done';
  item.result = {
    id: localId,
    originalFilename: item.file.name,
    local: true,
    sha256: hash,
    metadata: null,
  };
  renderActions(item);
}

async function startItem(item) {
  if (item.state === 'uploading') return;
  item.state = 'uploading';
  item.aborted = false;
  item.error = null;
  renderActions(item);
  const status = item.node.querySelector('[data-sub]');
  try {
    setBar(item, 8);

    // No session yet → keep the file local; it uploads right after the
    // phone-OTP step. (Session re-verified uncached to avoid stale cookies.)
    if (!authed || !(await verifySession())) {
      authed = false;
      await processLocally(item);
      return;
    }

    status.textContent = 'Preparing…';
    const hash = await sha256(item.file);
    if (item.aborted) return;
    setBar(item, 22);

    const ticket = await api.requestUpload({
      filename: item.file.name,
      mimeType: guessMime(item.file),
      sizeBytes: item.file.size,
      sha256: hash,
    });
    if (item.aborted) return;
    setBar(item, 40);

    if (!ticket.duplicate) {
      status.textContent = 'Uploading…';
      await api.putToStorage(ticket.presignedPutUrl, item.file);
    }
    if (item.aborted) return;
    setBar(item, 70);

    status.textContent = 'Validating…';
    const result = await api.confirmUpload(ticket.uploadId, hash);
    if (item.aborted) return;
    setBar(item, 100);

    if (result.status === 'REJECTED') {
      item.state = 'error';
      item.error = result.rejectionReason || 'File rejected.';
      renderActions(item);
      toast(item.error, 'error');
      return;
    }

    item.state = 'done';
    item.result = result;
    // Cache the File so the options page can preview it (best-effort).
    putFile(result.id, item.file);
    renderActions(item);
  } catch (e) {
    if (item.aborted) return;
    item.state = 'error';
    item.error = e.message || 'Upload failed.';
    renderActions(item);
  } finally {
    refreshContinue();
  }
}

function cancelItem(item) {
  item.aborted = true;
  item.state = 'queued';
  setBar(item, 0);
  renderActions(item);
  item.node.querySelector('[data-sub]').textContent = 'Cancelled — ' + formatBytes(item.file.size);
  refreshContinue();
}

function removeItem(item) {
  queue.delete(item.id);
  item.node.remove();
  refreshContinue();
}

function doneItems() {
  return [...queue.values()].filter((i) => i.state === 'done');
}

function refreshContinue() {
  const done = doneItems();
  const cont = $('#continue-btn');
  const count = $('#queue-count');
  if (count) count.textContent = queue.size ? `${done.length} of ${queue.size} ready` : '';
  cont.classList.toggle('hidden', done.length === 0);
}

async function onContinue(e) {
  e.preventDefault();
  const done = doneItems();
  if (!done.length) return;
  // The order flow prints one document; use the first ready file. All validated
  // files remain in "Saved files" on the dashboard for later.
  const first = done[0].result;
  store.set(CONFIG.KEYS.upload, {
    uploadId: first.id,
    filename: first.originalFilename,
    local: first.local === true,
    sha256: first.sha256 || null,
  });
  await pruneExcept(first.id);
  trackFunnel('upload_done', { count: done.length, guest: first.local === true });
  window.location.href = CONFIG.ROUTES.options;
}

function wireDropzone() {
  const dz = $('#dropzone');
  const input = $('#file-input');
  const folderInput = $('#folder-input');

  dz.addEventListener('click', (e) => {
    if (!e.target.closest('[data-folder]')) input.click();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => input.files.length && addFiles([...input.files]));
  if (folderInput)
    folderInput.addEventListener(
      'change',
      () => folderInput.files.length && addFiles([...folderInput.files]),
    );
  const folderBtn = $('[data-folder]');
  if (folderBtn)
    folderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      folderInput?.click();
    });

  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
    }),
  );
  dz.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) addFiles(files);
  });
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();
  renderStepper('#stepper', 0);

  // Guests are welcome — files stay on-device until after phone verification.
  authed = (await currentUser()) !== null;

  wireDropzone();
  $('#continue-btn').addEventListener('click', onContinue);
  trackFunnel('upload_view', { guest: !authed });
}

main();
