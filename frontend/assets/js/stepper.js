// Print Karo frontend — flow progress stepper.
import { $ } from './utils.js';

const STEPS = ['Upload', 'Options', 'Verify', 'Pay', 'Done'];

export function renderStepper(sel, activeIndex) {
  const host = $(sel);
  if (!host) return;
  host.innerHTML = STEPS.map((label, i) => {
    const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : '';
    const n = i < activeIndex
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>'
      : i + 1;
    const bar = i < STEPS.length - 1 ? '<span class="bar"></span>' : '';
    return `<span class="st ${state}"><span class="n">${n}</span><span class="lbl">${label}</span></span>${bar}`;
  }).join('');
}
