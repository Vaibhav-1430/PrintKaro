// Print Karo frontend — pay orchestrator: materialize any deferred guest upload
// (post-auth) → create order → verify machine (health gate) → initiate +
// simulate payment → success.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { renderStepper } from './stepper.js';
import { api, ApiError } from './api.js';
import { CONFIG } from './config.js';
import { $, store, goto, formatPaise, sha256, guessMime } from './utils.js';
import { guardPage } from './auth.js';
import { getFile, putFile, pruneExcept } from './filecache.js';

let order = null;

function fatal(msg, backHref = CONFIG.ROUTES.upload, backLabel = 'Start over') {
  $('#pay-loading').classList.add('hidden');
  $('#pay-body').classList.add('hidden');
  const box = $('#pay-fatal');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="card empty">
      <div style="font-size:44px;margin-bottom:8px">⚠️</div>
      <h3 style="margin-bottom:8px">${msg}</h3>
      <a class="btn btn-primary" href="${backHref}">${backLabel}</a>
    </div>`;
}

async function loadMachinePicker(draft) {
  const list = await api.machines().catch(() => null);
  const picker = $('#machine-picker');
  const sel = $('#pay-machine');
  if (!Array.isArray(list) || !list.length) {
    // Can't list machines — cannot proceed without one. Send back to options.
    fatal('Please choose a machine first.', CONFIG.ROUTES.options, 'Back to options');
    return null;
  }
  sel.innerHTML =
    '<option value="">Select a machine…</option>' +
    list
      .map((m) => {
        const ok = m.online && m.gateResult !== 'BLOCKED';
        return `<option value="${m.id}" ${ok ? '' : 'disabled'}>${m.name} (${m.code}) — ${m.online ? m.gateResult : 'offline'}</option>`;
      })
      .join('');
  const ready = list.find((m) => m.online && m.gateResult === 'READY');
  if (ready) sel.value = ready.id;
  picker.classList.remove('hidden');
  $('#pay-loading').classList.add('hidden');

  return new Promise((resolve) => {
    $('#confirm-machine').addEventListener('click', () => {
      if (!sel.value) {
        toast('Pick a machine', 'info');
        return;
      }
      picker.classList.add('hidden');
      $('#pay-loading').classList.remove('hidden');
      resolve(sel.value);
    });
  });
}

/**
 * Guest flow: the file was validated and cached on-device before sign-in.
 * Now that the session exists, perform the real upload (presigned PUT +
 * server validation) and swap the local id for the server upload id.
 */
async function materializeUpload(saved) {
  if (!saved.uploadId || !String(saved.uploadId).startsWith('local-')) return saved;

  $('#pay-status') && ($('#pay-status').textContent = 'Uploading your file…');
  const file = await getFile(saved.uploadId);
  if (!file) {
    fatal('Your file is no longer on this device. Please upload it again.');
    return null;
  }

  const hash = await sha256(file);
  const ticket = await api.requestUpload({
    filename: file.name,
    mimeType: guessMime(file),
    sizeBytes: file.size,
    sha256: hash,
  });
  if (!ticket.duplicate) {
    await api.putToStorage(ticket.presignedPutUrl, file);
  }
  const result = await api.confirmUpload(ticket.uploadId, hash);
  if (result.status === 'REJECTED') {
    fatal(result.rejectionReason || 'That file was rejected. Please try another.');
    return null;
  }

  // Re-key the cached blob + stored flow state to the server id.
  await putFile(result.id, file);
  await pruneExcept(result.id);
  const next = { ...saved, uploadId: result.id };
  store.set(CONFIG.KEYS.order, next);
  const up = store.get(CONFIG.KEYS.upload);
  if (up) store.set(CONFIG.KEYS.upload, { ...up, uploadId: result.id, local: false });
  return next;
}

/** Create the order from the stored draft (idempotent within a page load). */
async function ensureOrder() {
  let saved = store.get(CONFIG.KEYS.order);
  if (!saved) {
    fatal('Your session expired. Please start again.');
    return null;
  }

  // Already created (draft:false) → reuse.
  if (saved.orderId) {
    order = await api.getOrder(saved.orderId).catch(() => null);
    if (order) return order;
  }

  saved = await materializeUpload(saved);
  if (!saved) return null;

  let machineId = saved.machineId;
  if (!machineId) {
    machineId = await loadMachinePicker(saved);
    if (!machineId) return null;
  }

  // Create order → set options → verify machine (health gate).
  const created = await api.createOrder({ uploadId: saved.uploadId, machineId });
  await api.setOrderOptions(created.id, saved.options);
  try {
    await api.verifyMachine(created.id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      fatal(
        e.message || 'That machine is not ready right now.',
        CONFIG.ROUTES.options,
        'Pick another machine',
      );
      return null;
    }
    throw e;
  }

  order = await api.getOrder(created.id);
  store.set(CONFIG.KEYS.order, { orderId: order.id });
  // Kick off the payment intent.
  await api.initiatePayment(order.id).catch(() => undefined);
  return order;
}

function renderPay() {
  $('#pay-loading').classList.add('hidden');
  $('#pay-body').classList.remove('hidden');
  $('#pay-amount').textContent = formatPaise(order.amountPaise);
  $('#pay-order').textContent = 'Order ' + order.orderNumber;

  $('#pay-now').addEventListener('click', () => pay($('#pay-now')));
}

// Realistic gateway-style progression shown while the demo charge settles.
const PAY_STAGES = ['Contacting gateway…', 'Authorising…', 'Confirming payment…'];

/**
 * Demo payment: one button, always succeeds. We still call the real
 * initiate → charge endpoints (with a SUCCESS outcome) so the order is marked
 * PAID and the PIN is minted server-side — a Razorpay adapter later replaces
 * the simulator behind the same API with no change here.
 */
async function pay(btn) {
  const err = $('#pay-error');
  err.innerHTML = '';
  const restore = loadingButton(btn, PAY_STAGES[0]);

  // Cycle the label so the wait reads like a real gateway round-trip.
  // loadingButton renders `<span class="spinner"></span>{label}`, so we swap the
  // trailing text node (the spinner stays put).
  let stage = 0;
  const ticker = setInterval(() => {
    stage = Math.min(stage + 1, PAY_STAGES.length - 1);
    const text = btn.lastChild;
    if (text && text.nodeType === Node.TEXT_NODE) text.textContent = PAY_STAGES[stage];
  }, 850);

  try {
    await api.initiatePayment(order.id).catch(() => undefined);
    const payment = await api.simulatePayment(order.id, 'SUCCESS');
    clearInterval(ticker);
    if (payment.status === 'SUCCEEDED') {
      toast('Payment successful', 'success');
      goto(CONFIG.ROUTES.success, { order: order.id });
      return;
    }
    // Should not happen with the demo gateway, but never leave a blank screen.
    err.innerHTML = `<div class="card" style="border-color:var(--danger)"><b>Payment could not be confirmed.</b> Please try again.</div>`;
    restore();
  } catch (e) {
    clearInterval(ticker);
    err.innerHTML = `<div class="field-error">${e.message || 'Payment failed. Please try again.'}</div>`;
    restore();
  }
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();
  renderStepper('#stepper', 3);

  const user = await guardPage(CONFIG.ROUTES.pay);
  if (!user) return; // redirected to auth

  try {
    const ok = await ensureOrder();
    if (ok) renderPay();
  } catch (e) {
    fatal(e.message || 'Something went wrong preparing your order.');
  }
}

main();
