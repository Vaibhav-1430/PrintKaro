// Print Karo frontend — auth page (Name → Phone → OTP over the real session).
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { completePhoneAuth, currentUser } from './auth.js';
import { CONFIG } from './config.js';
import { $, $$, store } from './utils.js';

let draft = { name: '', phone: '' };

function show(step) {
  $('#step-phone').classList.toggle('hidden', step !== 'phone');
  $('#step-otp').classList.toggle('hidden', step !== 'otp');
  if (step === 'otp') {
    $('#otp-phone').textContent = '+91 ' + draft.phone;
    setTimeout(() => $('#otp-boxes input')?.focus(), 60);
  }
}

function wireOtpBoxes() {
  const inputs = $$('#otp-boxes input');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      inp.classList.toggle('filled', !!inp.value);
      if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
    });
    inp.addEventListener('paste', (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      digits.split('').forEach((d, j) => {
        if (inputs[j]) {
          inputs[j].value = d;
          inputs[j].classList.add('filled');
        }
      });
      inputs[Math.min(digits.length, inputs.length - 1)].focus();
    });
  });
}

function otpValue() {
  return $$('#otp-boxes input')
    .map((i) => i.value)
    .join('');
}

function returnToFlow() {
  const to = store.get(CONFIG.KEYS.returnTo) || CONFIG.ROUTES.dashboard;
  store.del(CONFIG.KEYS.returnTo);
  window.location.href = to;
}

function onSendOtp(e) {
  e.preventDefault();
  const name = $('#name').value.trim();
  const phone = $('#phone').value.replace(/\D/g, '');
  const err = $('#phone-err');
  if (phone.length !== 10) {
    err.textContent = 'Enter a valid 10-digit phone number.';
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  draft = { name, phone };
  store.set(CONFIG.KEYS.profile, draft);
  // Prefill display name from digits if empty.
  toast('Verification code sent', 'success', 2000);
  show('otp');
}

async function onVerifyOtp(e) {
  e.preventDefault();
  const err = $('#otp-err');
  const code = otpValue();
  if (code.length !== 6) {
    err.textContent = 'Enter all 6 digits.';
    err.classList.remove('hidden');
    return;
  }
  err.classList.add('hidden');
  const restore = loadingButton($('#verify-otp'), 'Verifying…');
  try {
    await completePhoneAuth(draft);
    toast('Verified — welcome!', 'success');
    returnToFlow();
  } catch (ex) {
    err.textContent = ex.message || 'Verification failed. Please try again.';
    err.classList.remove('hidden');
    restore();
  }
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();
  wireOtpBoxes();

  // Already signed in? Skip straight to where they were headed.
  const user = await currentUser();
  if (user) {
    returnToFlow();
    return;
  }

  const saved = store.get(CONFIG.KEYS.profile);
  if (saved) {
    $('#name').value = saved.name || '';
    $('#phone').value = saved.phone || '';
  }

  $('#step-phone').addEventListener('submit', onSendOtp);
  $('#step-otp').addEventListener('submit', onVerifyOtp);
  $('#edit-phone').addEventListener('click', () => show('phone'));
  $('#resend').addEventListener('click', () => toast('Code re-sent', 'info', 1800));

  show('phone');
}

main();
