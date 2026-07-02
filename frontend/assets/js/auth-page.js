// Print Karo frontend — auth page (phone + SMS OTP, Better Auth phoneNumber plugin).
// Step 1: name + phone → the API texts a one-time code.
// Step 2: 6-digit code → verified server-side; the HttpOnly session cookie is
// set by the API, confirmed via get-session, then the user rejoins the flow.
// First-time numbers become accounts automatically — no sign-up form.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { currentUser, normalizePhone, requestOtp, verifyOtp } from './auth.js';
import { CONFIG } from './config.js';
import { $, store } from './utils.js';

const RESEND_COOLDOWN_SEC = 30;

const state = { phone: null, name: '', resendTimer: null };

function showError(id, msg) {
  const err = $(id);
  err.textContent = msg;
  err.classList.remove('hidden');
}

function hideErrors() {
  $('#phone-err').classList.add('hidden');
  $('#otp-err').classList.add('hidden');
}

function returnToFlow() {
  const to = store.get(CONFIG.KEYS.returnTo) || CONFIG.ROUTES.dashboard;
  store.del(CONFIG.KEYS.returnTo);
  window.location.href = to;
}

function maskedPhone(phone) {
  return phone.replace(/^(\+\d{2})\d+(\d{4})$/, '$1 ••••• $2');
}

function startResendCooldown() {
  const btn = $('#resend-otp');
  let left = RESEND_COOLDOWN_SEC;
  btn.disabled = true;
  btn.textContent = `Resend in ${left}s`;
  clearInterval(state.resendTimer);
  state.resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(state.resendTimer);
      btn.disabled = false;
      btn.textContent = 'Resend code';
      return;
    }
    btn.textContent = `Resend in ${left}s`;
  }, 1000);
}

function showOtpStep() {
  $('#phone-form').classList.add('hidden');
  $('#otp-form').classList.remove('hidden');
  $('#auth-title').textContent = 'Check your messages';
  $('#auth-sub').textContent = 'Enter the code to continue.';
  $('#otp-sent-to').textContent = `Code sent to ${maskedPhone(state.phone)}.`;
  $('#otp').value = '';
  $('#otp').focus();
  startResendCooldown();
}

function showPhoneStep() {
  clearInterval(state.resendTimer);
  $('#otp-form').classList.add('hidden');
  $('#phone-form').classList.remove('hidden');
  $('#auth-title').textContent = 'Continue with your phone';
  $('#auth-sub').textContent = 'We’ll text you a one-time code — no password, no sign-up forms.';
  $('#phone').focus();
}

async function onSendOtp(e) {
  e.preventDefault();
  hideErrors();

  state.name = $('#name').value.trim();
  const phone = normalizePhone($('#phone').value);
  if (!phone) {
    showError('#phone-err', 'Enter a valid mobile number (10 digits, or with country code).');
    return;
  }
  state.phone = phone;
  // Remember the draft so the rest of the flow (and a return visit) can prefill.
  store.set(CONFIG.KEYS.profile, { name: state.name, phone });

  const restore = loadingButton($('#send-otp'), 'Sending…');
  try {
    await requestOtp(phone);
    toast('Code sent', 'success');
    showOtpStep();
  } catch (ex) {
    showError('#phone-err', ex.message || 'Could not send the code. Please try again.');
  } finally {
    restore();
  }
}

async function onVerifyOtp(e) {
  e.preventDefault();
  hideErrors();

  const code = $('#otp').value.replace(/\D/g, '');
  if (code.length !== 6) {
    showError('#otp-err', 'Enter the 6-digit code from the SMS.');
    return;
  }

  const restore = loadingButton($('#verify-otp'), 'Verifying…');
  try {
    await verifyOtp(state.phone, code, state.name);
    toast('You’re in!', 'success');
    returnToFlow();
  } catch (ex) {
    showError('#otp-err', ex.message || 'That code didn’t match. Please try again.');
    restore();
  }
}

async function onResend() {
  hideErrors();
  const btn = $('#resend-otp');
  btn.disabled = true;
  try {
    await requestOtp(state.phone);
    toast('New code sent', 'success');
    startResendCooldown();
  } catch (ex) {
    showError('#otp-err', ex.message || 'Could not resend the code.');
    btn.disabled = false;
  }
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();

  // Already signed in (valid server-side session)? Skip straight ahead.
  const user = await currentUser();
  if (user) {
    returnToFlow();
    return;
  }

  const saved = store.get(CONFIG.KEYS.profile);
  if (saved && saved.name) $('#name').value = saved.name;
  if (saved && saved.phone) $('#phone').value = saved.phone;

  $('#phone-form').addEventListener('submit', onSendOtp);
  $('#otp-form').addEventListener('submit', onVerifyOtp);
  $('#change-number').addEventListener('click', showPhoneStep);
  $('#resend-otp').addEventListener('click', onResend);

  // Auto-submit when 6 digits are typed/pasted (mobile OTP autofill).
  $('#otp').addEventListener('input', () => {
    const digits = $('#otp').value.replace(/\D/g, '');
    if (digits.length === 6) $('#otp-form').requestSubmit();
  });
}

main();
