// Print Karo frontend — small dependency-free helpers.
import { CONFIG } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element with attrs + children. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function')
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Integer paise → "₹12.50". */
export function formatPaise(paise) {
  return CONFIG.CURRENCY + (Number(paise || 0) / 100).toFixed(2);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** SHA-256 hex of a File/Blob via WebCrypto (used for upload dedupe). */
export async function sha256(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Trailing+leading throttle: runs at most once per `ms`. */
export function throttle(fn, ms = 200) {
  let last = 0;
  let timer;
  return (...args) => {
    const now = Date.now();
    const run = () => {
      last = now;
      fn(...args);
    };
    clearTimeout(timer);
    if (now - last >= ms) run();
    else timer = setTimeout(run, ms - (now - last));
  };
}

/** Run when the browser is idle (falls back to setTimeout). */
export function onIdle(fn, timeout = 2000) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 1);
}

/** Escape untrusted text before inserting into innerHTML (XSS-safe). */
export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Human "2 min ago" / "just now" relative time from an ISO string. */
export function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** mm:ss / h:mm:ss remaining until `iso`. Returns { text, expired, ms }. */
export function remaining(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'Expired', expired: true, ms: 0 };
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const text = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  return { text, expired: false, ms };
}

export function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

export function guessMime(file) {
  if (file.type) return file.type;
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[fileExt(file.name)] || 'application/octet-stream';
}

/** Simple sessionStorage JSON helpers. */
export const store = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, val) {
    sessionStorage.setItem(key, JSON.stringify(val));
  },
  del(key) {
    sessionStorage.removeItem(key);
  },
};

export function goto(page, params = {}) {
  const q = new URLSearchParams(params).toString();
  window.location.href = page + (q ? `?${q}` : '');
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
