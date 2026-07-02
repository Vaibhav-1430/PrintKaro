// Print Karo frontend — session helpers + route guard.
// Customers authenticate with phone + SMS OTP (Better Auth phoneNumber plugin):
// the API sets an HttpOnly session cookie once the code is verified, and every
// check here re-validates that cookie against /api/auth/get-session before
// trusting it. No passwords, no client-side auth state.
import { api, ApiError } from './api.js';
import { CONFIG } from './config.js';
import { store } from './utils.js';

let cachedUser;

/**
 * Returns the signed-in user, or null. Cached per page load.
 * The Better Auth session endpoint is the source of truth; the richer
 * /auth/me profile (adds phone/profile fields) is layered on top.
 */
export async function currentUser() {
  if (cachedUser !== undefined) return cachedUser;
  const session = await api.session();
  if (!session) {
    cachedUser = null;
    return null;
  }
  try {
    cachedUser = await api.me();
  } catch {
    cachedUser = session.user;
  }
  return cachedUser;
}

export async function isAuthed() {
  return (await currentUser()) !== null;
}

/** Fresh (uncached) session check — used to gate sensitive actions like uploads. */
export async function verifySession() {
  const session = await api.session();
  if (!session) cachedUser = null;
  return session ? session.user : null;
}

/** Redirect to the auth screen, remembering where to return. */
export function requireAuthRedirect(returnTo) {
  store.set(CONFIG.KEYS.returnTo, returnTo || window.location.pathname.split('/').pop());
  window.location.href = CONFIG.ROUTES.auth;
}

/** Guard a page: if not signed in, bounce to auth. Returns the user or null. */
export async function guardPage(returnTo) {
  const user = await currentUser();
  if (!user) {
    requireAuthRedirect(returnTo);
    return null;
  }
  return user;
}

export async function signOut() {
  await api.signOut();
  cachedUser = null;
}

/**
 * Normalise user phone input to E.164. Accepts "98765 43210", "098765...",
 * "+91 98765-43210" etc. Bare 10-digit numbers are treated as Indian (+91).
 * Returns null when the input can't be a valid number.
 */
export function normalizePhone(raw) {
  const cleaned = String(raw || '').replace(/[\s\-().]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/^0+/, '');
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  return null;
}

/** Ask the API to text a one-time code to this phone (E.164). */
export function requestOtp(phoneNumber) {
  return api.sendPhoneOtp(phoneNumber);
}

/**
 * Verify the OTP. On success Better Auth creates the account (first time) or
 * signs the customer in, and sets the session cookie — which we confirm before
 * returning. New accounts get the phone number as a placeholder name, so we
 * write the real name (collected pre-OTP) right after the session lands.
 */
export async function verifyOtp(phoneNumber, code, name) {
  await api.verifyPhoneOtp(phoneNumber, code);
  const user = await confirmSessionEstablished();

  const trimmed = (name || '').trim();
  const placeholder = !user.name || user.name === phoneNumber || /^\+?\d+$/.test(user.name);
  if (trimmed && (placeholder || trimmed !== user.name)) {
    try {
      await api.updateProfile({ name: trimmed });
      cachedUser = undefined; // refresh with the real name
    } catch {
      /* non-fatal: profile name can be set later from the dashboard */
    }
  }
  return currentUser();
}

async function confirmSessionEstablished() {
  cachedUser = undefined; // invalidate cache
  const user = await verifySession();
  if (!user) {
    throw new ApiError(
      'Verified, but no session was established. Check that cookies are allowed for this site.',
      401,
    );
  }
  return currentUser();
}
