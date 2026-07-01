// Print Karo frontend — typed-ish REST client over the existing NestJS API.
// Sessions are HttpOnly cookies, so every call uses credentials:'include'.
// The API wraps responses in { success, data } | { success:false, error }.
import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, base = CONFIG.API_BASE, raw = false } = {}) {
  const res = await fetch(base + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) return res; // caller handles (e.g. Better Auth, presigned)

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok || (json && json.success === false)) {
    const msg = (json && json.error && json.error.message) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return json ? json.data : null;
}

export const api = {
  // ---- Auth (Better Auth handler under /api/auth) ----
  async signIn(email, password) {
    const res = await fetch(`${CONFIG.AUTH_BASE}/sign-in/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new ApiError((j && (j.message || j.error)) || 'Sign in failed', res.status);
    }
    return res.json().catch(() => ({}));
  },
  async signUp(name, email, password) {
    const res = await fetch(`${CONFIG.AUTH_BASE}/sign-up/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new ApiError((j && (j.message || j.error)) || 'Sign up failed', res.status);
    }
    return res.json().catch(() => ({}));
  },
  signOut() {
    return fetch(`${CONFIG.AUTH_BASE}/sign-out`, { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
  },

  // ---- Custom auth/profile controller ----
  me: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/profile', { method: 'PATCH', body }),
  sessions: () => request('/auth/sessions'),

  // ---- Uploads ----
  requestUpload: (body) => request('/uploads/request', { method: 'POST', body }),
  confirmUpload: (id, sha256) =>
    request(`/uploads/${id}/confirm`, { method: 'POST', body: { sha256 } }),
  getUpload: (id) => request(`/uploads/${id}`),
  listUploads: () => request('/uploads'),

  // ---- Pricing ----
  calculatePrice: (body) => request('/pricing/calculate', { method: 'POST', body }),

  // ---- Orders ----
  createOrder: (body) => request('/orders', { method: 'POST', body }),
  setOrderOptions: (id, body) => request(`/orders/${id}/options`, { method: 'POST', body }),
  verifyMachine: (id) => request(`/orders/${id}/verify-machine`, { method: 'POST' }),
  getOrder: (id) => request(`/orders/${id}`),
  listOrders: () => request('/orders'),
  cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),

  // ---- Payment (demo) ----
  initiatePayment: (orderId) =>
    request(`/payments/${orderId}/initiate`, { method: 'POST', body: {} }),
  simulatePayment: (orderId, outcome) =>
    request(`/payments/${orderId}/simulate`, { method: 'POST', body: { outcome } }),
  getPayment: (orderId) => request(`/payments/${orderId}`),

  // ---- Notifications ----
  notifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),

  // ---- Machines (best-effort: customers lack machine:view:assigned → 403) ----
  async machines() {
    try {
      return await request('/admin/machines');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
      throw e;
    }
  },

  // ---- Direct presigned upload to storage (bytes never touch the API) ----
  async putToStorage(url, file) {
    // Fake storage in dev returns an unreachable URL; tolerate failure silently.
    try {
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      });
    } catch {
      /* dev fake-storage: the API confirm step succeeds regardless */
    }
  },
};
