// Print Karo frontend — accessibility helpers.
import { $, $$ } from './utils.js';

/** A single polite live region for status announcements (toasts, PIN, etc.). */
let liveRegion;
export function announce(message, assertive = false) {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    document.body.append(liveRegion);
  }
  liveRegion.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  // Clear then set so repeat messages re-announce.
  liveRegion.textContent = '';
  requestAnimationFrame(() => (liveRegion.textContent = message));
}

/**
 * Trap focus within `container` while `isOpen()` is true (menus, dropdowns).
 * Returns a cleanup fn. Esc calls onClose. Focus is restored to the opener.
 */
export function trapFocus(container, { onClose, opener } = {}) {
  const selector =
    'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  function onKey(e) {
    if (e.key === 'Escape') {
      onClose?.();
      opener?.focus();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = $$(selector, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}

/** Ensure a skip-to-content link exists and targets #main. */
export function ensureSkipLink() {
  if ($('.skip-link')) return;
  const link = document.createElement('a');
  link.className = 'skip-link';
  link.href = '#main';
  link.textContent = 'Skip to content';
  document.body.prepend(link);
}

/**
 * Roving-tabindex keyboard navigation for a grid/list of focusable items
 * (arrow keys move focus). `itemSelector` is queried inside `container`.
 */
export function rovingGrid(container, itemSelector) {
  if (!container) return;
  const getItems = () => $$(itemSelector, container);
  container.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = getItems();
    const idx = items.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(items.length - 1, idx + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    items[next]?.focus();
  });
}
