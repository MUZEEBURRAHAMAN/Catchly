// options.js — settings + welcome screen.

import {
  getSettings, setSettings,
  exportAll, importAll, wipeAll, seedSampleData
} from './lib/storage.js';

import {
  COPY,
  getWaitlistState,
  submitEmail,
  isValidEmail,
  setWaitlistState
} from './lib/waitlist.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Welcome mode?
  const params = new URLSearchParams(location.search);
  if (params.get('welcome') === '1') {
    document.getElementById('welcome').classList.remove('hidden');
    document.getElementById('settings').classList.add('hidden');
  }

  hydrateWaitlistCopy();
  await renderWaitlistState();
  wireWaitlistForms();

  wireWelcome();
  await loadSettings();
  wireSettings();
  wireDataButtons();

  // Deep-link from the popup's day-7 banner (Part B5). When the banner's
  // "Notify me" CTA opens options.html#waitlist, scroll the settings card
  // into view and focus the email input.
  if (location.hash === '#waitlist') {
    const card = document.getElementById('settings-waitlist');
    const input = document.getElementById('settings-waitlist-email');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (input) setTimeout(() => input.focus(), 200);
  }
});

// ----------------------------------------------------------------------------
// waitlist — hydration, state render, form wiring (Part A)
// ----------------------------------------------------------------------------
function hydrateWaitlistCopy() {
  // Welcome card
  setText('welcome-waitlist-eyebrow', COPY.welcome.eyebrow);
  setText('welcome-waitlist-title', COPY.welcome.title);
  setText('welcome-waitlist-body', COPY.welcome.body);
  setText('welcome-waitlist-submit', COPY.welcome.cta);
  setPlaceholder('welcome-waitlist-email', COPY.welcome.placeholder);
  setText('welcome-waitlist-incentive', COPY.welcome.incentive);
  setText('welcome-waitlist-privacy', COPY.welcome.privacy);
  setText('welcome-waitlist-confirmed-body', COPY.confirmed.body);

  // Welcome CTA buttons + note + meanwhile divider
  setText('w-go', COPY.welcome.manualCta);
  setText('w-seed', COPY.welcome.sampleCta);
  setText('meanwhile-label', COPY.welcome.meanwhile);
  setText('welcome-cta-note', COPY.welcome.note);

  // Settings card
  setText('settings-waitlist-eyebrow', COPY.settings.eyebrow);
  setText('settings-waitlist-title', COPY.settings.title);
  setText('settings-waitlist-body', COPY.settings.body);
  setText('settings-waitlist-status', COPY.settings.status);
  setText('settings-waitlist-submit', COPY.settings.cta);
  setPlaceholder('settings-waitlist-email', COPY.settings.placeholder);
  setText('settings-waitlist-privacy', COPY.settings.privacy);
  setText('settings-waitlist-confirmed-body', COPY.confirmed.body);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el != null && text != null) el.textContent = text;
}
function setPlaceholder(id, text) {
  const el = document.getElementById(id);
  if (el != null && text != null) el.setAttribute('placeholder', text);
}

async function renderWaitlistState() {
  const state = await getWaitlistState();
  const isConfirmed = !!state.email;
  for (const scope of ['welcome', 'settings']) {
    const form = document.getElementById(`${scope}-waitlist-form`);
    const error = document.getElementById(`${scope}-waitlist-error`);
    const confirmed = document.getElementById(`${scope}-waitlist-confirmed`);
    const emailLabel = document.getElementById(`${scope}-waitlist-confirmed-email`);
    if (!form || !confirmed) continue;
    if (isConfirmed) {
      form.classList.add('hidden');
      if (error) error.classList.add('hidden');
      confirmed.classList.remove('hidden');
      if (emailLabel) emailLabel.textContent = state.email;
      // Hide the welcome card's incentive line once they're confirmed
      const incentive = document.getElementById(`${scope}-waitlist-incentive`);
      const privacy = document.getElementById(`${scope}-waitlist-privacy`);
      if (incentive) incentive.classList.add('hidden');
      if (privacy) privacy.classList.add('hidden');
    } else {
      form.classList.remove('hidden');
      confirmed.classList.add('hidden');
      const incentive = document.getElementById(`${scope}-waitlist-incentive`);
      const privacy = document.getElementById(`${scope}-waitlist-privacy`);
      if (incentive) incentive.classList.remove('hidden');
      if (privacy) privacy.classList.remove('hidden');
    }
  }
}

function wireWaitlistForms() {
  for (const scope of ['welcome', 'settings']) {
    const form = document.getElementById(`${scope}-waitlist-form`);
    const change = document.getElementById(`${scope}-waitlist-change`);
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleWaitlistSubmit(scope);
      });
    }
    if (change) {
      change.addEventListener('click', async () => {
        // Clear email, return to form state, focus the input
        await setWaitlistState({ email: null, submittedAt: null, submittedFrom: null });
        await renderWaitlistState();
        const input = document.getElementById(`${scope}-waitlist-email`);
        if (input) { input.value = ''; input.focus(); }
      });
    }
  }
}

async function handleWaitlistSubmit(scope) {
  const input = document.getElementById(`${scope}-waitlist-email`);
  const submit = document.getElementById(`${scope}-waitlist-submit`);
  const error = document.getElementById(`${scope}-waitlist-error`);
  if (!input || !submit) return;
  const email = input.value.trim();

  // Clear prior error
  if (error) { error.classList.add('hidden'); error.textContent = ''; }

  if (!isValidEmail(email)) {
    showWaitlistError(scope, COPY.errors.invalidEmail);
    input.focus();
    return;
  }

  // Disable + spinner state
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  submit.textContent = '…';

  try {
    const res = await submitEmail({ email, source: scope });
    if (res.ok) {
      await renderWaitlistState();
    } else {
      showWaitlistError(scope, COPY.errors[res.error] || COPY.errors.serverError);
    }
  } finally {
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    submit.textContent = originalLabel;
  }
}

function showWaitlistError(scope, message) {
  const error = document.getElementById(`${scope}-waitlist-error`);
  if (!error) return;
  error.textContent = message;
  error.classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// welcome — existing behavior with clear toolbar guidance
// ----------------------------------------------------------------------------
function wireWelcome() {
  document.getElementById('w-go')?.addEventListener('click', async () => {
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
    const tip = document.getElementById('settings-tip');
    if (tip) {
      tip.classList.remove('hidden');
      tip.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    history.replaceState({}, '', 'options.html');
    try {
      if (chrome.action?.openPopup) {
        await chrome.action.openPopup();
      }
    } catch {
      // Browser may restrict programmatic openPopup; guidance banner is visible
    }
  });
  document.getElementById('w-seed')?.addEventListener('click', async () => {
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('settings').classList.remove('hidden');
    const tip = document.getElementById('settings-tip');
    if (tip) tip.classList.remove('hidden');
    history.replaceState({}, '', 'options.html');
  });
}

async function loadSettings() {
  const s = await getSettings();
  document.querySelectorAll('[data-rem]').forEach(el => {
    const d = parseInt(el.dataset.rem, 10);
    el.checked = s.reminderDays.includes(d);
  });
  document.getElementById('opt-trials').checked = s.notifyTrials;
  document.getElementById('opt-hikes').checked = s.notifyHikes;
  document.getElementById('opt-shadow').checked = s.notifyShadow;
  document.getElementById('opt-threshold').value = s.shadowDaysThreshold;
  document.getElementById('opt-currency').value = s.currency;
  document.getElementById('opt-detect').checked = s.detectOnPages;
  const themeEl = document.getElementById('opt-theme');
  if (themeEl) themeEl.value = s.theme || 'system';
}

function wireSettings() {
  // Reminder days
  document.querySelectorAll('[data-rem]').forEach(input => {
    input.addEventListener('change', async () => {
      const days = [];
      document.querySelectorAll('[data-rem]').forEach(el => {
        if (el.checked) days.push(parseInt(el.dataset.rem, 10));
      });
      await setSettings({ reminderDays: days });
      await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    });
  });

  const bind = (id, key, type = 'check') => {
    document.getElementById(id).addEventListener('change', async (e) => {
      const v = type === 'check' ? e.target.checked
              : type === 'num' ? parseInt(e.target.value, 10)
              : e.target.value;
      await setSettings({ [key]: v });
    });
  };
  bind('opt-trials', 'notifyTrials');
  bind('opt-hikes', 'notifyHikes');
  bind('opt-shadow', 'notifyShadow');
  bind('opt-threshold', 'shadowDaysThreshold', 'num');
  bind('opt-currency', 'currency', 'val');
  bind('opt-detect', 'detectOnPages');

  const themeEl = document.getElementById('opt-theme');
  if (themeEl) {
    themeEl.addEventListener('change', async (e) => {
      const t = e.target.value;
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('catchly_theme_cache', t); } catch {}
      await setSettings({ theme: t });
    });
  }

  // Cross-tab/popup sync for theme setting
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.settings_v1?.newValue) {
      const nextTheme = changes.settings_v1.newValue.theme || 'system';
      document.documentElement.setAttribute('data-theme', nextTheme);
      const sel = document.getElementById('opt-theme');
      if (sel && sel.value !== nextTheme) sel.value = nextTheme;
    }
  });
}

function wireDataButtons() {
  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catchly-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // Import flow: visible button triggers hidden <input type=file>; file change
  // event reads + parses + confirms + writes via importAll. Existing data is
  // overwritten for any storage key present in the payload (importAll spec).
  const importBtn = document.getElementById('btn-import');
  const importFile = document.getElementById('import-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const summary = [];
        if (Array.isArray(data.subs)) summary.push(`${data.subs.length} subs`);
        if (Array.isArray(data.events)) summary.push(`${data.events.length} events`);
        if (data.waitlistState?.email) summary.push('waitlist email');
        if (Array.isArray(data.pendingCaptures)) summary.push(`${data.pendingCaptures.length} pending captures`);
        const detail = summary.length ? ` (${summary.join(', ')})` : '';
        if (!confirm(`Import this file${detail}? This will OVERWRITE matching keys in current storage.`)) {
          importFile.value = '';
          return;
        }
        const result = await importAll(data);
        await chrome.runtime.sendMessage({ type: 'reschedule_all' });
        alert(`Imported. Wrote ${result.imported.length} storage keys: ${result.imported.join(', ')}.`);
      } catch (err) {
        alert(`Import failed: ${err.message || err}`);
      } finally {
        importFile.value = ''; // reset so re-picking the same file fires change again
      }
    });
  }

  document.getElementById('btn-seed').addEventListener('click', async () => {
    if (!confirm('Load sample subscriptions? This will overwrite your current tracked subs.')) return;
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    alert('Sample data loaded. Open the Catchly popup to see it.');
  });

  document.getElementById('btn-wipe').addEventListener('click', async () => {
    if (!confirm('Permanently delete all tracked subscriptions, settings, and history? This cannot be undone.')) return;
    await wipeAll();
    alert('Wiped. Reload this page to reset settings.');
  });
}
