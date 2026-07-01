/* Print Karo — service worker.
   Strategy:
     • App shell (HTML/CSS/JS/icons/manifest): cache-first, updated in background.
     • Everything else same-origin static: stale-while-revalidate.
     • API / auth / cross-origin / credentialed requests: NETWORK-ONLY, never cached
       (cookie sessions + live data must never be served stale).
     • Navigation requests that fail offline → offline.html.
*/
const VERSION = 'pk-v1.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  'index.html',
  'upload.html',
  'options.html',
  'auth.html',
  'pay.html',
  'success.html',
  'dashboard.html',
  'profile.html',
  'pricing.html',
  'machines.html',
  'how-it-works.html',
  'about.html',
  'contact.html',
  'faq.html',
  '404.html',
  'offline.html',
  'manifest.webmanifest',
  'assets/css/tokens.css',
  'assets/css/base.css',
  'assets/css/components.css',
  'assets/css/animations.css',
  'assets/css/landing.css',
  'assets/css/app.css',
  'assets/js/config.js',
  'assets/js/utils.js',
  'assets/js/api.js',
  'assets/js/ui.js',
  'assets/js/theme.js',
  'assets/js/partials.js',
  'assets/js/animations.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // addAll is atomic; use individual puts so one 404 doesn't abort install.
      .then((cache) => Promise.all(SHELL_ASSETS.map((a) => cache.add(a).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiOrAuth(url) {
  return url.pathname.startsWith('/api') || url.pathname.startsWith('/auth');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Network-only for API/auth/cross-origin/credentialed — protect live data + sessions.
  if (!sameOrigin || isApiOrAuth(url) || request.credentials === 'include') {
    return; // let the browser handle it (default network)
  }

  // Navigations: try network, fall back to cache, then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(RUNTIME).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('offline.html'))),
    );
    return;
  }

  // Static shell asset: cache-first, revalidate in background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
