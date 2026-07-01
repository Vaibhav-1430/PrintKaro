// Print Karo frontend — UI primitives: toasts, ripple, copy, button loading.
import { $, el } from './utils.js';

let toastWrap;
function ensureToastWrap() {
  if (!toastWrap) {
    toastWrap = el('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  return toastWrap;
}

const ICONS = {
  success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:var(--success)"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:var(--danger)"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="color:var(--brand-500)"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
};

export function toast(message, type = 'info', ms = 3800) {
  const wrap = ensureToastWrap();
  const node = el('div', { class: `toast toast-${type}`, html: ICONS[type] || ICONS.info });
  node.append(el('span', { text: message }));
  wrap.append(node);
  const close = () => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 300);
  };
  const timer = setTimeout(close, ms);
  node.addEventListener('click', () => {
    clearTimeout(timer);
    close();
  });
  return close;
}

/** Attach a click ripple to all .btn (idempotent). */
export function initRipples(root = document) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || btn.disabled) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = el('span', { class: 'ripple' });
    span.style.width = span.style.height = size + 'px';
    span.style.left = e.clientX - rect.left - size / 2 + 'px';
    span.style.top = e.clientY - rect.top - size / 2 + 'px';
    btn.append(span);
    setTimeout(() => span.remove(), 600);
  });
}

/** Toggle a spinner + disabled state on a button. Returns a restore fn. */
export function loadingButton(btn, label = 'Working…') {
  if (!btn) return () => {};
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${label}`;
  return () => {
    btn.disabled = false;
    btn.innerHTML = original;
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'success', 1800);
    return true;
  } catch {
    toast('Could not copy', 'error');
    return false;
  }
}

export function skeleton(count = 3) {
  const wrap = el('div', { class: 'stack' });
  for (let i = 0; i < count; i++) wrap.append(el('div', { class: 'skeleton sk-block' }));
  return wrap;
}

/** Mobile nav toggle wiring. */
export function initNav() {
  const nav = $('.nav');
  const links = $('.nav-links');
  const toggle = $('.nav-toggle');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      const open = links.classList.contains('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') links.classList.remove('open');
    });
  }
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
}
