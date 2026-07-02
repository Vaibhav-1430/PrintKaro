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

/** POST to a Better Auth endpoint, throwing a friendly ApiError on failure. */
async function authPost(path, body, fallbackMessage) {
  const res = await fetch(`${CONFIG.AUTH_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    const msg =
      (j && (j.message || (j.error && j.error.message))) ||
      (res.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : null) ||
      fallbackMessage;
    throw new ApiError(msg, res.status);
  }
  return res.json().catch(() => ({}));
}

export const api = {
  // ---- Auth (Better Auth phone OTP under /api/auth) ----
  /** Send a one-time code to the phone (E.164, e.g. +919876543210). */
  sendPhoneOtp(phoneNumber) {
    return authPost('/phone-number/send-otp', { phoneNumber }, 'Could not send the code.');
  },
  /** Verify the code. On success the API sets the HttpOnly session cookie. */
  verifyPhoneOtp(phoneNumber, code) {
    return authPost(
      '/phone-number/verify',
      { phoneNumber, code },
      'That code didn’t match. Please try again.',
    );
  },
  signOut() {
    return fetch(`${CONFIG.AUTH_BASE}/sign-out`, { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
  },
  /**
   * Better Auth session check (GET /api/auth/get-session). Returns
   * { session, user } when a valid session cookie is present, else null —
   * the endpoint responds 200 with a null body when signed out.
   */
  async session() {
    try {
      const res = await fetch(`${CONFIG.AUTH_BASE}/get-session`, { credentials: 'include' });
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      return j && j.user ? j : null;
    } catch {
      return null;
    }
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

  // ---- Machines (public directory: name, location, live availability) ----
  machines: () => request('/machine/directory'),

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
