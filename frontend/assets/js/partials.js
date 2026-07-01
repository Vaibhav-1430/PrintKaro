// Print Karo frontend — shared nav + footer, injected so markup stays DRY across
// the ~15 static pages. Call mountChrome() early in each page's module.
import { $ } from './utils.js';
import { initTheme } from './theme.js';
import { initNav } from './ui.js';
import { currentUser, signOut } from './auth.js';
import { CONFIG } from './config.js';
import { ensureSkipLink } from './a11y.js';
import { lazyImages } from './observers.js';
import { mountNotifications } from './notifications.js';

const LOGO = `<a class="brand" href="index.html" aria-label="Print Karo home">
  <span class="brand-mark">P</span><span>Print Karo</span></a>`;

const NAV_LINKS = [
  ['how-it-works.html', 'How it works'],
  ['pricing.html', 'Pricing'],
  ['machines.html', 'Machines'],
  ['faq.html', 'FAQ'],
];

const THEME_BTN = `<button class="btn btn-icon theme-toggle" type="button" aria-label="Toggle theme"></button>`;

export async function mountChrome({ active = '' } = {}) {
  ensureSkipLink();
  ensureMainId();
  mountNav(active);
  mountFooter();
  initTheme();
  initNav();
  await hydrateAuthState();
  lazyImages();
}

/** The skip link targets #main; make sure the primary <main> has that id. */
function ensureMainId() {
  const main = document.querySelector('main');
  if (main && !main.id) main.id = 'main';
}

function mountNav(active) {
  const host = $('#nav');
  if (!host) return;
  const links = NAV_LINKS.map(
    ([href, label]) =>
      `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');
  host.className = 'nav';
  host.innerHTML = `
    <div class="nav-inner glass">
      ${LOGO}
      <nav class="nav-links" aria-label="Primary">
        ${links}
        <div class="nav-mobile-actions" style="display:none"></div>
      </nav>
      <div class="nav-actions">
        <span id="nav-notify"></span>
        ${THEME_BTN}
        <span id="nav-auth" class="nav-desktop-only"></span>
        <button class="btn btn-icon nav-toggle" type="button" aria-label="Menu" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>`;
}

async function hydrateAuthState() {
  const slot = $('#nav-auth');
  if (!slot) return;
  const user = await currentUser();
  if (user) {
    slot.innerHTML = `
      <a class="btn btn-ghost" href="${CONFIG.ROUTES.dashboard}">Dashboard</a>
      <button class="btn btn-outline" id="nav-signout" type="button">Sign out</button>`;
    const so = $('#nav-signout');
    if (so)
      so.addEventListener('click', async () => {
        await signOut();
        window.location.href = CONFIG.ROUTES.home;
      });
    // Notification center is for signed-in users only.
    mountNotifications();
  } else {
    slot.innerHTML = `
      <a class="btn btn-ghost" href="${CONFIG.ROUTES.auth}">Sign in</a>
      <a class="btn btn-primary" href="${CONFIG.ROUTES.upload}">Start printing</a>`;
  }
}

function mountFooter() {
  const host = $('#footer');
  if (!host) return;
  host.className = 'footer';
  const year = new Date().getFullYear();
  host.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          ${LOGO}
          <p style="margin-top:12px;max-width:32ch;font-size:var(--fs-sm)">
            Cloud printing for campuses. Upload anywhere, print anywhere, pay in seconds.
          </p>
        </div>
        <div>
          <h4>Product</h4>
          <ul>
            <li><a href="how-it-works.html">How it works</a></li>
            <li><a href="pricing.html">Pricing</a></li>
            <li><a href="machines.html">Machines</a></li>
            <li><a href="upload.html">Print now</a></li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li><a href="about.html">About</a></li>
            <li><a href="contact.html">Contact</a></li>
            <li><a href="faq.html">FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4>Account</h4>
          <ul>
            <li><a href="${CONFIG.ROUTES.auth}">Sign in</a></li>
            <li><a href="${CONFIG.ROUTES.dashboard}">Dashboard</a></li>
            <li><a href="${CONFIG.ROUTES.profile}">Profile</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} Print Karo. All rights reserved.</span>
        <span>Made for campuses · Demo environment</span>
      </div>
    </div>`;
}
