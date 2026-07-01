// Print Karo frontend — session helpers + route guard.
// The premium "Name → Phone → OTP" screen (auth.js page controller lives inline
// in auth.html's module) ultimately establishes a real session via the existing
// Better Auth email/password endpoints — no backend change. Phone/name are saved
// to the profile. There is no server OTP endpoint (documented in the README), so
// the OTP step is a UX layer over the real login.
import { api, ApiError } from './api.js';
import { CONFIG } from './config.js';
import { store } from './utils.js';

let cachedUser;

/** Returns the signed-in user, or null. Cached per page load. */
export async function currentUser() {
  if (cachedUser !== undefined) return cachedUser;
  try {
    cachedUser = await api.me();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) cachedUser = null;
    else cachedUser = null;
  }
  return cachedUser;
}

export async function isAuthed() {
  return (await currentUser()) !== null;
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
 * Establish a session for a phone-first flow. Because the backend auth is
 * email/password, we derive a deterministic credential from the phone number so
 * the same phone always maps to the same account (link "previous orders via
 * verified phone" — same account = same orders). Tries sign-in, falls back to
 * sign-up. Then stores the display name + phone on the profile.
 */
export async function completePhoneAuth({ name, phone }) {
  const digits = String(phone).replace(/\D/g, '');
  const email = `pk_${digits}@phone.printkaro.local`;
  const password = `PK-${digits}-verified`;

  try {
    await api.signIn(email, password);
  } catch {
    // First time for this phone → create the account.
    await api.signUp(name || `PK ${digits.slice(-4)}`, email, password);
    // Some Better Auth configs require a follow-up sign-in to set the cookie.
    await api.signIn(email, password).catch(() => undefined);
  }

  // Persist the human-friendly profile fields (best-effort).
  await api.updateProfile({ name: name || undefined, phone: digits || undefined }).catch(() => undefined);
  cachedUser = undefined; // invalidate cache
  return currentUser();
}
