// Print Karo frontend — runtime config.
// The API base can be overridden at deploy time by setting window.PK_API_BASE
// before this module loads (e.g. an inline <script> injected by the host).

export const CONFIG = {
  API_BASE: window.PK_API_BASE || 'https://printkaro-b9r0.onrender.com',
  // Better Auth is mounted under /api/auth on the same API server.
  AUTH_BASE: (window.PK_API_BASE || 'https://printkaro-b9r0.onrender.com') + '/api/auth',
  CURRENCY: '₹',
  MAX_UPLOAD_BYTES: 104_857_600, // 100 MB (mirrors backend default)
  ALLOWED_TYPES: ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg'],
  PIN_TTL_HOURS: 6,
  MACHINE_REFRESH_MS: 30_000, // live availability poll on the machines page
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
