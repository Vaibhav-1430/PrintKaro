// Print Karo frontend — runtime config.
// The API base can be overridden at deploy time by setting window.PK_API_BASE
// before this module loads (e.g. an inline <script> injected by the host).

export const CONFIG = {
  API_BASE: window.PK_API_BASE || 'http://localhost:4000',
  // Better Auth is mounted under /api/auth on the same API server.
  AUTH_BASE: (window.PK_API_BASE || 'http://localhost:4000') + '/api/auth',
  CURRENCY: '₹',
  MAX_UPLOAD_BYTES: 104_857_600, // 100 MB (mirrors backend default)
  ALLOWED_TYPES: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg'],
  PIN_TTL_HOURS: 6,

  // Canonical site origin (for SEO canonical/OG URLs + sitemap).
  SITE_URL: window.PK_SITE_URL || 'https://printkaro.app',

  // Object storage origin (for CSP connect-src on presigned PUT/GET). '*' allows any
  // https origin for dev fake-storage; tighten to your R2 host in production.
  STORAGE_ORIGIN: window.PK_STORAGE_ORIGIN || 'https://*.r2.cloudflarestorage.com',

  // Analytics — third-party scripts load ONLY when an id is set here (empty = off).
  ANALYTICS: {
    ga: window.PK_GA_ID || '', // e.g. 'G-XXXXXXX'
    clarity: window.PK_CLARITY_ID || '', // e.g. 'abcdefghij'
  },

  // Machine dashboard refresh + notification poll cadence (ms).
  MACHINE_REFRESH_MS: 20_000,
  NOTIFY_POLL_MS: 15_000,
  // Where to send the user after a successful sign-in during the flow.
  ROUTES: {
    home: 'index.html',
    upload: 'upload.html',
    options: 'options.html',
    auth: 'auth.html',
    pay: 'pay.html',
    success: 'success.html',
    dashboard: 'dashboard.html',
    profile: 'profile.html',
  },
  // Keys used in sessionStorage/localStorage to carry flow state between pages.
  KEYS: {
    theme: 'pk_theme',
    order: 'pk_active_order', // { orderId } for the current flow
    upload: 'pk_active_upload', // { uploadId } picked for the order
    profile: 'pk_profile_draft', // { name, phone } captured pre-auth
    returnTo: 'pk_return_to',
  },
};
