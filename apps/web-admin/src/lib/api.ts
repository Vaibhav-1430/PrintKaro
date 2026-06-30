import type {
  ActivePinResponse,
  ApiResponse,
  AuthUser,
  MachineRegistrationResult,
  MachineSummary,
  OrderListItem,
  OrderResponse,
  PaymentResponse,
  PricingRuleInput,
  PricingRuleResponse,
  RegisterMachineInput,
  RevenueSummary,
} from '@print-karo/types';
import { env } from './env';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new Error(json.error.message || 'Request failed');
  return json.data;
}

export const api = {
  me: () => apiFetch<AuthUser>('/auth/me'),
  createAdmin: (body: { email: string; name: string; password: string }) =>
    apiFetch<{ id: string; email: string }>('/admin/create', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createOperator: (body: {
    email: string;
    name: string;
    password: string;
    businessName: string;
    contactPhone?: string;
  }) =>
    apiFetch<{ id: string; email: string }>('/operator/create', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ── Machines ──────────────────────────────────────────────────────
  listMachines: () => apiFetch<MachineSummary[]>('/admin/machines'),
  machineDetail: (id: string) => apiFetch<MachineDetail>(`/admin/machines/${id}`),
  registerMachine: (body: RegisterMachineInput) =>
    apiFetch<MachineRegistrationResult>('/admin/machines', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  suspendMachine: (id: string, reason?: string) =>
    apiFetch<{ status: string }>(`/admin/machines/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  reactivateMachine: (id: string) =>
    apiFetch<{ status: string }>(`/admin/machines/${id}/reactivate`, { method: 'POST' }),
  restartMachine: (id: string) =>
    apiFetch<{ requested: boolean }>(`/admin/machines/${id}/restart`, { method: 'POST' }),

  // ── Orders / revenue / PINs / refunds (Sprint 4) ──────────────────
  listOrders: () => apiFetch<OrderListItem[]>('/admin/orders'),
  getOrder: (id: string) => apiFetch<OrderResponse>(`/admin/orders/${id}`),
  revenue: () => apiFetch<RevenueSummary>('/admin/revenue'),
  activePins: () => apiFetch<ActivePinResponse[]>('/admin/pins/active'),
  refund: (paymentId: string, reason?: string) =>
    apiFetch<PaymentResponse>(`/admin/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // ── Pricing rules (super admin) ───────────────────────────────────
  pricingRules: () => apiFetch<PricingRuleResponse[]>('/admin/pricing/rules'),
  upsertPricingRule: (body: PricingRuleInput) =>
    apiFetch<PricingRuleResponse>('/admin/pricing/rules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export interface MachineDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  location: {
    college: string | null;
    building: string | null;
    floor: string | null;
    room: string | null;
  };
  operator: { name: string | null; email: string | null } | null;
  printer: { printerName: string | null; state: string } | null;
  health: { healthScore: number; gateResult: string; runtimeState: string } | null;
  online: boolean;
  lastHeartbeatAt: string | null;
}
