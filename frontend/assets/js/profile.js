// Print Karo frontend — profile (name/phone) + sessions.
import { mountChrome } from './partials.js';
import { initAnimations } from './animations.js';
import { initRipples, toast, loadingButton } from './ui.js';
import { api } from './api.js';
import { CONFIG } from './config.js';
import { $, el, formatDate } from './utils.js';
import { guardPage, signOut } from './auth.js';

function renderProfile(user) {
  const body = $('#profile-body');
  body.innerHTML = `
    <div class="flex" style="gap:16px;align-items:center;margin-bottom:20px">
      <span class="t-avatar" style="width:56px;height:56px;font-size:var(--fs-xl)">${(user.name || 'U')[0].toUpperCase()}</span>
      <div>
        <div style="font-weight:700;font-size:var(--fs-lg)">${user.name || 'Guest'}</div>
        <div class="text-muted" style="font-size:var(--fs-sm)">${user.email || ''}</div>
      </div>
    </div>
    <form id="profile-form" class="stack">
      <div class="field">
        <label class="label" for="p-name">Name</label>
        <input class="input" id="p-name" value="${user.name || ''}" />
      </div>
      <div class="field">
        <label class="label" for="p-phone">Phone</label>
        <div class="phone-input">
          <span class="cc">+91</span>
          <input id="p-phone" inputmode="numeric" maxlength="10" value="${user.phone || ''}" />
        </div>
      </div>
      <div id="p-msg"></div>
      <div class="flex" style="gap:12px">
        <button class="btn btn-primary" type="submit">Save changes</button>
        <button class="btn btn-ghost" type="button" id="p-signout">Sign out</button>
      </div>
    </form>`;

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#p-msg');
    msg.innerHTML = '';
    const restore = loadingButton(e.submitter, 'Saving…');
    try {
      await api.updateProfile({
        name: $('#p-name').value.trim() || undefined,
        phone: $('#p-phone').value.replace(/\D/g, '') || undefined,
      });
      toast('Profile saved', 'success');
      msg.innerHTML = `<div class="badge badge-success">Saved</div>`;
    } catch (ex) {
      msg.innerHTML = `<div class="field-error">${ex.message}</div>`;
    } finally {
      restore();
    }
  });

  $('#p-signout').addEventListener('click', async () => {
    await signOut();
    window.location.href = CONFIG.ROUTES.home;
  });
}

async function renderSessions() {
  const host = $('#sessions-list');
  try {
    const sessions = await api.sessions();
    if (!sessions || !sessions.length) {
      host.innerHTML = `<p class="text-muted" style="font-size:var(--fs-sm)">No active sessions.</p>`;
      return;
    }
    host.innerHTML = '';
    sessions.forEach((s) => {
      const row = el('div', { class: 'order-row' });
      row.innerHTML = `
        <div>
          <div style="font-weight:600">${s.browser || 'Browser'} · ${s.os || 'Device'}</div>
          <div class="text-muted" style="font-size:var(--fs-xs)">${s.ipAddress || ''} · ${formatDate(s.lastActivityAt || s.createdAt)}</div>
        </div>
        ${s.current ? '<span class="badge badge-success">This device</span>' : ''}`;
      host.append(row);
    });
  } catch {
    host.innerHTML = `<p class="text-muted" style="font-size:var(--fs-sm)">Could not load sessions.</p>`;
  }
}

async function main() {
  await mountChrome();
  initRipples();
  initAnimations();

  const user = await guardPage(CONFIG.ROUTES.profile);
  if (!user) return;
  renderProfile(user);
  renderSessions();
}

main();
