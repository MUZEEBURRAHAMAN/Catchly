// popup.js — the dashboard.
// CHANGE LOG (most recent on top):
//   Part B   — behavioral waitlist re-prompts: third-sub bottom toast,
//              after-capture inline replacement, day-7 fallback banner.
//              All three gated by lib/waitlist.js shouldShowWaitlistPrompt
//              (24h no-prompt window, max 3 'shown' lifetime, 7-day gap,
//              no back-to-back same surface, permanent opt-out wins).
//   Change 3 — brand logos everywhere. 32px brand-square (SVG from logos/ when
//              service is known, else solid brand-color tile with first-letter
//              monogram) replaces the old 24px monogram block on sub rows,
//              pending captures, alert rows, drawer header (48px), and the
//              quick-pick grid in the Add modal.
//   Change 2 — sub-list now groups Active + Inactive into collapsible sections
//              (chevron headers with counts, collapse state persisted via
//              getUiState/setUiState in chrome.storage.local). Inactive rows
//              dimmed to 60% with "Cancelled <date>" instead of countdown.
//   Change 1 — bottom tab bar with 4 destinations (Subs/Alerts/Insights/Settings),
//              header gear removed (Settings now a tab), Calendar tab dropped,
//              Alerts moved to its own pane, inline Settings pane with theme/
//              currency/notification controls + Advanced settings link.
// Loads data, renders panes, handles drawer + modal, reconciles pending captures,
// computes alerts (price hikes, shadow charges, trials).

import {
  getAllSubs, saveSub, deleteSub, getSettings, setSettings,
  getPendingCaptures, dismissCapture, findPotentialDuplicate,
  getEvents, seedSampleData, getUsage, logEvent,
  checkAndRecordPriceChange,
  getUiState, setUiState,
  parseStatementCsv
} from './lib/storage.js';
import { SERVICES, listServices } from './lib/merchants.js';
import {
  uid, fmtMoney, fmtRelative, fmtDate, daysUntil,
  urgencyOf, toMonthly, toYearly, nextRenewalAfter, esc,
  parseLocalDateInput, toLocalDateInputValue,
  getNoticeDeadline, daysUntilNotice,
  createIcsContent, createGoogleCalendarUrl, exportWorkSubsCsv
} from './lib/utils.js';
import {
  COPY as WL_COPY,
  markFirstUseIfUnset,
  shouldShowWaitlistPrompt,
  submitEmail as wlSubmitEmail,
  isValidEmail as wlIsValidEmail,
  logExposure as wlLogExposure,
  getWaitlistState
} from './lib/waitlist.js';

// ----------------------------------------------------------------------------
// state
// ----------------------------------------------------------------------------
const state = {
  subs: [],
  settings: null,
  filter: '',
  workspaceFilter: 'all',
  sort: 'renewal',
  calCursor: new Date(),
  events: [],
  ui: { activeCollapsed: false, inactiveCollapsed: true } // Change 2
};

// ----------------------------------------------------------------------------
// boot
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  applyStoredTheme();
  wireBrandSquareFallback();
  // Mark first popup-open time so the 24h no-prompt window can start ticking.
  // Idempotent — no-op after the first call. (Part B)
  await markFirstUseIfUnset();
  await refresh();
  wireHeader();
  wireTabs();
  wireListTools();
  wireCalendarNav();
  wireDrawer();
  wireModal();
  wireCsvModal();
  wireKeyboard();
  wireSettingsPane();
  await renderPendingCaptures();
  // Day-7 fallback banner — gated by shouldShowWaitlistPrompt. (Part B5)
  await maybeShowFallbackBanner();
});

// Apply stored theme as early as possible to avoid flash.
function applyStoredTheme() {
  try {
    chrome.storage.local.get('settings_v1', (res) => {
      const t = (res?.settings_v1?.theme) || 'system';
      setThemeAttr(t);
    });
  } catch {}
}
// Whitelist: system | editorial | utility. Legacy auto/light/dark from the
// old segmented control collapse to 'system'. Always sets the attribute so
// CSS rules selecting [data-theme="..."] can match deterministically.
function setThemeAttr(theme) {
  const valid = { system: 1, editorial: 1, utility: 1, dark: 1 };
  const next = valid[theme] ? theme : 'system';
  document.documentElement.setAttribute('data-theme', next);
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') {
      const modal = document.getElementById('add-modal');
      const csvModal = document.getElementById('csv-modal');
      const drawer = document.getElementById('drawer');
      const calDrawer = document.getElementById('calendar-drawer');
      if (modal && !modal.classList.contains('hidden')) { closeAddModal(); return; }
      if (csvModal && !csvModal.classList.contains('hidden')) { closeCsvModal(); return; }
      if (drawer && !drawer.classList.contains('hidden')) { closeDrawer(); return; }
      if (calDrawer && !calDrawer.classList.contains('hidden')) { closeCalendarDrawer(); return; }
    }
    if (e.key === '/' && !inField) {
      const s = document.getElementById('search');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });
}

async function refresh() {
  state.subs = await getAllSubs();
  state.settings = await getSettings();
  state.events = await getEvents(20);
  state.ui = await getUiState();
  await renderAll();
}

async function renderAll() {
  renderSummary();
  renderSubList();
  renderInsights();
  await renderAlerts();
  syncSettingsPane();
}

// ----------------------------------------------------------------------------
// header
// ----------------------------------------------------------------------------
function wireHeader() {
  document.getElementById('btn-add').addEventListener('click', () => openAddModal());
  document.getElementById('btn-calendar')?.addEventListener('click', () => openCalendarDrawer());
  
  // Side panel launch
  const sidePanelBtn = document.getElementById('btn-sidepanel');
  if (sidePanelBtn) {
    sidePanelBtn.addEventListener('click', async () => {
      try {
        if (chrome.sidePanel && chrome.sidePanel.open) {
          const win = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: win.id });
          window.close();
        } else {
          chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
        }
      } catch (e) {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
      }
    });
  }

  // Gear icon removed — Settings is now a bottom tab. See wireSettingsPane().
  document.getElementById('btn-advanced')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Calendar drawer close — overlay + × button both carry data-close-calendar.
  const calDrawer = document.getElementById('calendar-drawer');
  if (calDrawer) {
    calDrawer.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.matches('[data-close-calendar]') || e.target.closest('[data-close-calendar]')) {
        closeCalendarDrawer();
      }
    });
  }
  document.getElementById('btn-add-empty')?.addEventListener('click', () => openAddModal());
  document.getElementById('btn-seed')?.addEventListener('click', async () => {
    if (!confirm('Load sample subscriptions? This will overwrite your current tracked subs.')) return;
    await seedSampleData();
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    await refresh();
  });
}

// ----------------------------------------------------------------------------
// tabs
// ----------------------------------------------------------------------------
function wireTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      const target = btn.dataset.tab;
      document.querySelectorAll('.pane').forEach(p => {
        p.classList.toggle('active', p.dataset.pane === target);
      });
    });
  });
}

export function showBannerToast(msg, type = 'info') {
  let toast = document.getElementById('catchly-ui-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'catchly-ui-toast';
    toast.style.cssText = `
      position: fixed; top: 10px; left: 50%; transform: translateX(-50%) translateY(-20px);
      background: var(--ink); color: var(--canvas); padding: 7px 14px; border-radius: 6px;
      font-size: 12px; font-weight: 500; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      opacity: 0; transition: transform 160ms ease-out, opacity 160ms ease-out; pointer-events: none;
      max-width: 340px; text-align: center;
    `;
    document.body.appendChild(toast);
  }
  if (type === 'error') toast.style.background = 'var(--danger)';
  else if (type === 'success') toast.style.background = 'var(--success)';
  else toast.style.background = 'var(--ink)';
  toast.textContent = msg;
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-20px)';
  }, 2600);
}

// ----------------------------------------------------------------------------
// summary strip
// ----------------------------------------------------------------------------
function renderSummary() {
  const active = state.subs.filter(s => s.status === 'active');
  const monthByCurr = {};
  const yearByCurr = {};
  for (const s of active) {
    const cur = (s.currency || state.settings?.currency || 'USD').toUpperCase();
    monthByCurr[cur] = (monthByCurr[cur] || 0) + toMonthly(s.amount || 0, s.cycle || 'monthly');
    yearByCurr[cur] = (yearByCurr[cur] || 0) + toYearly(s.amount || 0, s.cycle || 'monthly');
  }

  const currencies = Object.keys(monthByCurr);
  const mixed = currencies.length > 1;
  const monthEl = document.getElementById('stat-month');
  const yearEl = document.getElementById('stat-year');

  if (currencies.length === 0) {
    const base = state.settings?.currency || 'USD';
    monthEl.textContent = fmtMoney(0, base);
    yearEl.textContent = fmtMoney(0, base);
    monthEl.removeAttribute('title');
    yearEl.removeAttribute('title');
  } else if (!mixed) {
    const base = currencies[0];
    monthEl.textContent = fmtMoney(monthByCurr[base], base);
    yearEl.textContent = fmtMoney(yearByCurr[base], base);
    monthEl.removeAttribute('title');
    yearEl.removeAttribute('title');
  } else {
    // Multi-currency: sort by monthly volume descending
    const sorted = Object.entries(monthByCurr).sort((a, b) => b[1] - a[1]);
    const topCurr = sorted[0][0];
    const topMonth = sorted[0][1];
    const topYear = yearByCurr[topCurr];
    const otherCount = sorted.length - 1;
    const fullMonthStr = sorted.map(([c, amt]) => fmtMoney(amt, c)).join(' + ');
    const fullYearStr = sorted.map(([c]) => fmtMoney(yearByCurr[c], c)).join(' + ');

    monthEl.textContent = `${fmtMoney(topMonth, topCurr)}${otherCount > 0 ? ` (+${otherCount})` : ''}`;
    yearEl.textContent = `${fmtMoney(topYear, topCurr)}${otherCount > 0 ? ` (+${otherCount})` : ''}`;
    monthEl.title = `Total spend across currencies: ${fullMonthStr}`;
    yearEl.title = `Yearly spend across currencies: ${fullYearStr}`;
  }
  document.getElementById('stat-count').textContent = String(active.length);
}

// ----------------------------------------------------------------------------
// alerts: price hikes, shadow charges, trials ending
// ----------------------------------------------------------------------------
const ALERT_ICONS = {
  hike:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trial:  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>`,
  shadow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
};

// ----------------------------------------------------------------------------
// brand square — real brand logo from bundled SVG over a brand-color tile.
// Falls back to first-letter monogram on the brand tile if the file is
// missing (handled by a single global error listener wired at boot to
// avoid inline onerror handlers, which MV3 CSP blocks).
//
// Why bundled, not CDN: an earlier version fetched these from
// cdn.simpleicons.org at render time. That contradicted our "local-only,
// nothing leaves your device" privacy claim — each render disclosed which
// services the user was tracking to a third-party CDN. The 15 mark SVGs
// we ship now live in logos/ and load over the chrome-extension:// scheme,
// so there is no outbound traffic for icon rendering. Five marks
// (Disney+, Hulu, Prime Video, ChatGPT/OpenAI, Adobe) are not in the
// Simple Icons set due to trademark concerns and intentionally fall
// through to the monogram fallback.
// ----------------------------------------------------------------------------
function localLogoUrl(slug) {
  // Resolves to chrome-extension://<id>/logos/<slug>.svg. Same-origin from
  // the popup, no web_accessible_resources entry required.
  return chrome.runtime.getURL(`logos/${slug}.svg`);
}

function brandSquareHtml({ serviceKey, color, name, logo, cdnSlug } = {}, size = 32) {
  const svc = serviceKey ? SERVICES[serviceKey] : null;
  const rawSlug = cdnSlug || svc?.cdnSlug || null;
  const slug = typeof rawSlug === 'string' && /^[a-z0-9_-]+$/i.test(rawSlug) ? rawSlug : null;
  const rawBrand = color || svc?.color || '#15110C';
  const brand = typeof rawBrand === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rawBrand) ? rawBrand : '#15110C';
  const displayName = name || svc?.name || '';
  const initial = (displayName || '?').trim().charAt(0).toUpperCase() || '?';
  const radius = size >= 40 ? 8 : 6;
  const fontSize = Math.max(10, Math.round(size * 0.45));
  const imgSize = Math.round(size * 0.6);
  const styleTile = `width:${size}px;height:${size}px;border-radius:${radius}px;background:${brand};`;
  if (slug) {
    return `<span class="brand-square" data-initial="${esc(initial)}" data-fs="${fontSize}" style="${styleTile}"><img src="${esc(localLogoUrl(slug))}" alt="" width="${imgSize}" height="${imgSize}" loading="lazy"/></span>`;
  }
  // Fallback: solid brand bg + white letter
  return `<span class="brand-square brand-fallback" style="${styleTile}font-size:${fontSize}px;">${esc(initial)}</span>`;
}

// Global error fallback — if a bundled SVG is missing for any reason
// (shipped without it, file corrupted), swap the broken <img> for the
// first-letter monogram. Capture phase because <img> error events don't
// bubble. Registered once at boot.
function wireBrandSquareFallback() {
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const parent = img.closest('.brand-square');
    if (!parent || !parent.dataset.initial) return;
    img.remove();
    parent.classList.add('brand-fallback');
    parent.style.fontSize = parent.dataset.fs + 'px';
    parent.textContent = parent.dataset.initial;
  }, true);
}

async function renderAlerts() {
  const host = document.getElementById('alerts');
  host.innerHTML = '';
  const items = [];

  const s = state.settings || {};
  // Hoist usage map outside the loop (P2 #TC-PERF-005). Previously
  // renderAlerts called getDaysSinceLastVisit(sub.serviceKey) inside the
  // for-sub loop, doing N chrome.storage.local reads of the same usage_v1
  // key. Fetch once, compute days locally.
  const usage = await getUsage();
  const dayMs = 86400_000;

  for (const sub of state.subs) {
    if (sub.status !== 'active') continue;

    // Price hike (previousAmount stored)
    if (s.notifyHikes !== false && sub.previousAmount && sub.previousAmount !== sub.amount) {
      const delta = sub.amount - sub.previousAmount;
      if (delta > 0) {
        items.push({
          color: 'rust',
          icon: 'hike',
          subRef: sub,
          title: `${sub.name} went up ${fmtMoney(delta, sub.currency)}`,
          sub: `${fmtMoney(sub.previousAmount, sub.currency)} → ${fmtMoney(sub.amount, sub.currency)} / ${sub.cycle}`,
          action: 'Review',
          onAction: () => openDrawer(sub.id)
        });
      }
    }

    // Trial ending soon
    if (s.notifyTrials !== false && sub.isTrial && sub.trialEndsAt) {
      const d = daysUntil(sub.trialEndsAt);
      if (d !== null && d >= 0 && d <= 3) {
        items.push({
          color: 'clay',
          icon: 'trial',
          subRef: sub,
          title: `Free trial: ${sub.name} ends ${d === 0 ? 'today' : `in ${d}d`}`,
          sub: `Will auto-charge ${fmtMoney(sub.amount, sub.currency)} unless cancelled`,
          action: 'Cancel',
          onAction: () => openDrawer(sub.id)
        });
      }
    }

    // Shadow charge: renewal soon + not visited in a while
    if (s.notifyShadow !== false && sub.serviceKey) {
      const dRenew = daysUntil(sub.nextRenewal);
      const lastVisitTs = usage[sub.serviceKey];
      const lastVisit = lastVisitTs ? Math.floor((Date.now() - lastVisitTs) / dayMs) : null;
      if (
        dRenew !== null && dRenew >= 0 && dRenew <= 7 &&
        lastVisit !== null && lastVisit >= (state.settings.shadowDaysThreshold || 60)
      ) {
        items.push({
          color: '',
          icon: 'shadow',
          subRef: sub,
          title: `Shadow charge: ${sub.name}`,
          sub: `Renews in ${dRenew}d. You haven't visited in ${lastVisit} days.`,
          action: 'Review',
          onAction: () => openDrawer(sub.id)
        });
      }
    }

    // Contract notice period deadline alert
    if (sub.noticePeriodDays) {
      const dNotice = daysUntilNotice(sub.nextRenewal, sub.noticePeriodDays);
      if (dNotice !== null && dNotice >= 0 && dNotice <= 7) {
        items.push({
          color: 'rust',
          icon: 'trial',
          subRef: sub,
          title: `Notice deadline: ${sub.name}`,
          sub: dNotice === 0 ? 'Today is the final day to cancel before renewal!' : `${dNotice}d left to give ${sub.noticePeriodDays}d notice before renewal`,
          action: 'Review',
          onAction: () => openDrawer(sub.id)
        });
      }
    }
  }

  // De-dupe per sub (one alert max in this strip)
  const seen = new Set();
  const unique = items.filter(it => {
    const k = it.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const slice = unique.slice(0, 8);
  for (const a of slice) {
    const el = document.createElement('div');
    el.className = `alert ${a.color ? 'alert-' + a.color : ''}`;
    const iconSvg = ALERT_ICONS[a.icon] || '';
    const brandHtml = a.subRef ? brandSquareHtml(a.subRef, 28) : '';
    el.innerHTML = `
      ${brandHtml}
      ${iconSvg ? `<div class="alert-icon">${iconSvg}</div>` : ''}
      <div class="alert-body">
        <div class="alert-title" dir="auto">${esc(a.title)}</div>
        <div class="alert-sub">${esc(a.sub)}</div>
      </div>
      <button class="alert-act">${esc(a.action)}</button>
    `;
    el.querySelector('.alert-act').addEventListener('click', a.onAction);
    host.appendChild(el);
  }

  // empty state + tab badge (Change 1)
  const empty = document.getElementById('alerts-empty');
  if (empty) empty.classList.toggle('hidden', slice.length > 0);
  const badge = document.getElementById('tab-alerts-badge');
  if (badge) {
    if (slice.length) {
      badge.textContent = String(slice.length);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// ----------------------------------------------------------------------------
// sub list
// ----------------------------------------------------------------------------
function wireListTools() {
  document.getElementById('search').addEventListener('input', (e) => {
    state.filter = e.target.value.toLowerCase().trim();
    renderSubList();
  });
  document.getElementById('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderSubList();
  });

  // Workspace filter pills
  document.querySelectorAll('.ws-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ws-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.workspaceFilter = btn.dataset.ws || 'all';
      renderSubList();
    });
  });

  // Open CSV statement import
  document.getElementById('btn-open-csv')?.addEventListener('click', () => {
    openCsvModal();
  });
}

function renderSubList() {
  const ul = document.getElementById('sub-list');
  const empty = document.getElementById('empty-state');
  ul.innerHTML = '';

  const filterFn = (s) => {
    if (state.workspaceFilter && state.workspaceFilter !== 'all') {
      if ((s.workspace || 'personal') !== state.workspaceFilter) return false;
    }
    if (!state.filter) return true;
    return (s.name || '').toLowerCase().includes(state.filter) ||
           (s.category || '').toLowerCase().includes(state.filter);
  };
  const sortActive = (a, b) => {
    if (state.sort === 'amount') return (b.amount || 0) - (a.amount || 0);
    if (state.sort === 'name')   return (a.name || '').localeCompare(b.name || '');
    return (a.nextRenewal || 0) - (b.nextRenewal || 0);
  };
  const sortInactive = (a, b) => (b.cancelledAt || 0) - (a.cancelledAt || 0);

  const active   = state.subs.filter(s => s.status === 'active').filter(filterFn).sort(sortActive);
  const inactive = state.subs.filter(s => s.status !== 'active').filter(filterFn).sort(sortInactive);

  // Total empty state — no subs in either bucket
  if (active.length === 0 && inactive.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  if (active.length > 0) {
    ul.appendChild(buildGroup({
      key: 'active',
      label: active.length === 1 ? 'Active Subscription' : 'Active Subscriptions',
      count: active.length,
      collapsed: !!state.ui.activeCollapsed,
      rows: active,
      inactive: false
    }));
  }
  if (inactive.length > 0) {
    ul.appendChild(buildGroup({
      key: 'inactive',
      label: 'Inactive',
      count: inactive.length,
      collapsed: !!state.ui.inactiveCollapsed,
      rows: inactive,
      inactive: true
    }));
  }
}

function buildGroup({ key, label, count, collapsed, rows, inactive }) {
  // <li> wrapper so #sub-list (a <ul>) stays semantically valid
  const wrap = document.createElement('li');
  wrap.className = `sub-group ${collapsed ? 'is-collapsed' : ''}`;
  wrap.dataset.group = key;

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'group-header';
  header.setAttribute('aria-expanded', String(!collapsed));
  header.setAttribute('aria-controls', `sub-group-${key}-rows`);
  header.innerHTML = `
    <span class="group-chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </span>
    <span class="group-label">${esc(label)}</span>
    <span class="group-count">${count}</span>
  `;
  header.addEventListener('click', async () => {
    const isCollapsed = wrap.classList.toggle('is-collapsed');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    const patch = key === 'active'
      ? { activeCollapsed: isCollapsed }
      : { inactiveCollapsed: isCollapsed };
    state.ui = { ...state.ui, ...patch };
    await setUiState(patch);
  });

  const rowsWrap = document.createElement('ul');
  rowsWrap.className = 'group-rows';
  rowsWrap.id = `sub-group-${key}-rows`;

  for (const sub of rows) {
    rowsWrap.appendChild(buildSubItem(sub, inactive));
  }

  wrap.appendChild(header);
  wrap.appendChild(rowsWrap);
  return wrap;
}

function buildSubItem(sub, inactive) {
  const li = document.createElement('li');
  li.className = inactive ? 'sub-item sub-item-inactive' : 'sub-item';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${sub.name}, ${fmtMoney(sub.amount || 0, sub.currency)} per ${sub.cycle || 'month'}`);

  const brand = brandSquareHtml(sub, 32);

  if (inactive) {
    const cancelledLabel = sub.cancelledAt
      ? `Cancelled ${fmtDate(sub.cancelledAt)}`
      : 'Cancelled';
    li.innerHTML = `
      ${brand}
      <div class="sub-main">
        <div class="sub-name" dir="auto">${esc(sub.name)}</div>
        <div class="sub-meta">${esc(cancelledLabel)}</div>
      </div>
      <div class="sub-right">
        <div class="sub-amount">${fmtMoney(sub.amount || 0, sub.currency)}</div>
      </div>
    `;
  } else {
    const renewalTs = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
    const u = urgencyOf(renewalTs);
    const whenClass = u === 'safe' ? '' : `when-${u}`;
    const hike = sub.previousAmount && sub.amount > sub.previousAmount;
    const dNotice = sub.noticePeriodDays ? daysUntilNotice(sub.nextRenewal, sub.noticePeriodDays) : null;
    const noticePill = (dNotice !== null && dNotice >= 0 && dNotice <= 14)
      ? `<span class="sub-pill pill-hike" title="${sub.noticePeriodDays}d notice required">notice ${dNotice}d</span>`
      : '';
    const wsTag = sub.workspace === 'work' ? '<span class="tag-ws tag-ws-work">work</span>' : '';
    li.innerHTML = `
      ${brand}
      <div class="sub-main">
        <div class="sub-name">
          <span dir="auto">${esc(sub.name)}</span>
          ${wsTag}
          ${sub.isTrial ? '<span class="sub-pill pill-trial">trial</span>' : ''}
          ${hike ? '<span class="sub-pill pill-hike">price ↑</span>' : ''}
          ${noticePill}
        </div>
        <div class="sub-meta" dir="auto">${esc(sub.plan || sub.category || sub.cycle || '')}</div>
      </div>
      <div class="sub-right">
        <div class="sub-amount">${fmtMoney(sub.amount || 0, sub.currency)}</div>
        <div class="sub-when ${whenClass}">${esc(fmtRelative(renewalTs))}</div>
      </div>
    `;
  }

  li.addEventListener('click', () => openDrawer(sub.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer(sub.id);
    }
  });
  return li;
}

// ----------------------------------------------------------------------------
// calendar
// ----------------------------------------------------------------------------
function wireCalendarNav() {
  document.getElementById('cal-prev').addEventListener('click', () => {
    state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    state.calCursor = new Date(state.calCursor.getFullYear(), state.calCursor.getMonth() + 1, 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const cursor = state.calCursor;
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('cal-title').textContent = monthLabel;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // bucket subs by day
  const buckets = {};
  for (const s of state.subs) {
    if (s.status !== 'active') continue;
    const t = s.isTrial && s.trialEndsAt ? s.trialEndsAt : s.nextRenewal;
    if (!t) continue;
    const d = new Date(t);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!buckets[day]) buckets[day] = [];
    buckets[day].push(s);
  }

  // fill in leading blanks (previous month)
  for (let i = 0; i < startDow; i++) {
    const el = document.createElement('div');
    el.className = 'cal-other';
    el.textContent = '';
    grid.appendChild(el);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const el = document.createElement('div');
    const isToday =
      year === today.getFullYear() &&
      month === today.getMonth() &&
      day === today.getDate();
    if (isToday) el.classList.add('cal-today');
    el.setAttribute('role', 'gridcell');
    const dateLabel = new Date(year, month, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (buckets[day]) {
      const names = buckets[day].map(s => s.name).join(', ');
      el.setAttribute('aria-label', `${dateLabel}: ${names}`);
      el.setAttribute('tabindex', '0');
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        grid.querySelectorAll('.cal-day-selected').forEach(c => c.classList.remove('cal-day-selected'));
        el.classList.add('cal-day-selected');
        renderSelectedDayUpcoming(new Date(year, month, day), buckets[day]);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    } else {
      el.setAttribute('aria-label', dateLabel);
      el.addEventListener('click', () => {
        grid.querySelectorAll('.cal-day-selected').forEach(c => c.classList.remove('cal-day-selected'));
        renderCalendarUpcoming();
      });
    }
    el.innerHTML = `<div>${day}</div>`;
    if (buckets[day]) {
      const dotsDiv = document.createElement('div');
      dotsDiv.className = 'cal-day-dots';
      for (const sub of buckets[day]) {
        const t = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
        const u = urgencyOf(t);
        const dot = document.createElement('span');
        dot.className = `dot dot-${u === 'overdue' ? 'urgent' : u}`;
        dot.title = `${sub.name} — ${fmtMoney(sub.amount || 0, sub.currency)}`;
        dotsDiv.appendChild(dot);
      }
      el.appendChild(dotsDiv);
    }
    grid.appendChild(el);
  }
  // trailing blanks to fill last row
  const total = startDow + daysInMonth;
  const trailing = (7 - (total % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    const el = document.createElement('div');
    el.className = 'cal-other';
    grid.appendChild(el);
  }
}

// ----------------------------------------------------------------------------
// calendar drawer (header button) — opens an overlay with the renewal month
// grid + a "next 30 days" upcoming list. Reuses renderCalendar above.
// ----------------------------------------------------------------------------
function openCalendarDrawer() {
  const drawer = document.getElementById('calendar-drawer');
  if (!drawer) return;
  state.calCursor = new Date(); // snap to current month every open
  renderCalendar();
  renderCalendarUpcoming();
  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeCalendarDrawer() {
  const drawer = document.getElementById('calendar-drawer');
  if (!drawer) return;
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
}

function buildCalUpcomingRow(sub, ts) {
  const li = document.createElement('li');
  li.className = 'cal-upcoming-row';
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'button');
  const u = urgencyOf(ts);
  const whenClass = u === 'safe' ? '' : `when-${u}`;
  li.innerHTML = `
    ${brandSquareHtml(sub, 24)}
    <div class="cal-upcoming-main">
      <div class="cal-upcoming-name" dir="auto">${esc(sub.name)}${sub.isTrial ? ' <span class="sub-pill pill-trial">trial</span>' : ''}</div>
      <div class="cal-upcoming-meta">${esc(fmtDate(ts))}</div>
    </div>
    <div class="cal-upcoming-right">
      <div class="cal-upcoming-amount">${fmtMoney(sub.amount || 0, sub.currency)}</div>
      <div class="cal-upcoming-when ${whenClass}">${esc(fmtRelative(ts))}</div>
    </div>
  `;
  const open = () => { closeCalendarDrawer(); openDrawer(sub.id); };
  li.addEventListener('click', open);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  return li;
}

function renderSelectedDayUpcoming(date, subs) {
  const list = document.getElementById('cal-upcoming-list');
  const title = document.querySelector('.cal-upcoming .card-eyebrow');
  if (title) title.textContent = `Renewals on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  if (!list) return;
  list.innerHTML = '';
  for (const sub of subs) {
    const ts = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
    list.appendChild(buildCalUpcomingRow(sub, ts));
  }
}

// "Next 30 days" list inside the calendar drawer. Sorted ascending by
// renewal timestamp; click a row to open that sub's detail drawer.
function renderCalendarUpcoming() {
  const list = document.getElementById('cal-upcoming-list');
  const title = document.querySelector('.cal-upcoming .card-eyebrow');
  if (title) title.textContent = 'next 30 days';
  if (!list) return;
  list.innerHTML = '';

  const horizon = Date.now() + 30 * 86400_000;
  const upcoming = state.subs
    .filter(s => s.status === 'active')
    .map(s => {
      const ts = s.isTrial && s.trialEndsAt ? s.trialEndsAt : s.nextRenewal;
      return { sub: s, ts };
    })
    .filter(x => x.ts && x.ts <= horizon)
    .sort((a, b) => a.ts - b.ts);

  if (upcoming.length === 0) {
    list.innerHTML = `<li class="cal-upcoming-empty">No renewals in the next 30 days.</li>`;
    return;
  }

  for (const { sub, ts } of upcoming) {
    list.appendChild(buildCalUpcomingRow(sub, ts));
  }
}

// ----------------------------------------------------------------------------
// insights
// ----------------------------------------------------------------------------
function renderInsights() {
  const active = state.subs.filter(s => s.status === 'active');

  // category bars
  const byCat = {};
  for (const s of active) {
    const cat = s.category || 'Other';
    const cur = (s.currency || state.settings?.currency || 'USD').toUpperCase();
    if (!byCat[cat]) byCat[cat] = { total: 0, byCur: {} };
    const m = toMonthly(s.amount || 0, s.cycle || 'monthly');
    byCat[cat].total += m;
    byCat[cat].byCur[cur] = (byCat[cat].byCur[cur] || 0) + m;
  }
  const entries = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);
  const max = entries[0]?.[1]?.total || 1;
  const bars = document.getElementById('cat-bars');
  bars.innerHTML = '';
  if (entries.length === 0) {
    bars.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:8px 0;">No data yet.</div>`;
  } else {
    for (const [name, data] of entries) {
      const curLabels = Object.entries(data.byCur).map(([c, amt]) => `${fmtMoney(amt, c)}/mo`).join(' + ');
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-name">${esc(name)}</div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.round((data.total / max) * 100)}%"></div></div>
        <div class="cat-amt">${esc(curLabels)}</div>
      `;
      bars.appendChild(row);
    }
  }

  // workspace allocation (personal vs work)
  const byWs = { personal: { total: 0, byCur: {} }, work: { total: 0, byCur: {} } };
  for (const s of active) {
    const ws = (s.workspace === 'work') ? 'work' : 'personal';
    const cur = (s.currency || state.settings?.currency || 'USD').toUpperCase();
    const m = toMonthly(s.amount || 0, s.cycle || 'monthly');
    byWs[ws].total += m;
    byWs[ws].byCur[cur] = (byWs[ws].byCur[cur] || 0) + m;
  }
  const wsBars = document.getElementById('ws-bars');
  if (wsBars) {
    wsBars.innerHTML = '';
    const wsMax = Math.max(byWs.personal.total, byWs.work.total, 1);
    const wsList = [
      { key: 'personal', name: 'Personal', data: byWs.personal },
      { key: 'work', name: 'Work / Business (Tax-deductible)', data: byWs.work }
    ];
    for (const item of wsList) {
      const curLabels = Object.entries(item.data.byCur).map(([c, amt]) => `${fmtMoney(amt, c)}/mo`).join(' + ') || '$0/mo';
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-name">${esc(item.name)}</div>
        <div class="cat-bar"><div class="cat-bar-fill" style="width:${Math.round((item.data.total / wsMax) * 100)}%"></div></div>
        <div class="cat-amt">${esc(curLabels)}</div>
      `;
      wsBars.appendChild(row);
    }
  }

  // recent activity
  const list = document.getElementById('event-list');
  list.innerHTML = '';
  if (!state.events.length) {
    list.innerHTML = `<li style="color:var(--muted);font-style:italic;border:none;padding:4px 0;">No activity yet.</li>`;
  } else {
    for (const e of state.events.slice(0, 8)) {
      const li = document.createElement('li');
      let text = '';
      if (e.type === 'price_change') {
        const cur = e.currency || state.settings?.currency || 'USD';
        text = `${e.subName}: ${fmtMoney(e.from, cur)} → ${fmtMoney(e.to, cur)}`;
      } else if (e.type === 'capture_added') {
        text = `Tracked ${e.subName}`;
      } else if (e.type === 'capture_dismissed') {
        text = `Dismissed capture: ${e.subName}`;
      } else if (e.type === 'sub_cancelled') {
        text = `Cancelled ${e.subName}`;
      } else if (e.type === 'shadow_alert') {
        text = `Shadow alert sent`;
      } else if (e.type === 'sample_loaded') {
        text = `Loaded sample data`;
      } else {
        text = e.type;
      }
      li.innerHTML = `<span class="event-text">${esc(text)}</span><span class="event-when">${esc(fmtDate(e.ts))}</span>`;
      list.appendChild(li);
    }
  }

  // year recap
  const yearByCurr = {};
  for (const s of active) {
    const c = (s.currency || state.settings?.currency || 'USD').toUpperCase();
    yearByCurr[c] = (yearByCurr[c] || 0) + toYearly(s.amount || 0, s.cycle || 'monthly');
  }
  const yearEntries = Object.entries(yearByCurr);
  const recapEl = document.getElementById('recap-num');
  if (yearEntries.length === 0) {
    recapEl.textContent = fmtMoney(0, state.settings?.currency || 'USD');
  } else if (yearEntries.length === 1) {
    recapEl.textContent = fmtMoney(yearEntries[0][1], yearEntries[0][0]);
  } else {
    recapEl.textContent = yearEntries.map(([c, amt]) => fmtMoney(amt, c)).join(' + ');
  }
  const expensive = [...active].sort((a, b) => toMonthly(b.amount || 0, b.cycle) - toMonthly(a.amount || 0, a.cycle))[0];
  document.getElementById('recap-foot').textContent = expensive
    ? `${expensive.name} is your biggest line item (${fmtMoney(toMonthly(expensive.amount, expensive.cycle), expensive.currency)}/mo).`
    : 'Add a subscription to see insights.';
}

// ----------------------------------------------------------------------------
// drawer (subscription detail)
// ----------------------------------------------------------------------------
function wireDrawer() {
  const drawer = document.getElementById('drawer');
  drawer.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('[data-close]')) {
      closeDrawer();
    }
  });
}

function openDrawer(subId) {
  const sub = state.subs.find(s => s.id === subId);
  if (!sub) return;
  const drawer = document.getElementById('drawer');
  const body = document.getElementById('drawer-body');
  document.getElementById('drawer-eyebrow').textContent = sub.category || 'Subscription';

  const renewalTs = sub.isTrial && sub.trialEndsAt ? sub.trialEndsAt : sub.nextRenewal;
  const u = urgencyOf(renewalTs);
  const cancelInfo = SERVICES[sub.serviceKey];

  const hikeWarn = sub.previousAmount && sub.amount > sub.previousAmount
    ? `<div class="detail-warn detail-warn-hike">Price went up from ${fmtMoney(sub.previousAmount, sub.currency)} to ${fmtMoney(sub.amount, sub.currency)} this cycle.</div>`
    : '';

  const trialWarn = sub.isTrial && sub.trialEndsAt
    ? `<div class="detail-warn">Free trial ends ${fmtDate(sub.trialEndsAt)}. Auto-charges ${fmtMoney(sub.amount, sub.currency)} unless cancelled.</div>`
    : '';

  const stepsHtml = cancelInfo?.cancelSteps
    ? `<div class="card-eyebrow" style="margin-top:14px">how to cancel</div>
       <ol class="cancel-steps">${cancelInfo.cancelSteps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`
    : '';

  body.innerHTML = `
    <div class="detail-hero">
      ${brandSquareHtml(sub, 48)}
      <div style="flex:1;min-width:0;">
        <div class="detail-title" dir="auto">${esc(sub.name)}</div>
        <div class="detail-sub">${esc([sub.plan, sub.category].filter(Boolean).join(' · '))}</div>
      </div>
    </div>

    ${hikeWarn}
    ${trialWarn}

    <div class="detail-rows">
      <div class="detail-row"><span class="detail-key">Amount</span><span class="detail-val">${fmtMoney(sub.amount, sub.currency)} / ${esc(sub.cycle)}</span></div>
      <div class="detail-row"><span class="detail-key">Monthly equivalent</span><span class="detail-val">${fmtMoney(toMonthly(sub.amount, sub.cycle), sub.currency)}</span></div>
      <div class="detail-row"><span class="detail-key">Yearly equivalent</span><span class="detail-val">${fmtMoney(toYearly(sub.amount, sub.cycle), sub.currency)}</span></div>
      <div class="detail-row"><span class="detail-key">${sub.isTrial ? 'Trial ends' : 'Next renewal'}</span><span class="detail-val">${esc(fmtDate(renewalTs))} <em style="color:var(--muted);font-style:normal;">(${esc(fmtRelative(renewalTs))})</em></span></div>
      ${sub.workspace ? `<div class="detail-row"><span class="detail-key">Workspace</span><span class="detail-val">${sub.workspace === 'work' ? 'Work / Business (Tax-deductible)' : 'Personal'}</span></div>` : ''}
      ${sub.noticePeriodDays ? `<div class="detail-row"><span class="detail-key">Notice deadline</span><span class="detail-val">${esc(fmtDate(getNoticeDeadline(renewalTs, sub.noticePeriodDays)))} <em style="color:var(--warning);font-style:normal;">(${daysUntilNotice(renewalTs, sub.noticePeriodDays)}d left)</em></span></div>` : ''}
      ${sub.startedAt ? `<div class="detail-row"><span class="detail-key">Started</span><span class="detail-val">${esc(fmtDate(sub.startedAt))}</span></div>` : ''}
      ${sub.notes ? `<div class="detail-row"><span class="detail-key">Notes</span><span class="detail-val" dir="auto">${esc(sub.notes)}</span></div>` : ''}
    </div>

    ${stepsHtml}

    <div class="detail-actions">
      ${sub.cancelUrl ? `<button class="btn" id="d-cancel-open">Open cancel page</button>` : ''}
      <button class="btn btn-secondary" id="d-add-gcal">Add to Google Calendar</button>
      <button class="btn btn-secondary" id="d-mark-cancelled">Mark as cancelled (already done)</button>
      <button class="btn btn-ghost" id="d-edit">Edit</button>
      <button class="btn btn-ghost" id="d-delete" style="color:var(--danger)">Delete</button>
    </div>
  `;

  body.querySelector('#d-add-gcal')?.addEventListener('click', () => {
    const url = createGoogleCalendarUrl(sub);
    chrome.tabs.create({ url });
  });

  body.querySelector('#d-cancel-open')?.addEventListener('click', () => {
    if (sub.cancelUrl && /^https?:\/\//i.test(sub.cancelUrl)) {
      chrome.tabs.create({ url: sub.cancelUrl });
    } else {
      showBannerToast('Invalid or unsafe cancel URL', 'error');
    }
  });
  body.querySelector('#d-mark-cancelled')?.addEventListener('click', async () => {
    sub.status = 'cancelled';
    sub.cancelledAt = Date.now();
    await saveSub(sub);
    await logEvent({ type: 'sub_cancelled', subId: sub.id, subName: sub.name, ts: Date.now() });
    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    closeDrawer();
    await refresh();
  });
  body.querySelector('#d-edit')?.addEventListener('click', () => {
    closeDrawer();
    openAddModal(sub);
  });
  body.querySelector('#d-delete')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${sub.name} from tracking?`)) return;
    // Clear the scheduled alarms BEFORE removing the sub from storage.
    // background.js scheduleAlarmsForSub clears these on every reschedule,
    // but a deleted sub never gets rescheduled — without explicit clears
    // here, the alarms stay registered until the daily check sweep finds
    // them orphaned. Chrome enforces a 500-alarm cap per extension; power
    // users with frequent add/delete cycles can hit it.
    try {
      await chrome.alarms.clear(`renewal_${sub.id}`);
      await chrome.alarms.clear(`trial_${sub.id}`);
    } catch {} // alarms API may be unavailable in rare contexts
    await deleteSub(sub.id);
    closeDrawer();
    await refresh();
  });

  drawer.classList.remove('hidden');
}

function closeDrawer() {
  document.getElementById('drawer').classList.add('hidden');
}

// ----------------------------------------------------------------------------
// pending captures (from content script)
// ----------------------------------------------------------------------------
async function renderPendingCaptures() {
  const pending = await getPendingCaptures();
  const host = document.getElementById('pending-captures');
  host.innerHTML = '';
  if (!pending.length) { host.classList.add('hidden'); return; }
  host.classList.remove('hidden');

  for (const p of pending) {
    // Check for duplicate against existing subs
    const dup = await findPotentialDuplicate({ ...p, serviceKey: p.serviceKey });
    const wrap = document.createElement('div');
    wrap.className = 'capture';
    wrap.innerHTML = `
      ${brandSquareHtml({ serviceKey: p.serviceKey, color: p.color, name: p.name }, 32)}
      <div class="capture-body">
        <div class="capture-eyebrow">${dup ? 'looks like a duplicate' : 'detected — add?'}</div>
        <div class="capture-name" dir="auto">${esc(p.name)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">
          ${p.amount ? fmtMoney(p.amount, 'USD') + ' / ' + esc(p.cycle || 'monthly') : 'price not detected'}${p.isTrial ? ' · trial' : ''}
        </div>
      </div>
      <div class="capture-actions">
        ${dup
          ? `<button class="btn btn-sm" data-act="hike">Update price</button>
             <button class="btn btn-sm btn-ghost" data-act="dismiss">Dismiss</button>`
          : `<button class="btn btn-sm" data-act="add">Track</button>
             <button class="btn btn-sm btn-ghost" data-act="dismiss">Dismiss</button>`
        }
      </div>
    `;
    wrap.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (!act) return;
      let skipRerender = false;
      if (act === 'dismiss') {
        await dismissCapture(p.id);
        await logEvent({ type: 'capture_dismissed', subName: p.name, ts: Date.now() });
      } else if (act === 'add') {
        const svc = SERVICES[p.serviceKey] || {};
        const now = Date.now();
        const nextRenewal = p.isTrial
          ? now + 7 * 86400_000 // assume 7-day trial
          : nextRenewalAfter(now, p.cycle || 'monthly');
        const sub = {
          id: uid('sub'),
          serviceKey: p.serviceKey,
          name: p.name,
          plan: svc.plans?.[0]?.name || '',
          amount: p.amount || svc.defaultPrice || 0,
          currency: p.currency || svc.currency || 'USD',
          cycle: p.cycle || svc.cycle || 'monthly',
          nextRenewal,
          startedAt: now,
          status: 'active',
          isTrial: !!p.isTrial,
          trialEndsAt: p.isTrial ? now + 7 * 86400_000 : null,
          category: svc.category || 'Other',
          color: p.color || svc.color || '#15110C',
          cancelUrl: svc.cancelUrl || null
        };
        await saveSub(sub);
        await dismissCapture(p.id);
        await logEvent({ type: 'capture_added', subName: sub.name, ts: Date.now() });
        await chrome.runtime.sendMessage({ type: 'reschedule_all' });

        // After-capture inline prompt — replace this row IN PLACE with the
        // waitlist inline prompt instead of removing it. (Part B4)
        if (await shouldShowWaitlistPrompt('after_capture')) {
          renderInlineWaitlistPrompt(wrap);
          skipRerender = true;
        }
      } else if (act === 'hike') {
        // Treat as a price change against the existing sub
        if (dup) {
          const prev = dup.amount;
          dup.previousAmount = prev;
          dup.amount = p.amount || prev;
          await saveSub(dup);
          await checkAndRecordPriceChange({ id: dup.id, name: dup.name, amount: prev }, dup.amount);
        }
        await dismissCapture(p.id);
      }
      if (!skipRerender) {
        await renderPendingCaptures();
      }
      await refresh();
    });
    host.appendChild(wrap);
  }
}

// ----------------------------------------------------------------------------
// add / edit modal
// ----------------------------------------------------------------------------
function wireModal() {
  const m = document.getElementById('add-modal');
  m.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target.closest('[data-close]')) {
      closeAddModal();
    }
  });
}

function openAddModal(editing = null) {
  const body = document.getElementById('add-body');
  const services = listServices();

  const cur = editing || {};
  const startedAtIso = toLocalDateInputValue(cur.startedAt || Date.now());
  const renewalIso = toLocalDateInputValue(cur.nextRenewal || Date.now() + 30 * 86400_000);

  body.innerHTML = `
    ${editing ? '' : `
      <div class="card-eyebrow" style="margin-bottom:8px;">quick-pick known services</div>
      <input id="svc-filter" class="service-filter" type="search" placeholder="Filter services" />
      <div class="service-grid" id="svc-grid">
        ${services.map(s => `
          <button class="service-pick" data-pick="${esc(s.key)}" data-name="${esc(s.name.toLowerCase())}">
            ${brandSquareHtml({ serviceKey: s.key, color: s.color, name: s.name, logo: s.logo }, 20)}
            <span class="pick-name">${esc(s.name)}</span>
          </button>
        `).join('')}
      </div>
      <div class="card-eyebrow" style="margin-bottom:8px;">or enter manually</div>
    `}

    <div class="form-row">
      <label>Name</label>
      <input id="f-name" type="text" placeholder="Netflix" value="${esc(cur.name || '')}" />
    </div>
    <div class="form-row form-row-3">
      <div>
        <label>Amount</label>
        <input id="f-amount" type="number" step="0.01" placeholder="9.99" value="${cur.amount ?? ''}" />
      </div>
      <div>
        <label>Currency</label>
        <select id="f-currency">
          ${['USD','EUR','GBP','CAD','AUD','JPY','INR'].map(c =>
            `<option ${cur.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div>
        <label>Cycle</label>
        <select id="f-cycle">
          ${['monthly','yearly','weekly','quarterly'].map(c =>
            `<option ${cur.cycle === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Started</label>
        <input id="f-started" type="date" value="${startedAtIso}" />
      </div>
      <div>
        <label>Next renewal</label>
        <input id="f-renewal" type="date" value="${renewalIso}" />
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Category</label>
        <input id="f-category" type="text" placeholder="Streaming" value="${esc(cur.category || '')}" />
      </div>
      <div>
        <label>Plan (optional)</label>
        <input id="f-plan" type="text" placeholder="Premium" value="${esc(cur.plan || '')}" />
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Workspace</label>
        <select id="f-workspace">
          <option value="personal" ${cur.workspace !== 'work' ? 'selected' : ''}>Personal</option>
          <option value="work" ${cur.workspace === 'work' ? 'selected' : ''}>Work / Business (Tax-deductible)</option>
        </select>
      </div>
      <div>
        <label>Notice period (optional)</label>
        <select id="f-notice">
          <option value="0" ${!cur.noticePeriodDays ? 'selected' : ''}>None</option>
          <option value="7" ${cur.noticePeriodDays === 7 ? 'selected' : ''}>7 days before</option>
          <option value="14" ${cur.noticePeriodDays === 14 ? 'selected' : ''}>14 days before</option>
          <option value="30" ${cur.noticePeriodDays === 30 ? 'selected' : ''}>30 days before</option>
          <option value="60" ${cur.noticePeriodDays === 60 ? 'selected' : ''}>60 days before</option>
        </select>
      </div>
    </div>
    <div class="form-row form-row-2">
      <div>
        <label>Cancel URL (optional)</label>
        <input id="f-cancel-url" type="url" placeholder="https://..." value="${esc(cur.cancelUrl || '')}" />
      </div>
      <div>
        <label>Notes (optional)</label>
        <input id="f-notes" type="text" placeholder="e.g. Shared plan" value="${esc(cur.notes || '')}" />
      </div>
    </div>
    <div class="trial-toggle">
      <input id="f-trial" type="checkbox" ${cur.isTrial ? 'checked' : ''} />
      <label for="f-trial">This is a free trial</label>
    </div>
    <div class="modal-foot">
      ${editing ? '<button class="btn btn-ghost" data-close>Cancel</button>' : ''}
      <button class="btn" id="f-save">${editing ? 'Save changes' : 'Add subscription'}</button>
    </div>
  `;

  // wire service quick-pick
  body.querySelectorAll('[data-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.pick;
      const svc = SERVICES[key];
      if (!svc) return;
      body.querySelector('#f-name').value = svc.name;
      body.querySelector('#f-amount').value = svc.defaultPrice;
      body.querySelector('#f-currency').value = svc.currency || 'USD';
      body.querySelector('#f-cycle').value = svc.cycle || 'monthly';
      body.querySelector('#f-category').value = svc.category || '';
      if (svc.cancelUrl) {
        const cancelInput = body.querySelector('#f-cancel-url');
        if (cancelInput) cancelInput.value = svc.cancelUrl;
      }
      body.dataset.pickedKey = key;
    });
  });

  // wire service filter
  const svcFilter = body.querySelector('#svc-filter');
  if (svcFilter) {
    svcFilter.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      body.querySelectorAll('#svc-grid [data-pick]').forEach(btn => {
        const name = btn.dataset.name || '';
        btn.classList.toggle('hidden', q && !name.includes(q));
      });
    });
  }

  body.querySelector('#f-save').addEventListener('click', async () => {
    const saveBtn = body.querySelector('#f-save');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    try {
      const name = body.querySelector('#f-name').value.trim();
      if (!name) { showBannerToast('Name is required', 'error'); return; }
      const rawAmount = body.querySelector('#f-amount').value;
      const normalizedAmount = (rawAmount && rawAmount.includes(',') && !rawAmount.includes('.'))
        ? rawAmount.replace(',', '.')
        : rawAmount;
      const parsedAmount = parseFloat(normalizedAmount);
      if (normalizedAmount && Number.isNaN(parsedAmount)) { showBannerToast('Amount must be a number', 'error'); return; }
      const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
      if (amount < 0) { showBannerToast('Amount cannot be negative', 'error'); return; }
      const currency = body.querySelector('#f-currency').value;
      const cycle = body.querySelector('#f-cycle').value;
      const startedRaw = body.querySelector('#f-started').value;
      const renewalRaw = body.querySelector('#f-renewal').value;
      if (!renewalRaw) { showBannerToast('Next renewal date is required', 'error'); return; }
      const startedAt = startedRaw ? (parseLocalDateInput(startedRaw) || Date.now()) : Date.now();
      const nextRenewal = parseLocalDateInput(renewalRaw);
      if (!nextRenewal) { showBannerToast('Invalid renewal date', 'error'); return; }
      const category = body.querySelector('#f-category').value.trim();
      const plan = body.querySelector('#f-plan').value.trim();
      const workspace = body.querySelector('#f-workspace')?.value || 'personal';
      const noticePeriodDays = parseInt(body.querySelector('#f-notice')?.value || '0', 10) || null;
      const isTrial = body.querySelector('#f-trial').checked;
      const rawCancelUrl = body.querySelector('#f-cancel-url')?.value.trim();
      const cancelUrl = rawCancelUrl && /^https?:\/\//i.test(rawCancelUrl) ? rawCancelUrl : (editing?.cancelUrl || null);
      const notes = body.querySelector('#f-notes')?.value.trim() || '';

      const pickedKey = body.dataset.pickedKey || editing?.serviceKey || null;
      const svc = pickedKey ? SERVICES[pickedKey] : null;

      if (!editing) {
        const dup = await findPotentialDuplicate({ name, amount, serviceKey: pickedKey });
        if (dup) {
          const ok = confirm(
            `Already tracking ${dup.name} at ${fmtMoney(dup.amount, dup.currency)} / ${dup.cycle}.\n\nAdd anyway as a second entry?`
          );
          if (!ok) return;
        }
      }

      const id = editing?.id || uid('sub');
      const previousAmount = editing && editing.amount !== amount ? editing.amount : editing?.previousAmount;
      const sub = {
        id,
        serviceKey: pickedKey,
        name,
        plan,
        amount,
        previousAmount,
        currency,
        cycle,
        startedAt,
        nextRenewal,
        status: 'active',
        isTrial,
        trialEndsAt: isTrial ? nextRenewal : null,
        category: category || (svc?.category || 'Other'),
        color: svc?.color || editing?.color || '#15110C',
        cancelUrl: cancelUrl || svc?.cancelUrl || null,
        workspace,
        noticePeriodDays,
        notes
      };
      if (editing && previousAmount && previousAmount !== amount) {
        await checkAndRecordPriceChange({ id, name, amount: previousAmount }, amount);
      }
      await saveSub(sub);
      await chrome.runtime.sendMessage({ type: 'reschedule_all' });
      closeAddModal();
      showBannerToast(editing ? 'Changes saved' : 'Subscription added', 'success');
      const wasNew = !editing;
      await refresh();
      if (wasNew) await maybeShowThirdSubToast();
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() {
  const m = document.getElementById('add-modal');
  m.classList.add('hidden');
  // Clear stale picked-service state so next open starts clean
  const body = document.getElementById('add-body');
  if (body) delete body.dataset.pickedKey;
}

// ----------------------------------------------------------------------------
// CSV Statement Importer (Offline bank / card statement parser)
// ----------------------------------------------------------------------------
let parsedCsvSubs = [];

function wireCsvModal() {
  const m = document.getElementById('csv-modal');
  if (!m) return;

  m.addEventListener('click', (e) => {
    if (e.target.dataset.closeCsv !== undefined || e.target.closest('[data-close-csv]')) {
      closeCsvModal();
    }
  });

  const dropzone = document.getElementById('csv-dropzone');
  const fileInput = document.getElementById('csv-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });

    ['dragleave', 'dragend'].forEach(ev => {
      dropzone.addEventListener(ev, () => dropzone.classList.remove('is-dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleCsvFile(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleCsvFile(files[0]);
      }
      fileInput.value = '';
    });
  }

  // Toggle all button
  document.getElementById('csv-toggle-all')?.addEventListener('click', () => {
    const cbs = document.querySelectorAll('#csv-detected-list input[type="checkbox"]');
    const anyUnchecked = Array.from(cbs).some(cb => !cb.checked);
    cbs.forEach(cb => { cb.checked = anyUnchecked; });
  });

  // Confirm Import
  document.getElementById('btn-import-confirmed')?.addEventListener('click', async () => {
    const list = document.getElementById('csv-detected-list');
    if (!list) return;

    const checkedIndexes = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => parseInt(cb.dataset.index, 10))
      .filter(idx => !Number.isNaN(idx));

    if (checkedIndexes.length === 0) {
      showBannerToast('Please select at least one subscription', 'error');
      return;
    }

    const toImport = checkedIndexes.map(i => parsedCsvSubs[i]).filter(Boolean);
    let importedCount = 0;

    for (const item of toImport) {
      const sub = {
        id: uid('sub'),
        serviceKey: item.serviceKey || null,
        name: item.name,
        plan: '',
        amount: item.amount || 0,
        currency: item.currency || 'USD',
        cycle: item.cycle || 'monthly',
        startedAt: Date.now(),
        nextRenewal: item.nextRenewal || (Date.now() + 30 * 86400_000),
        status: 'active',
        isTrial: false,
        trialEndsAt: null,
        category: item.category || 'Other',
        color: item.color || '#15110C',
        cancelUrl: item.cancelUrl || null,
        workspace: item.workspace || 'personal',
        noticePeriodDays: null,
        notes: `Imported from bank statement (${item.rawDesc || 'CSV'})`
      };
      await saveSub(sub);
      importedCount++;
    }

    await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    closeCsvModal();
    showBannerToast(`Imported ${importedCount} subscription${importedCount === 1 ? '' : 's'}`, 'success');
    await refresh();
  });
}

function handleCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text !== 'string') return;
    processCsvText(text);
  };
  reader.readAsText(file);
}

function processCsvText(text) {
  parsedCsvSubs = parseStatementCsv(text, state.subs);
  const resultsEl = document.getElementById('csv-results');
  const countLabel = document.getElementById('csv-count-label');
  const listEl = document.getElementById('csv-detected-list');

  if (!resultsEl || !listEl) return;

  resultsEl.classList.remove('hidden');

  if (parsedCsvSubs.length === 0) {
    if (countLabel) countLabel.textContent = 'No Subscriptions Found';
    listEl.innerHTML = `
      <li style="padding:12px;font-size:12px;color:var(--muted);text-align:center;">
        No recognized recurring subscriptions found in this file.<br>
        Catchly matches known merchants like Netflix, Spotify, AWS, GitHub, Google, Apple, etc.
      </li>
    `;
    const btn = document.getElementById('btn-import-confirmed');
    if (btn) btn.disabled = true;
    return;
  }

  const btn = document.getElementById('btn-import-confirmed');
  if (btn) btn.disabled = false;

  if (countLabel) {
    countLabel.textContent = `Detected Subscriptions (${parsedCsvSubs.length})`;
  }

  listEl.innerHTML = parsedCsvSubs.map((sub, idx) => {
    const isNew = !sub.alreadyTracked;
    const trackedNote = sub.alreadyTracked ? '<span style="font-size:10px;color:var(--muted);margin-left:4px;">(already tracked)</span>' : '';
    return `
      <li style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0;">
          <input type="checkbox" data-index="${idx}" ${isNew ? 'checked' : ''} style="margin:0;cursor:pointer;" />
          <div style="min-width:0;">
            <div style="font-weight:600;color:var(--ink);display:flex;align-items:center;">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(sub.name)}</span>
              ${trackedNote}
            </div>
            <div style="font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${esc(sub.rawDesc || sub.category)}
            </div>
          </div>
        </label>
        <div style="text-align:right;white-space:nowrap;margin-left:8px;font-weight:600;color:var(--ink);">
          ${fmtMoney(sub.amount, sub.currency)} <span style="font-size:10px;font-weight:400;color:var(--muted);">/${sub.cycle}</span>
        </div>
      </li>
    `;
  }).join('');
}

function openCsvModal() {
  parsedCsvSubs = [];
  const resultsEl = document.getElementById('csv-results');
  if (resultsEl) resultsEl.classList.add('hidden');
  const m = document.getElementById('csv-modal');
  if (m) m.classList.remove('hidden');
}

function closeCsvModal() {
  const m = document.getElementById('csv-modal');
  if (m) m.classList.add('hidden');
  parsedCsvSubs = [];
}

// ----------------------------------------------------------------------------
// settings pane (Change 1)
// ----------------------------------------------------------------------------
function wireSettingsPane() {
  // Theme dropdown (Part C) — replaces the old Auto/Light/Dark segmented
  // control. Three options: system / editorial / utility. Apply instantly,
  // persist to chrome.storage.local + localStorage cache (sync + persistent), broadcast so
  // content.js can re-theme any visible toast.
  const themeSelect = document.getElementById('set-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', async (e) => {
      const t = e.target.value;
      // P2 #TC-THEME-010: pin transitions off for one frame so the data-theme
      // swap doesn't crossfade every transitioned property at 120ms (visible
      // smear otherwise). Pair-up requestAnimationFrame lets the browser
      // paint with .is-theme-switching set, then drops it on the next frame.
      const root = document.documentElement;
      root.classList.add('is-theme-switching');
      setThemeAttr(t);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.remove('is-theme-switching');
      }));
      try { localStorage.setItem('catchly_theme_cache', t); } catch {}
      await setSettings({ theme: t });
      state.settings = await getSettings();
      // Broadcast to content scripts on every open tab so any visible
      // capture toast re-themes. Must use chrome.tabs.sendMessage per tab —
      // chrome.runtime.sendMessage from a popup does NOT reach content
      // scripts running on web pages, only other extension pages + worker.
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id) continue;
          try { await chrome.tabs.sendMessage(tab.id, { type: 'theme_changed', theme: t }); }
          catch {} // tab may not have the content script (chrome://, store, etc.)
        }
      } catch {}
    });
  }

  // Reminder day chips
  document.querySelectorAll('#settings-pane [data-rem]').forEach(input => {
    input.addEventListener('change', async () => {
      const days = [];
      document.querySelectorAll('#settings-pane [data-rem]').forEach(cb => {
        if (cb.checked) days.push(parseInt(cb.dataset.rem, 10));
      });
      await setSettings({ reminderDays: days });
      state.settings = await getSettings();
      await chrome.runtime.sendMessage({ type: 'reschedule_all' });
    });
  });

  // Notification + display toggles
  const bind = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async (e) => {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      await setSettings({ [key]: v });
      state.settings = await getSettings();
      await renderAlerts();
    });
  };
  bind('set-trials', 'notifyTrials');
  bind('set-hikes', 'notifyHikes');
  bind('set-shadow', 'notifyShadow');
  bind('set-currency', 'currency');
  bind('set-detect', 'detectOnPages');

  // Export Calendar (.ics)
  document.getElementById('btn-export-ics')?.addEventListener('click', () => {
    const ics = createIcsContent(state.subs);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catchly-renewals-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showBannerToast('Calendar file exported (.ics)', 'success');
  });

  // Export Work (Tax CSV)
  document.getElementById('btn-export-tax')?.addEventListener('click', () => {
    const csv = exportWorkSubsCsv(state.subs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catchly-work-tax-deductions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showBannerToast('Tax-deductible work subscriptions exported', 'success');
  });

  // Import Statement CSV
  document.getElementById('btn-import-statement')?.addEventListener('click', () => {
    openCsvModal();
  });
}

function syncSettingsPane() {
  const s = state.settings;
  if (!s) return;

  // Theme dropdown selected value (Part C)
  const themeSelect = document.getElementById('set-theme');
  if (themeSelect) themeSelect.value = s.theme || 'system';

  // Reminder day chips
  document.querySelectorAll('#settings-pane [data-rem]').forEach(cb => {
    cb.checked = (s.reminderDays || []).includes(parseInt(cb.dataset.rem, 10));
  });

  // Toggles + currency
  const set = (id, v) => { const el = document.getElementById(id); if (el && 'checked' in el) el.checked = !!v; };
  set('set-trials', s.notifyTrials);
  set('set-hikes', s.notifyHikes);
  set('set-shadow', s.notifyShadow);
  set('set-detect', s.detectOnPages);
  const cur = document.getElementById('set-currency');
  if (cur) cur.value = s.currency || 'USD';
}

// ============================================================================
// Waitlist behavioral re-prompts (Part B)
// ============================================================================

// Lucide "zap" icon SVG used in waitlist surface headers + banner
const WL_ZAP_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
const WL_X_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const WL_CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;

// ----- B3: third-sub toast -------------------------------------------------
async function maybeShowThirdSubToast() {
  const activeCount = state.subs.filter(s => s.status === 'active').length;
  if (activeCount !== 3) return;
  if (!(await shouldShowWaitlistPrompt('third_sub'))) return;

  const host = document.getElementById('wl-toast');
  if (!host) return;
  const copy = WL_COPY.thirdSub;
  host.innerHTML = `
    <div class="wl-head">
      <span class="wl-head-icon">${WL_ZAP_SVG}</span>
      <div class="wl-head-body">
        <div class="wl-head-title">${esc(copy.title)}</div>
        <div class="wl-head-sub">${esc(copy.body)}</div>
      </div>
      <button class="wl-head-close" type="button" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
    </div>
    <form class="wl-form" data-wl-form novalidate>
      <input type="email" class="wl-input" autocomplete="email" placeholder="${esc(copy.placeholder)}" />
      <button type="submit" class="wl-submit">${esc(copy.cta)}</button>
    </form>
    <div class="wl-error hidden" role="alert"></div>
    <div class="wl-foot">
      <button type="button" class="wl-dismiss-hard" data-wl="hard">${esc(copy.dismissHard)}</button>
      <p class="wl-privacy">${esc(copy.privacy)}</p>
    </div>
  `;
  host.classList.remove('hidden');
  // Slide-up via class flip on next frame
  requestAnimationFrame(() => host.classList.add('is-open'));

  // Auto-dismiss after 12s if untouched
  const timer = setTimeout(() => wlCloseToast('dismissed_soft'), 12000);
  host.dataset.wlTimer = String(timer);

  wireWaitlistSurface(host, 'third_sub', 'toast', (outcome) => wlCloseToast(outcome));
}

function wlCloseToast(outcome) {
  const host = document.getElementById('wl-toast');
  if (!host) return;
  const timer = parseInt(host.dataset.wlTimer || '0', 10);
  if (timer) clearTimeout(timer);
  delete host.dataset.wlTimer;
  // animate out, then hide
  host.classList.remove('is-open');
  setTimeout(() => {
    host.classList.add('hidden');
    host.innerHTML = '';
  }, 200);
  if (outcome) wlLogExposure({ surface: 'toast', outcome });
}

// ----- B4: after-capture inline prompt --------------------------------------
function renderInlineWaitlistPrompt(wrap) {
  const copy = WL_COPY.afterCapture;
  wrap.className = 'wl-inline';
  wrap.innerHTML = `
    <div class="wl-head">
      <span class="wl-head-icon">${WL_ZAP_SVG}</span>
      <div class="wl-head-body">
        <div class="wl-head-title">${esc(copy.title)}</div>
        <div class="wl-head-sub">${esc(copy.body)}</div>
      </div>
      <button class="wl-head-close" type="button" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
    </div>
    <form class="wl-form" data-wl-form novalidate>
      <input type="email" class="wl-input" autocomplete="email" placeholder="${esc(copy.placeholder)}" />
      <button type="submit" class="wl-submit">${esc(copy.cta)}</button>
    </form>
    <div class="wl-error hidden" role="alert"></div>
    <div class="wl-foot">
      <button type="button" class="wl-dismiss-hard" data-wl="hard">${esc(copy.dismissHard)}</button>
      <p class="wl-privacy">${esc(copy.privacy)}</p>
    </div>
  `;

  // Mark 'shown' immediately so the lifetime cap reflects this exposure.
  wlLogExposure({ surface: 'inline', outcome: 'shown' });

  wireWaitlistSurface(wrap, 'after_capture', 'inline', (outcome) => {
    if (outcome) wlLogExposure({ surface: 'inline', outcome });
    wrap.remove();
    // Refresh captures list now that the inline prompt is gone.
    renderPendingCaptures();
  });
}

// ----- B5: day-7 fallback banner --------------------------------------------
async function maybeShowFallbackBanner() {
  const s = await getWaitlistState();
  if (!s.firstUseTs) return; // markFirstUseIfUnset hasn't run yet (shouldn't happen)
  if (Date.now() - s.firstUseTs < 7 * 24 * 3600_000) return;
  if (s.exposures.length > 0) return; // brief: "no exposure has happened yet"
  if (!(await shouldShowWaitlistPrompt('fallback'))) return;

  const host = document.getElementById('wl-banner');
  if (!host) return;
  const copy = WL_COPY.fallback;
  host.innerHTML = `
    <span class="wl-banner-icon">${WL_ZAP_SVG}</span>
    <div class="wl-banner-body">
      <div class="wl-banner-title">${esc(copy.title)}</div>
      <div class="wl-banner-sub">${esc(copy.body)}</div>
    </div>
    <button type="button" class="wl-banner-cta" data-wl="open-settings">${esc(copy.cta)}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </button>
    <button type="button" class="wl-banner-close" data-wl="soft" aria-label="Close">${WL_X_SVG}</button>
  `;
  host.classList.remove('hidden');
  wlLogExposure({ surface: 'banner', outcome: 'shown' });

  host.addEventListener('click', async (e) => {
    const t = e.target instanceof HTMLElement ? e.target.closest('[data-wl]') : null;
    if (!t) return;
    const which = t.getAttribute('data-wl');
    if (which === 'soft') {
      await wlLogExposure({ surface: 'banner', outcome: 'dismissed_soft' });
      host.classList.add('hidden');
      host.innerHTML = '';
    } else if (which === 'open-settings') {
      // Hand off to options.html#waitlist — that page scrolls + focuses input
      const url = chrome.runtime.getURL('options.html#waitlist');
      chrome.tabs.create({ url });
    }
  });
}

// ----- shared wiring for toast + inline surfaces ----------------------------
// host: element containing .wl-form / [data-wl] buttons
// source: trigger source string ('third_sub' | 'after_capture')
// surface: surface key ('toast' | 'inline')
// closeFn: function (outcome) -> void that tears down the surface
function wireWaitlistSurface(host, source, surface, closeFn) {
  const form = host.querySelector('[data-wl-form]');
  const input = host.querySelector('.wl-input');
  const submit = host.querySelector('.wl-submit');
  const errorEl = host.querySelector('.wl-error');

  if (surface === 'toast') {
    // Toast logs 'shown' here (inline logged at render time)
    wlLogExposure({ surface: 'toast', outcome: 'shown' });
  }

  if (form && input && submit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
      if (!wlIsValidEmail(email)) {
        if (errorEl) {
          errorEl.textContent = WL_COPY.errors.invalidEmail;
          errorEl.classList.remove('hidden');
        }
        input.focus();
        return;
      }
      const originalLabel = submit.textContent;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.textContent = '…';
      try {
        const res = await wlSubmitEmail({ email, source });
        if (res.ok) {
          // Show confirmation in same surface for 3s then close
          host.innerHTML = `
            <div class="wl-confirm">
              <span class="wl-head-icon" style="color:var(--success);">${WL_CHECK_SVG}</span>
              ${esc(WL_COPY.confirmed.title)} — ${esc(WL_COPY.confirmed.body)}
            </div>
          `;
          // submitEmail() already wrote a 'submitted' exposure — don't log again.
          setTimeout(() => closeFn(null), 3000);
        } else {
          if (errorEl) {
            errorEl.textContent = WL_COPY.errors[res.error] || WL_COPY.errors.serverError;
            errorEl.classList.remove('hidden');
          }
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          submit.textContent = originalLabel;
        }
      } catch {
        if (errorEl) {
          errorEl.textContent = WL_COPY.errors.serverError;
          errorEl.classList.remove('hidden');
        }
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.textContent = originalLabel;
      }
    });
  }

  host.addEventListener('click', (e) => {
    const t = e.target instanceof HTMLElement ? e.target.closest('[data-wl]') : null;
    if (!t) return;
    const which = t.getAttribute('data-wl');
    if (which === 'soft') closeFn('dismissed_soft');
    else if (which === 'hard') closeFn('dismissed_hard');
  });
}

// ============================================================================
// BEGIN: ONBOARDING + WHAT'S NEW INFO ICON
// Added: 2026-05-25
// Self-contained section. Two controllers (OnboardingController,
// UpdatesController) plus a single DOMContentLoaded handler at the end.
// Both controllers read/write only their own chrome.storage.local keys:
//   - onboardingCompleted (boolean)
//   - lastSeenUpdate (string version id)
// and never touch any of the existing keys above
// (subs_v1, settings_v1, events_v1, pending_captures_v1, usage_v1,
//  ui_state_v1, waitlist_state).
// Safe to remove by deleting from "BEGIN: ONBOARDING" down to EOF.
// ============================================================================

// Source of truth for the popover content. Append entries to introduce a new
// "what's coming" item; bump CURRENT_UPDATE_VERSION to the new entry's
// version id and every existing user will see the dot re-appear once.
const UPCOMING_FEATURES = [
  {
    version: 'gmail-scan-v1',
    eyebrow: 'COMING IN V1.0',
    icon: '⚡', // ⚡
    title: 'Gmail auto-scan',
    body: 'Find every active subscription in your inbox in 15 seconds. Email is parsed locally — never uploaded.',
    ctaText: 'Get early access →',
    ctaUrl: 'https://getcatchly.com/#gmail-scan'
  }
];
const CURRENT_UPDATE_VERSION = UPCOMING_FEATURES[0].version;

// Storage keys live here as constants so a future audit can grep them.
const ONBOARDING_KEY = 'onboardingCompleted';
const LAST_SEEN_UPDATE_KEY = 'lastSeenUpdate';

// Thin promise-wrapped storage helpers. chrome.storage.local APIs accept
// callbacks; wrapping in promises keeps the async/await flow readable and
// gives us a single chokepoint to catch errors without crashing the popup.
function storageGetSafe(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (res) => {
        if (chrome.runtime.lastError) { resolve(undefined); return; }
        resolve(res ? res[key] : undefined);
      });
    } catch { resolve(undefined); }
  });
}
function storageSetSafe(key, value) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        // Swallow chrome.runtime.lastError — we don't crash the popup on a
        // storage write failure; the user will just see the dot or onboarding
        // again next open, which is the safest fallback.
        void chrome.runtime.lastError;
        resolve();
      });
    } catch { resolve(); }
  });
}

// ----- OnboardingController ----------------------------------------------------
class OnboardingController {
  constructor() {
    this.overlay = null;
    this.screens = [];
    this.currentStep = 1;
    this.totalSteps = 3;
    this.transitioning = false;
    this._onKeydown = this._onKeydown.bind(this);
    this._onActionClick = this._onActionClick.bind(this);
    this._onFocusTrap = this._onFocusTrap.bind(this);
  }

  async init() {
    this.overlay = document.getElementById('onboard-overlay');
    if (!this.overlay) return;

    const done = await storageGetSafe(ONBOARDING_KEY);
    if (done === true) {
      // Already onboarded: leave overlay hidden and bail. Onboarding never
      // re-renders for the same install.
      return;
    }

    this.screens = Array.from(this.overlay.querySelectorAll('.onboard-screen'));
    this.overlay.hidden = false;

    this.overlay.addEventListener('click', this._onActionClick);
    document.addEventListener('keydown', this._onKeydown, true);
    this.overlay.addEventListener('keydown', this._onFocusTrap);

    this._focusPrimary();
  }

  _onActionClick(e) {
    const btn = e.target instanceof HTMLElement
      ? e.target.closest('[data-onboard-action]')
      : null;
    if (!btn || !this.overlay.contains(btn)) return;
    e.preventDefault();
    const action = btn.getAttribute('data-onboard-action');
    if (action === 'next')     this.next();
    if (action === 'back')     this.back();
    if (action === 'skip')     this.skip();
    if (action === 'complete') this.complete();
  }

  _onKeydown(e) {
    // Only react while the overlay is visible. Once dismissed, hand
    // Esc back to whatever else is listening (drawer, modal, etc).
    if (!this.overlay || this.overlay.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    }
  }

  // Simple focus trap. Tab/Shift+Tab wraps inside the visible screen so the
  // user can't accidentally focus the main UI underneath the overlay.
  _onFocusTrap(e) {
    if (e.key !== 'Tab') return;
    const focusable = this._focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  _focusableElements() {
    const screen = this.screens.find(s => !s.hidden);
    if (!screen) return [];
    return Array.from(screen.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'));
  }

  _focusPrimary() {
    // Defer to next frame so the screen has actually painted before we focus.
    requestAnimationFrame(() => {
      const screen = this.screens.find(s => !s.hidden);
      if (!screen) return;
      const primary = screen.querySelector('.onboard-btn-primary');
      if (primary) primary.focus();
    });
  }

  next() {
    if (this.currentStep >= this.totalSteps) { this.complete(); return; }
    this.showScreen(this.currentStep + 1, 'forward');
  }

  back() {
    if (this.currentStep <= 1) return;
    this.showScreen(this.currentStep - 1, 'backward');
  }

  showScreen(target, direction = 'forward') {
    const from = this.screens.find(s => s.dataset.onboardStep === String(this.currentStep));
    const to = this.screens.find(s => s.dataset.onboardStep === String(target));
    if (!from || !to || from === to) return;

    // Rapid-click safety — if a previous transition is still scheduled, cancel
    // its tail so it doesn't fire after the new transition has already moved
    // state forward (would otherwise hide the screen the user is now on).
    if (this._transitionTimer) {
      clearTimeout(this._transitionTimer);
      this._transitionTimer = null;
    }

    // Slide-out the current screen, slide-in the next.
    from.classList.remove('is-entering-left', 'is-entering-right');
    to.classList.remove('is-leaving-left', 'is-leaving-right');
    from.classList.add(direction === 'forward' ? 'is-leaving-left' : 'is-leaving-right');

    const DURATION = 280;
    this._transitionTimer = window.setTimeout(() => {
      from.hidden = true;
      from.classList.remove('is-leaving-left', 'is-leaving-right', 'is-active');
      to.hidden = false;
      // Apply the entering offset before the next paint, then drop it so the
      // screen eases to rest.
      to.classList.add(direction === 'forward' ? 'is-entering-right' : 'is-entering-left');
      requestAnimationFrame(() => {
        to.classList.remove('is-entering-right', 'is-entering-left');
        to.classList.add('is-active');
      });
      this.currentStep = target;
      this._transitionTimer = null;
      this._focusPrimary();
    }, DURATION);
  }

  async skip() {
    await this._finalize();
  }

  async complete() {
    await this._finalize();
  }

  async _finalize() {
    if (!this.overlay || this.overlay.hidden) return;
    this.overlay.classList.add('is-dismissing');
    await storageSetSafe(ONBOARDING_KEY, true);
    // Wait for the dismiss animation to finish before fully hiding so the
    // user sees the fade-out rather than a hard cut.
    const DISMISS_MS = 240;
    window.setTimeout(() => {
      if (!this.overlay) return;
      this.overlay.hidden = true;
      this.overlay.classList.remove('is-dismissing');
      document.removeEventListener('keydown', this._onKeydown, true);
    }, DISMISS_MS);
  }
}

// ----- UpdatesController -------------------------------------------------------
class UpdatesController {
  constructor() {
    this.btn = null;
    this.popover = null;
    this.body = null;
    this.closeBtn = null;
    this.isOpen = false;
    this._onDocClick = this._onDocClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  async init() {
    this.btn = document.getElementById('updates-info-btn');
    this.popover = document.getElementById('updates-popover');
    this.body = document.getElementById('updates-popover-body');
    this.closeBtn = document.getElementById('updates-popover-close');
    if (!this.btn || !this.popover || !this.body) return;

    this._renderItems();

    // Show the dot if the user has never seen the current version. Fresh
    // installs (no value stored) also see it — see brief edge case: an
    // upgrade from a version that didn't have this feature must surface the
    // dot once so users know there's new info.
    const seen = await storageGetSafe(LAST_SEEN_UPDATE_KEY);
    this._setDotVisible(seen !== CURRENT_UPDATE_VERSION);

    this.btn.addEventListener('click', () => this.openPopover());
    this.closeBtn?.addEventListener('click', () => this.closePopover());
    document.addEventListener('keydown', this._onKeydown);
  }

  // Render every UPCOMING_FEATURES entry. textContent everywhere — never
  // innerHTML — so even if a future entry contains characters that look
  // like HTML it can't break out of the text node.
  _renderItems() {
    // Clear previous children safely.
    while (this.body.firstChild) this.body.removeChild(this.body.firstChild);

    for (const item of UPCOMING_FEATURES) {
      const wrap = document.createElement('div');
      wrap.className = 'updates-item';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'updates-item-eyebrow';
      // Icon glyph + space + eyebrow text, both via textContent.
      eyebrow.textContent = `${item.icon} ${item.eyebrow}`;
      wrap.appendChild(eyebrow);

      const title = document.createElement('div');
      title.className = 'updates-item-title';
      title.textContent = item.title;
      wrap.appendChild(title);

      const body = document.createElement('p');
      body.className = 'updates-item-body';
      body.textContent = item.body;
      wrap.appendChild(body);

      if (item.ctaText && item.ctaUrl) {
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.className = 'updates-item-cta';
        cta.textContent = item.ctaText;
        // URL is captured in closure scope, not embedded in markup, so
        // there's no way for the rendered DOM to be re-parsed with a
        // different target.
        const url = item.ctaUrl;
        cta.addEventListener('click', () => this.handleCtaClick(url));
        wrap.appendChild(cta);
      }

      this.body.appendChild(wrap);
    }
  }

  _setDotVisible(visible) {
    if (!this.btn) return;
    if (visible) {
      this.btn.setAttribute('data-has-update', 'true');
      this.btn.setAttribute('aria-label', 'What\'s coming in Catchly — unseen update available');
    } else {
      this.btn.removeAttribute('data-has-update');
      this.btn.setAttribute('aria-label', 'What\'s coming in Catchly');
    }
  }

  async openPopover() {
    if (!this.popover || this.isOpen) return;
    this.isOpen = true;
    this.popover.hidden = false;
    // Force reflow so the transition runs (instead of jumping from hidden).
    void this.popover.offsetWidth;
    this.popover.classList.add('is-open');
    this.btn.setAttribute('aria-expanded', 'true');

    // Mark as seen and clear the dot.
    await storageSetSafe(LAST_SEEN_UPDATE_KEY, CURRENT_UPDATE_VERSION);
    this._setDotVisible(false);

    // Register the outside-click listener immediately so synthetic clicks
    // (Playwright, accessibility tools) fire it on the very next event.
    // A short-lived guard suppresses the click that opened us — it's the
    // same trampoline as a setTimeout(0) handoff, but synchronous attach.
    this._openClickInFlight = true;
    document.addEventListener('click', this._onDocClick, true);
    window.setTimeout(() => { this._openClickInFlight = false; }, 0);

    // Move focus to the close button so screen readers announce the dialog
    // and keyboard users can immediately dismiss it.
    this.closeBtn?.focus();
  }

  closePopover() {
    if (!this.popover || !this.isOpen) return;
    this.isOpen = false;
    this.popover.classList.remove('is-open');
    this.btn?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this._onDocClick, true);
    const CLOSE_MS = 150;
    window.setTimeout(() => {
      if (this.popover && !this.isOpen) this.popover.hidden = true;
    }, CLOSE_MS);
    // Return focus to the info icon so keyboard users land somewhere sane.
    this.btn?.focus();
  }

  _onDocClick(e) {
    if (this._openClickInFlight) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (this.popover.contains(t)) return;
    if (this.btn?.contains(t))   return;
    this.closePopover();
  }

  _onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (!this.isOpen) return;
    e.preventDefault();
    e.stopPropagation();
    this.closePopover();
  }

  handleCtaClick(url) {
    // chrome.tabs.create is preferred over window.open inside extension
    // contexts — it bypasses the popup's own window-management constraints
    // and gives us a guaranteed new tab with the target loaded.
    try {
      chrome.tabs.create({ url, active: true });
    } catch {
      // Fall back to a same-rules-as-window.open call as a last resort if
      // the tabs API is somehow unavailable. The browser will still treat
      // this as a user-initiated navigation because the click is in scope.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    this.closePopover();
  }
}

// Register both controllers on DOMContentLoaded. This is a SEPARATE listener
// from the existing one earlier in the file — DOM event listeners stack, so
// neither blocks the other, and either can be disabled by commenting out its
// own block without touching the main app init.
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const onboarding = new OnboardingController();
    await onboarding.init();
  } catch { /* never let onboarding errors prevent main UI use */ }

  try {
    const updates = new UpdatesController();
    await updates.init();
  } catch { /* same: updates is decorative, never block the popup */ }
});
// ============================================================================
// END: ONBOARDING + WHAT'S NEW INFO ICON
// ============================================================================
