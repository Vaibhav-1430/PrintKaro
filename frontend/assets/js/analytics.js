// Print Karo frontend — privacy-first analytics. Third-party scripts load ONLY
// when an id is configured in CONFIG.ANALYTICS (empty by default → zero requests).
import { CONFIG } from './config.js';
import { loadScript } from './observers.js';

let ready = false;

export function initAnalytics() {
  if (ready) return;
  ready = true;
  const { ga, clarity } = CONFIG.ANALYTICS || {};

  if (ga) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ga, { anonymize_ip: true });
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${ga}`).catch(() => {});
  }

  if (clarity) {
    // Microsoft Clarity bootstrap.
    (function (c, l, a, r, i, t, y) {
      c[a] =
        c[a] ||
        function () {
          (c[a].q = c[a].q || []).push(arguments);
        };
      t = l.createElement(r);
      t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', clarity);
  }
}

/** Track a custom event (funnel/conversion). No-ops when analytics is off. */
export function track(event, props = {}) {
  try {
    if (window.gtag) window.gtag('event', event, props);
    if (window.clarity) window.clarity('event', event);
  } catch {
    /* never break the app for analytics */
  }
}

/** Convenience wrapper for the print funnel steps. */
export function trackFunnel(step, props = {}) {
  track('funnel_' + step, props);
}
