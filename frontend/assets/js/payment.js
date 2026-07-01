// Print Karo frontend — pay orchestrator: create order (post-auth) → verify machine
// (health gate) → initiate + simulate payment → success.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { renderStepper } from './stepper.js';
import { api, ApiError } from './api.js';
import { CONFIG } from './config.js';
import { $, $$, store, goto, formatPaise } from './utils.js';
import { guardPage } from './auth.js';

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

/** Create the order from the stored draft (idempotent within a page load). */
async function ensureOrder() {
  const saved = store.get(CONFIG.KEYS.order);
  if (!saved) {
    fatal('Your session expired. Please start again.');
    return null;
  }

  // Already created (draft:false) → reuse.
  if (saved.orderId) {
    order = await api.getOrder(saved.orderId).catch(() => null);
    if (order) return order;
  }

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
      fatal(e.message || 'That machine is not ready right now.', CONFIG.ROUTES.options, 'Pick another machine');
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

  $$('#pay-body [data-outcome]').forEach((btn) =>
    btn.addEventListener('click', () => pay(btn)),
  );
}

async function pay(btn) {
  const outcome = btn.dataset.outcome;
  const err = $('#pay-error');
  err.innerHTML = '';
  const restore = loadingButton(btn, outcome === 'SUCCESS' ? 'Paying…' : 'Processing…');
  try {
    await api.initiatePayment(order.id).catch(() => undefined);
    const payment = await api.simulatePayment(order.id, outcome);
    if (payment.status === 'SUCCEEDED') {
      toast('Payment successful', 'success');
      goto(CONFIG.ROUTES.success, { order: order.id });
      return;
    }
    err.innerHTML = `<div class="card" style="border-color:var(--danger)"><b>Payment ${payment.status.toLowerCase()}.</b> You can try again.</div>`;
    restore();
  } catch (e) {
    err.innerHTML = `<div class="field-error">${e.message}</div>`;
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
