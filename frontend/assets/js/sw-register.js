// Print Karo frontend — service worker registration + PWA install + reconnect.
import { toast } from './ui.js';
import { announce } from './a11y.js';

export function initPWA() {
  registerSW();
  wireInstallPrompt();
  wireConnectivity();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* SW is an enhancement; ignore registration failures (e.g. file://) */
    });
  });
}

let deferredPrompt = null;
function wireInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Reveal any opt-in install buttons on the page.
    document.querySelectorAll('[data-install]').forEach((btn) => {
      btn.classList.remove('hidden');
      btn.addEventListener('click', promptInstall, { once: false });
    });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('Print Karo installed', 'success');
  });
}

async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch(() => {});
  deferredPrompt = null;
}

function wireConnectivity() {
  let wasOffline = !navigator.onLine;
  window.addEventListener('offline', () => {
    wasOffline = true;
    toast('You are offline — some features are paused.', 'error', 5000);
    announce('You are offline', true);
    document.documentElement.classList.add('is-offline');
  });
  window.addEventListener('online', () => {
    document.documentElement.classList.remove('is-offline');
    if (wasOffline) {
      wasOffline = false;
      toast('Back online', 'success', 2500);
      announce('Back online');
    }
  });
}
