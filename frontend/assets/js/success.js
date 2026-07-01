// Print Karo frontend — payment success + PIN + countdown.
import { mountChrome } from './partials.js';
import { initAnimations, playLottie } from './animations.js';
import { initRipples, copyText } from './ui.js';
import { renderStepper } from './stepper.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, queryParam, formatPaise, remaining, store } from './utils.js';
import { guardPage } from './auth.js';

let pin = null;
let expiresAt = null;
let timer = null;

/** The backend only surfaces the raw PIN inside the PAID notification body
 *  ("Your PIN is 1234."). Read the newest matching notification for this order. */
async function findPin(orderId) {
  try {
    const notes = await api.notifications();
    for (const n of notes || []) {
      if (n.orderId === orderId || n.type === 'PIN_GENERATED' || n.type === 'PAYMENT_SUCCEEDED') {
        const m = /\b(\d{4})\b/.exec(n.body || '');
        if (m) return m[1];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function renderPin(code) {
  const host = $('#pin-display');
  host.innerHTML = '';
  const digits = code ? code.split('') : ['•', '•', '•', '•'];
  digits.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'pin-digit';
    cell.textContent = d;
    host.append(cell);
  });
}

function tick() {
  if (!expiresAt) return;
  const r = remaining(expiresAt);
  const text = $('#countdown-text');
  const wrap = $('#countdown');
  text.textContent = r.expired ? 'Expired' : `Expires in ${r.text}`;
  wrap.classList.toggle('danger', r.ms < 5 * 60 * 1000);
  if (r.expired && timer) clearInterval(timer);
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();
  renderStepper('#stepper', 4);

  const user = await guardPage(CONFIG.ROUTES.success);
  if (!user) return;

  const orderId = queryParam('order') || store.get(CONFIG.KEYS.order)?.orderId;
  if (!orderId) {
    window.location.href = CONFIG.ROUTES.dashboard;
    return;
  }

  // Try a celebratory Lottie if present (progressive enhancement).
  playLottie($('.success-ring'), 'assets/animations/success.json', false);

  let order = null;
  try {
    order = await api.getOrder(orderId);
  } catch {
    /* fall through */
  }

  if (order) {
    $('#s-order').textContent = order.orderNumber;
    $('#s-machine').textContent = order.machineId?.slice(0, 8) || '—';
    $('#s-amount').textContent = formatPaise(order.amountPaise);
    expiresAt = order.pinExpiresAt;
  }

  pin = await findPin(orderId);
  renderPin(pin);
  if (!pin) {
    $('#pin-display').insertAdjacentHTML(
      'afterend',
      `<p class="text-muted" style="font-size:var(--fs-sm)">Your PIN was sent to your notifications. Open your <a href="dashboard.html" style="color:var(--brand-500)">dashboard</a> to view it.</p>`,
    );
  }

  // Clear the flow draft — this order is done.
  store.del(CONFIG.KEYS.upload);

  tick();
  timer = setInterval(tick, 1000);

  $('#copy-pin').addEventListener('click', () => pin && copyText(pin));
  $('#copy-pin').toggleAttribute('disabled', !pin);
}

main();
