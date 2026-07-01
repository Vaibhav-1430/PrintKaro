// Print Karo frontend — shared initializer for simple marketing/content pages.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples } from './ui.js';
import { renderMachines, renderMachineDashboard } from './machines.js';
import { $, $$ } from './utils.js';

function wireFaq() {
  $$('.faq-item .faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const panel = item.querySelector('.faq-a');
      const open = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0';
    });
  });
}

async function main() {
  const active = document.body.dataset.active || '';
  await mountChrome({ active });
  initRipples();
  initAnimations();
  wireFaq();
  // The machines page uses the full live dashboard (toolbar present); other pages
  // that embed a machine grid use the compact renderer.
  if ($('#machines-toolbar')) renderMachineDashboard('#machines-grid', '#machines-toolbar');
  else if ($('#machines-grid')) renderMachines('#machines-grid', { note: true });
}

main();
