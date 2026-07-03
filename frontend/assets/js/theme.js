// Print Karo frontend — dark/light theme with persistence + system preference.
import { CONFIG } from './config.js';
import { $ } from './utils.js';

const SUN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';

export function getTheme() {
  return (
    localStorage.getItem(CONFIG.KEYS.theme) ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('.theme-toggle');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? SUN : MOON;
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
  }
}

export function initTheme() {
  applyTheme(getTheme());
  const btn = $('.theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem(CONFIG.KEYS.theme, next);
      applyTheme(next);
    });
  }
}

// Apply immediately (before paint) to avoid a flash — call site loads this early.
document.documentElement.setAttribute('data-theme', getTheme());
