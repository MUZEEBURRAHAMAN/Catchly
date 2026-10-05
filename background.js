// Background service worker (MV3).
// Responsibilities:
//   1. Schedule renewal/trial-end notifications via chrome.alarms
//   2. Keep the action-icon badge updated with days-to-most-urgent
//   3. Route messages from content script & popup
//   4. Run shadow-charge check on a daily alarm

import {
  getAllSubs, getSettings, getDaysSinceLastVisit,
  addPendingCapture, recordUsage, logEvent, getEvents,
  recordPriceObservation, getProductPriceHistory, setActiveOffer,
  getActiveOffer, recordSavingsEvent, getSavingsSummary,
  addToWatchlist, getWatchlist, removeFromWatchlist
} from './lib/storage.js';
import { daysUntil, urgencyOf, fmtMoney } from './lib/utils.js';

const ALARM_DAILY = 'catchly_daily';
const ALARM_BADGE = 'catchly_badge';
// Old alarm names from earlier "Subscription Sentry" branding. We
// clear them on install/update so users upgrading from any internal
// test build don't accumulate orphan alarms firing on the old keys.
const LEGACY_ALARMS = ['sentry_daily', 'sentry_badge'];

// ---------- lifecycle ----------
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  for (const name of LEGACY_ALARMS) {
    try { await chrome.alarms.clear(name); } catch {}
  }
  await chrome.alarms.create(ALARM_DAILY, { periodInMinutes: 60 * 24 });
  await chrome.alarms.create(ALARM_BADGE, { periodInMinutes: 60 });
  await refreshBadge();
  if (reason === 'install') {
    // Open onboarding popup-ish: just log; popup itself shows onboarding when empty
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshBadge();
  await runDailyChecks();
});

// ---------- alarms ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_BADGE) await refreshBadge();
  if (alarm.name === ALARM_DAILY) await runDailyChecks();
  if (alarm.name.startsWith('renewal_')) {
    const raw = alarm.name.replace('renewal_', '');
    const subId = raw.split('_')[0];
    await fireRenewalNotification(subId);
  }
  if (alarm.name.startsWith('trial_')) {
    const raw = alarm.name.replace('trial_', '');
    const subId = raw.split('_')[0];
    await fireTrialNotification(subId);
  }
});

// ---------- badge ----------
// Shows days until the most urgent renewal/trial. Color shifts with urgency.
async function refreshBadge() {
  const subs = await getAllSubs();
  const active = subs.filter(s => s.status === 'active');
  if (!active.length) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }
  // Most urgent = smallest non-negative daysUntil
  let best = null;
  for (const s of active) {
    const d = daysUntil(s.isTrial && s.trialEndsAt ? s.trialEndsAt : s.nextRenewal);
    if (d === null) continue;
    if (best === null || d < best.d) best = { d, sub: s };
  }
  if (!best) return;
  const u = urgencyOf(best.sub.isTrial && best.sub.trialEndsAt
    ? best.sub.trialEndsAt
    : best.sub.nextRenewal);
  const colors = {
    safe: '#3D8B5C',
    soon: '#D4881F',
    urgent: '#B85737',
    overdue: '#7A2E26'
  };
  await chrome.action.setBadgeBackgroundColor({ color: colors[u] });
  await chrome.action.setBadgeText({ text: best.d >= 0 ? String(best.d) : '!' });
  await chrome.action.setTitle({
    title: `Catchly — next: ${best.sub.name} in ${best.d}d`
  });
}

// ---------- daily checks ----------
// Dedup window for shadow-charge notifications. Without this the daily alarm
// re-fires the same shadow alert every 24h while the conditions hold
// (dRenew <= 3 AND lastVisit >= threshold). For a sub with a 3-day window
// that's three notifications in a row -> notification fatigue -> user
// disables notifications entirely.
const SHADOW_DEDUP_MS = 7 * 24 * 3600_000;

async function runDailyChecks() {
  const settings = await getSettings();
  const subs = await getAllSubs();
  // Fetch the event log once outside the loop so we don't N+1 storage reads
  // when checking dedup for each sub. getEvents returns at most `limit`
  // entries; 100 is plenty for a 7-day window.
  const recentEvents = await getEvents(100);
  const now = Date.now();
  for (const sub of subs) {
    if (sub.status !== 'active') continue;
    // Reschedule alarms for upcoming renewals/trials
    await scheduleAlarmsForSub(sub, settings);
    // Shadow-charge check
    if (settings.notifyShadow) {
      const dRenew = daysUntil(sub.nextRenewal);
      const lastVisit = await getDaysSinceLastVisit(sub.serviceKey);
      if (
        dRenew !== null && dRenew >= 0 && dRenew <= 3 &&
        lastVisit !== null && lastVisit >= settings.shadowDaysThreshold
      ) {
        // Skip if we already fired a shadow alert for this sub within the
        // dedup window. The event log is the source of truth for this.
        const recentShadow = recentEvents.find(e =>
          e.type === 'shadow_alert' &&
          e.subId === sub.id &&
          (now - e.ts) < SHADOW_DEDUP_MS
        );
        if (recentShadow) continue;
        await pushNotification({
          id: `shadow_${sub.id}_${now}`,
          title: `Shadow charge ahead: ${sub.name}`,
          message:
            `Renews in ${dRenew}d for ${fmtMoney(sub.amount, sub.currency)}. ` +
            `You haven't visited in ${lastVisit} days.`,
          priority: 2
        });
        await logEvent({ type: 'shadow_alert', subId: sub.id, daysSince: lastVisit, ts: now });
      }
    }
  }
  await refreshBadge();
}

async function scheduleAlarmsForSub(sub, settings) {
  // Clear any old alarms for this sub
  try {
    const all = await chrome.alarms.getAll();
    for (const a of all) {
      if (a.name.startsWith(`renewal_${sub.id}`) || a.name.startsWith(`trial_${sub.id}`)) {
        await chrome.alarms.clear(a.name);
      }
    }
  } catch {}

  // Trial-end alarm (1 day before, if isTrial)
  if (sub.isTrial && sub.trialEndsAt) {
    const when = sub.trialEndsAt - 24 * 3600_000;
    if (when > Date.now() + 30_000) {
      await chrome.alarms.create(`trial_${sub.id}`, { when });
    }
  }

  // Renewal alarms at each configured reminderDay (e.g. 7d, 3d, 1d)
  const daysRaw = Array.isArray(settings.reminderDays) ? settings.reminderDays : [];
  const days = daysRaw.length ? daysRaw : [3];
  for (const d of days) {
    const when = sub.nextRenewal - d * 24 * 3600_000;
    if (when > Date.now() + 30_000) {
      await chrome.alarms.create(`renewal_${sub.id}_${d}d`, { when });
    }
  }
}

async function fireRenewalNotification(subId) {
  const subs = await getAllSubs();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== 'active') return;
  const d = daysUntil(sub.nextRenewal);
  await pushNotification({
    id: `renewal_${subId}_${Date.now()}`,
    title: `${sub.name} renews ${d === 0 ? 'today' : `in ${d}d`}`,
    message: `${fmtMoney(sub.amount, sub.currency)} — click to manage`,
    priority: 1
  });
}

async function fireTrialNotification(subId) {
  const settings = await getSettings();
  if (!settings.notifyTrials) return;
  const subs = await getAllSubs();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== 'active') return;
  await pushNotification({
    id: `trial_${subId}_${Date.now()}`,
    title: `Free trial ending: ${sub.name}`,
    message:
      `Trial ends in 24h. Will auto-charge ${fmtMoney(sub.amount, sub.currency)}. ` +
      `Cancel now if you don't want it.`,
    priority: 2
  });
}

async function pushNotification({ id, title, message, priority = 0 }) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title, message, priority,
      requireInteraction: priority >= 2
    });
  } catch (e) {
    // Notifications may be denied; silently fail.
    console.warn('Notification failed:', e);
  }
}

// Clicking a notification opens the popup (best we can do in MV3).
chrome.notifications.onClicked.addListener(async (notifId) => {
  await chrome.notifications.clear(notifId);
  // Open the dashboard
  await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?from=notif') });
});

// ---------- messages ----------
const __usageThrottle = new Map(); // key -> last write ts
const USAGE_MIN_INTERVAL = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'capture') {
        const saved = await addPendingCapture(msg.payload);
        sendResponse({ ok: true, saved });
      } else if (msg.type === 'usage') {
        const now = Date.now();
        const last = __usageThrottle.get(msg.serviceKey) || 0;
        if (now - last >= USAGE_MIN_INTERVAL) {
          __usageThrottle.set(msg.serviceKey, now);
          await recordUsage(msg.serviceKey);
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'refresh_badge') {
        await refreshBadge();
        sendResponse({ ok: true });
      } else if (msg.type === 'reschedule_all') {
        const subs = await getAllSubs();
        const settings = await getSettings();
        for (const s of subs) await scheduleAlarmsForSub(s, settings);
        await refreshBadge();
        sendResponse({ ok: true });
      } else if (msg.type === 'record_price_observation') {
        const history = await recordPriceObservation(msg.payload);
        sendResponse({ ok: true, history });
      } else if (msg.type === 'get_price_history') {
        const history = await getProductPriceHistory(msg.canonicalProductId);
        sendResponse({ ok: true, history });
      } else if (msg.type === 'set_active_offer') {
        await setActiveOffer(msg.payload);
        sendResponse({ ok: true });
      } else if (msg.type === 'get_active_offer') {
        const offer = await getActiveOffer();
        sendResponse({ ok: true, offer });
      } else if (msg.type === 'record_savings') {
        const event = await recordSavingsEvent(msg.payload);
        sendResponse({ ok: true, event });
      } else if (msg.type === 'get_savings_summary') {
        const summary = await getSavingsSummary();
        sendResponse({ ok: true, summary });
      } else if (msg.type === 'add_to_watchlist') {
        const list = await addToWatchlist(msg.payload);
        sendResponse({ ok: true, list });
      } else if (msg.type === 'get_watchlist') {
        const list = await getWatchlist();
        sendResponse({ ok: true, list });
      } else if (msg.type === 'remove_from_watchlist') {
        const list = await removeFromWatchlist(msg.canonicalProductId);
        sendResponse({ ok: true, list });
      } else {
        sendResponse({ ok: false, error: 'unknown' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async response
});
