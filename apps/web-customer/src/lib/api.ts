import type {
  ApiResponse,
  AuthUser,
  CalculatePriceInput,
  CreateOrderInput,
  MachineSummary,
  OrderListItem,
  OrderResponse,
  PaymentResponse,
  PaymentResult,
  PriceBreakdown,
  PrintOptionInput,
  RequestUploadInput,
  SessionInfo,
  UploadResponse,
  UploadTicketResponse,
} from '@print-karo/types';
import { env } from './env';

export interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  orderId: string | null;
  createdAt: string;
}

/** Typed fetch wrapper for the NestJS custom auth endpoints (envelope-aware). */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error.message || 'Request failed');
  }
  return json.data;
}

export const api = {
  me: () => apiFetch<AuthUser & { phone?: string | null }>('/auth/me'),
  updateProfile: (body: { name?: string; phone?: string; defaultCity?: string }) =>
    apiFetch<AuthUser>('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  sessions: () => apiFetch<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) =>
    apiFetch<{ revoked: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  logoutAll: () => apiFetch<{ revoked: number }>('/auth/logout-all', { method: 'DELETE' }),

  // ── Machines (for selection) ──────────────────────────────────────
  machines: () => apiFetch<MachineSummary[]>('/admin/machines'),

  // ── Uploads ───────────────────────────────────────────────────────
  requestUpload: (body: RequestUploadInput) =>
    apiFetch<UploadTicketResponse>('/uploads/request', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  confirmUpload: (id: string, sha256?: string) =>
    apiFetch<UploadResponse>(`/uploads/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ sha256 }),
    }),
  getUpload: (id: string) => apiFetch<UploadResponse>(`/uploads/${id}`),
  listUploads: () => apiFetch<UploadResponse[]>('/uploads'),

  // ── Pricing ───────────────────────────────────────────────────────
  calculatePrice: (body: CalculatePriceInput) =>
    apiFetch<PriceBreakdown>('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Orders ────────────────────────────────────────────────────────
  createOrder: (body: CreateOrderInput) =>
    apiFetch<OrderResponse>('/orders', { method: 'POST', body: JSON.stringify(body) }),
  setOrderOptions: (id: string, body: PrintOptionInput) =>
    apiFetch<OrderResponse>(`/orders/${id}/options`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  verifyMachine: (id: string) =>
    apiFetch<OrderResponse>(`/orders/${id}/verify-machine`, { method: 'POST' }),
  getOrder: (id: string) => apiFetch<OrderResponse>(`/orders/${id}`),
  listOrders: () => apiFetch<OrderListItem[]>('/orders'),
  cancelOrder: (id: string) => apiFetch<OrderResponse>(`/orders/${id}/cancel`, { method: 'POST' }),

  // ── Payment (demo) ────────────────────────────────────────────────
  initiatePayment: (orderId: string) =>
    apiFetch<PaymentResponse>(`/payments/${orderId}/initiate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  simulatePayment: (orderId: string, outcome: PaymentResult) =>
    apiFetch<PaymentResponse>(`/payments/${orderId}/simulate`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    }),
  getPayment: (orderId: string) => apiFetch<PaymentResponse | null>(`/payments/${orderId}`),

  // ── Notifications ─────────────────────────────────────────────────
  notifications: () => apiFetch<CustomerNotification[]>('/notifications'),
};
