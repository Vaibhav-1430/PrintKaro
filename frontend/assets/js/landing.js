// Print Karo frontend — landing page controller.
import { mountChrome } from './partials.js';
import { initAnimations, heroTimeline } from './animations.js';
import { initRipples } from './ui.js';
import { renderMachines } from './machines.js';
import { $, el } from './utils.js';

const FAQS = [
  ['Do I need an account to print?', 'No. You can upload, pay and collect your print as a guest. Creating an account is optional — it just lets you see your history, receipts and saved files, and links past orders to your phone number.'],
  ['How do I collect my print?', 'After you pay, you get a one-time 4-digit PIN valid for 6 hours. Enter it at the machine keypad and your document prints silently, then the PIN expires.'],
  ['What file types are supported?', 'PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx) and images (PNG/JPG). We convert everything to a print-ready PDF automatically. Max size is 100 MB.'],
  ['What if the machine is out of paper?', 'You simply can\'t pay for an unavailable machine — our health gate blocks it. We suggest the nearest ready machine instead, so you never waste money.'],
  ['Is my document private?', 'Yes. Files are stored encrypted and only downloaded to the machine after your PIN is verified. The file is deleted from the machine right after printing.'],
  ['How does payment work?', 'This demo uses a secure simulated payment. Real payment gateways (UPI, cards) are supported by the platform and can be enabled per campus.'],
];

function mountFaq() {
  const host = $('#faq-list');
  if (!host) return;
  FAQS.forEach(([q, a], i) => {
    const item = el('div', { class: 'faq-item' });
    item.innerHTML = `
      <button class="faq-q" aria-expanded="false" aria-controls="faq-a-${i}">
        <span>${q}</span>
        <svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="faq-a" id="faq-a-${i}"><p>${a}</p></div>`;
    const btn = item.querySelector('.faq-q');
    const panel = item.querySelector('.faq-a');
    btn.addEventListener('click', () => {
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0';
    });
    host.append(item);
  });
}

function initTestimonials() {
  if (typeof window.Swiper === 'undefined') return;
  // eslint-disable-next-line no-new
  new window.Swiper('#testi-swiper', {
    slidesPerView: 1,
    spaceBetween: 24,
    loop: true,
    autoplay: { delay: 4200, disableOnInteraction: false },
    pagination: { el: '.swiper-pagination', clickable: true },
    breakpoints: { 768: { slidesPerView: 2 }, 1100: { slidesPerView: 3 } },
  });
}

async function main() {
  await mountChrome({ active: '' });
  initRipples();
  initAnimations();
  mountFaq();
  initTestimonials();
  renderMachines('#machines-grid', { note: false, limit: 4 });
  // Run the GSAP hero timeline once its (deferred) library has loaded.
  if (document.readyState === 'complete') heroTimeline();
  else window.addEventListener('load', heroTimeline, { once: true });
}

main();
