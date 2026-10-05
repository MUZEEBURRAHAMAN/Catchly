// Storage layer — chrome.storage.local wrapper.
// All data stays on-device. No sync, no account, no server.

import { rolloverExpiredSub, uid } from './utils.js';
import { normalizeServiceName } from './merchants.js';

const STORE_KEYS = {
  SUBS: 'subs_v1',
  EVENTS: 'events_v1',           // price changes, captures, cancellations
  SETTINGS: 'settings_v1',
  CAPTURES_PENDING: 'pending_captures_v1',
  USAGE: 'usage_v1',             // last-visit timestamps per service key (shadow-charge)
  UI_STATE: 'ui_state_v1',       // collapse state for sub-list groups (Change 2)
  PRICE_HISTORY: 'price_history_v1', // local product price observations
  SAVINGS: 'savings_v1',             // confirmed savings log
  WATCHLIST: 'watchlist_v1',         // tracked products for price drops
  ACTIVE_OFFER: 'active_offer_v1'    // latest live offer from active tab
};

const DEFAULT_UI_STATE = {
  activeCollapsed: false,
  inactiveCollapsed: true
};

const SUB_SCHEMA_VERSION = 2;

function migrateSub(sub) {
  if (!sub) return sub;
  const current = sub.schemaVersion || 0;
  if (current >= SUB_SCHEMA_VERSION) return sub;
  let migrated = { ...sub };
  if (current < 2) {
    migrated.workspace = migrated.workspace || 'personal';
    migrated.noticePeriodDays = migrated.noticePeriodDays !== undefined ? migrated.noticePeriodDays : null;
  }
  return { ...migrated, schemaVersion: SUB_SCHEMA_VERSION };
}

const DEFAULT_SETTINGS = {
  currency: 'USD',
  reminderDays: [7, 3, 1],
  notifyTrials: true,
  notifyHikes: true,
  notifyShadow: true,
  shadowDaysThreshold: 60,
  detectOnPages: true,
  theme: 'system'
};

// ---------- generic get/set ----------
async function get(key, fallback) {
  const res = await chrome.storage.local.get(key);
  return res[key] !== undefined ? res[key] : fallback;
}
async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ---------- settings ----------
export async function getSettings() {
  const s = await get(STORE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function setSettings(patch) {
  const cur = await getSettings();
  await set(STORE_KEYS.SETTINGS, { ...cur, ...patch });
}

// ---------- ui state (Change 2: collapsible sub-list groups) ----------
export async function getUiState() {
  const s = await get(STORE_KEYS.UI_STATE, {});
  return { ...DEFAULT_UI_STATE, ...s };
}
export async function setUiState(patch) {
  const cur = await getUiState();
  await set(STORE_KEYS.UI_STATE, { ...cur, ...patch });
}

// ---------- subscriptions ----------
// Every read passes through migrateSub so callers see schema-current records.
// Every write stamps schemaVersion explicitly so a future migration always
// has a known baseline to upgrade from.
export async function getAllSubs(options = { autoRollover: true }) {
  const subs = await get(STORE_KEYS.SUBS, []);
  let dirty = false;
  const migrated = subs.map(s => {
    let current = migrateSub(s);
    if (options && options.autoRollover && current && current.status === 'active') {
      const { sub: rolledSub, rolledOver } = rolloverExpiredSub(current);
      if (rolledOver) {
        current = rolledSub;
        dirty = true;
      }
    }
    return current;
  });
  if (dirty) {
    await set(STORE_KEYS.SUBS, migrated);
  }
  return migrated;
}

export async function getSub(id) {
  const subs = await getAllSubs();
  return subs.find(s => s.id === id) || null;
}

export async function saveSub(sub) {
  const subs = await getAllSubs();
  const stamped = { ...sub, schemaVersion: SUB_SCHEMA_VERSION };
  const idx = subs.findIndex(s => s.id === stamped.id);
  if (idx >= 0) subs[idx] = stamped;
  else subs.push(stamped);
  await set(STORE_KEYS.SUBS, subs);
  return stamped;
}

export async function deleteSub(id) {
  const subs = await getAllSubs();
  const next = subs.filter(s => s.id !== id);
  await set(STORE_KEYS.SUBS, next);
}

export async function bulkSetSubs(subs) {
  const stamped = (subs || []).map(s => ({ ...s, schemaVersion: SUB_SCHEMA_VERSION }));
  await set(STORE_KEYS.SUBS, stamped);
}

// ---------- duplicate detection ----------
// Fuzzy match on name + price + cycle to avoid Subscription Stopper's
// "had to manually delete the 10th and re-add each one" complaint.
export async function findPotentialDuplicate(candidate) {
  const subs = await getAllSubs();
  const candName = (candidate.name || '').toLowerCase();
  const candKey = candidate.serviceKey;

  for (const s of subs) {
    if (s.status === 'cancelled') continue;
    if (candKey && s.serviceKey === candKey) return s;
    const sName = (s.name || '').toLowerCase();
    if (sName === candName) return s;
    if (sName && candName && (sName.includes(candName) || candName.includes(sName))) {
      const priceClose = Math.abs((s.amount || 0) - (candidate.amount || 0)) < 1;
      if (priceClose) return s;
    }
  }
  return null;
}

// ---------- price-hike detection ----------
// Differentiator #1 nobody else does well.
export async function checkAndRecordPriceChange(sub, newAmount) {
  if (!sub || typeof newAmount !== 'number') return null;
  const oldAmount = sub.amount;
  if (Math.abs(newAmount - oldAmount) < 0.01) return null;
  await logEvent({
    type: 'price_change',
    subId: sub.id,
    subName: sub.name,
    from: oldAmount,
    to: newAmount,
    currency: sub.currency || 'USD',
    ts: Date.now()
  });
  return { from: oldAmount, to: newAmount, delta: newAmount - oldAmount };
}

// ---------- events / activity log ----------
export async function getEvents(limit = 50) {
  const events = await get(STORE_KEYS.EVENTS, []);
  return events.slice(-limit).reverse();
}
export async function logEvent(evt) {
  const events = await get(STORE_KEYS.EVENTS, []);
  events.push(evt);
  if (events.length > 500) events.splice(0, events.length - 500);
  await set(STORE_KEYS.EVENTS, events);
}

// ---------- pending captures (from content script) ----------
// Caps to keep this collection bounded for users who never open the popup:
//   - Auto-expire entries older than PENDING_TTL_MS (7 days)
//   - Hard-cap at PENDING_MAX entries (drop oldest first)
// Without these, content.js could keep pushing new entries (one per known
// service domain visit, with 1-hour per-serviceKey dedup) and the queue
// grows for the lifetime of the install.
const PENDING_TTL_MS = 7 * 24 * 3600_000;
const PENDING_MAX = 50;

function pruneCaptures(pending) {
  const cutoff = Date.now() - PENDING_TTL_MS;
  const fresh = pending.filter(p => p.ts > cutoff);
  if (fresh.length <= PENDING_MAX) return fresh;
  // Keep the most recent PENDING_MAX entries (sort by ts desc, take top).
  return fresh.sort((a, b) => b.ts - a.ts).slice(0, PENDING_MAX);
}

export async function addPendingCapture(capture) {
  const raw = await get(STORE_KEYS.CAPTURES_PENDING, []);
  // Prune before applying dedup so we don't waste the slot on stale entries.
  const pending = pruneCaptures(raw);
  // dedupe within last hour by serviceKey
  const oneHrAgo = Date.now() - 3600_000;
  const recent = pending.filter(p =>
    p.serviceKey === capture.serviceKey && p.ts > oneHrAgo
  );
  if (recent.length) {
    // Still persist the pruned list (might differ from raw).
    if (pending.length !== raw.length) await set(STORE_KEYS.CAPTURES_PENDING, pending);
    return null;
  }
  pending.push({ ...capture, ts: Date.now(), id: `cap_${Date.now()}` });
  // Re-prune in case the push pushed length over PENDING_MAX.
  const final = pruneCaptures(pending);
  await set(STORE_KEYS.CAPTURES_PENDING, final);
  return final[final.length - 1];
}
export async function getPendingCaptures() {
  const raw = await get(STORE_KEYS.CAPTURES_PENDING, []);
  const pruned = pruneCaptures(raw);
  if (pruned.length !== raw.length) {
    // Opportunistically persist the prune so subsequent reads are cheap.
    await set(STORE_KEYS.CAPTURES_PENDING, pruned);
  }
  return pruned;
}
export async function dismissCapture(id) {
  const pending = await get(STORE_KEYS.CAPTURES_PENDING, []);
  await set(STORE_KEYS.CAPTURES_PENDING, pending.filter(p => p.id !== id));
}

// ---------- usage tracking (shadow-charge detection) ----------
// Records the last time the user visited a known service domain.
// Used to flag "you haven't logged in for 60+ days but this renews tomorrow."
export async function recordUsage(serviceKey) {
  if (!serviceKey) return;
  const usage = await get(STORE_KEYS.USAGE, {});
  usage[serviceKey] = Date.now();
  await set(STORE_KEYS.USAGE, usage);
}
export async function getUsage() {
  return await get(STORE_KEYS.USAGE, {});
}
export async function getDaysSinceLastVisit(serviceKey) {
  const usage = await getUsage();
  const last = usage[serviceKey];
  if (!last) return null;
  return Math.floor((Date.now() - last) / 86400_000);
}

// ---------- export / import / wipe ----------
// Export every storage key the extension owns so a user backing up + wiping
// + restoring doesn't lose waitlist signup, pending captures, or UI state.
// Version bumped to 2 to flag the new shape; importAll handles both v1 and v2.
const EXPORT_VERSION = 2;
export async function exportAll() {
  const subs = await getAllSubs();
  const events = await get(STORE_KEYS.EVENTS, []);
  const settings = await getSettings();
  const usage = await getUsage();
  const pendingCaptures = await get(STORE_KEYS.CAPTURES_PENDING, []);
  const uiState = await get(STORE_KEYS.UI_STATE, {});
  const waitlistState = await get('waitlist_state', {});
  return {
    exportedAt: new Date().toISOString(),
    version: EXPORT_VERSION,
    subs, events, settings, usage,
    pendingCaptures, uiState, waitlistState
  };
}

function sanitizeSub(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const id = typeof sub.id === 'string' && sub.id.trim() ? sub.id.trim().slice(0, 64) : uid('sub');
  const name = typeof sub.name === 'string' && sub.name.trim() ? sub.name.trim().slice(0, 100) : 'Untitled';
  const rawAmount = sub.amount !== undefined ? sub.amount : sub.price;
  const amount = Number(rawAmount);
  const validAmount = Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;
  const VALID_CYCLES = ['monthly', 'yearly', 'weekly', 'quarterly'];
  const cycle = VALID_CYCLES.includes(sub.cycle) ? sub.cycle : 'monthly';
  const validCurrency = typeof sub.currency === 'string' && /^[A-Za-z]{3}$/.test(sub.currency.trim())
    ? sub.currency.trim().toUpperCase()
    : 'USD';
  const now = Date.now();
  const nextRenewal = Number(sub.nextRenewal);
  const validRenewal = Number.isFinite(nextRenewal) && nextRenewal > 0 ? nextRenewal : now;
  const cancelUrl = typeof sub.cancelUrl === 'string' && /^https?:\/\//i.test(sub.cancelUrl.trim())
    ? sub.cancelUrl.trim()
    : null;
  return {
    id,
    serviceKey: typeof sub.serviceKey === 'string' ? sub.serviceKey.slice(0, 50) : null,
    name,
    plan: typeof sub.plan === 'string' ? sub.plan.slice(0, 100) : '',
    amount: validAmount,
    previousAmount: Number.isFinite(Number(sub.previousAmount)) ? Number(sub.previousAmount) : undefined,
    currency: validCurrency,
    cycle,
    nextRenewal: validRenewal,
    startedAt: Number.isFinite(Number(sub.startedAt)) ? Number(sub.startedAt) : now,
    status: sub.status === 'cancelled' ? 'cancelled' : 'active',
    isTrial: !!sub.isTrial,
    trialEndsAt: Number.isFinite(Number(sub.trialEndsAt)) ? Number(sub.trialEndsAt) : null,
    category: typeof sub.category === 'string' ? sub.category.slice(0, 50) : 'Other',
    color: typeof sub.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(sub.color.trim()) ? sub.color.trim() : '#15110C',
    cancelUrl,
    notes: typeof sub.notes === 'string' ? sub.notes.slice(0, 500) : '',
    schemaVersion: SUB_SCHEMA_VERSION
  };
}

// Import a payload previously produced by exportAll. Replaces existing data
// for each key present in the payload; keys absent from the payload are left
// untouched (so partial imports work). Throws if payload shape is unusable.
// Backward-compatible with version: 1 payloads which lacked the three
// new keys (pendingCaptures, uiState, waitlistState).
export async function importAll(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Import payload must be a JSON object.');
  }
  const v = data.version ?? (Array.isArray(data.subs) ? 2 : undefined);
  if (v !== 1 && v !== 2) {
    throw new Error(`Unsupported export version: ${v}. Expected 1 or 2.`);
  }
  const writes = {};
  if (Array.isArray(data.subs)) {
    // Sanitize, validate fields, cap at 500 records to prevent memory/storage denial of service
    writes[STORE_KEYS.SUBS] = data.subs.slice(0, 500).map(sanitizeSub).filter(Boolean);
  }
  if (Array.isArray(data.events)) writes[STORE_KEYS.EVENTS] = data.events.slice(-500);
  if (data.settings && typeof data.settings === 'object') {
    writes[STORE_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS, ...data.settings };
  }
  if (data.usage && typeof data.usage === 'object') writes[STORE_KEYS.USAGE] = data.usage;
  if (Array.isArray(data.pendingCaptures)) {
    writes[STORE_KEYS.CAPTURES_PENDING] = pruneCaptures(data.pendingCaptures);
  }
  if (data.uiState && typeof data.uiState === 'object') {
    writes[STORE_KEYS.UI_STATE] = { ...DEFAULT_UI_STATE, ...data.uiState };
  }
  if (data.waitlistState && typeof data.waitlistState === 'object') {
    writes['waitlist_state'] = data.waitlistState;
  }
  await chrome.storage.local.set(writes);
  return { imported: Object.keys(writes) };
}

export async function wipeAll() {
  await chrome.storage.local.clear();
}

// ---------- sample data ----------
// For instant demo on first install. Users can wipe in settings.
export async function seedSampleData() {
  const now = Date.now();
  const day = 86400_000;
  const sample = [
    {
      id: 'demo_netflix',
      serviceKey: 'netflix',
      name: 'Netflix',
      plan: 'Premium',
      amount: 24.99,
      previousAmount: 22.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 3 * day,
      startedAt: now - 400 * day,
      status: 'active',
      isTrial: false,
      category: 'Streaming',
      color: '#E50914',
      cancelUrl: 'https://www.netflix.com/cancelplan',
      notes: ''
    },
    {
      id: 'demo_chatgpt',
      serviceKey: 'chatgpt',
      name: 'ChatGPT Plus',
      plan: 'Plus',
      amount: 20.00,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 18 * day,
      startedAt: now - 90 * day,
      status: 'active',
      isTrial: false,
      category: 'AI',
      color: '#10A37F',
      cancelUrl: 'https://chatgpt.com/#settings/Billing'
    },
    {
      id: 'demo_audible',
      serviceKey: 'audible',
      name: 'Audible',
      plan: 'Premium Plus',
      amount: 14.95,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 11 * day,
      startedAt: now - 210 * day,
      status: 'active',
      isTrial: false,
      category: 'Audio',
      color: '#F8991C',
      cancelUrl: 'https://www.audible.com/account/membership-details'
    },
    {
      id: 'demo_adobe_trial',
      serviceKey: 'adobecc',
      name: 'Adobe Creative Cloud',
      plan: 'All Apps (Free Trial)',
      amount: 59.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 2 * day,
      startedAt: now - 5 * day,
      status: 'active',
      isTrial: true,
      trialEndsAt: now + 2 * day,
      category: 'Design',
      color: '#FA0F00',
      cancelUrl: 'https://account.adobe.com/plans'
    },
    {
      id: 'demo_spotify',
      serviceKey: 'spotify',
      name: 'Spotify',
      plan: 'Individual',
      amount: 11.99,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 22 * day,
      startedAt: now - 700 * day,
      status: 'active',
      isTrial: false,
      category: 'Music',
      color: '#1DB954',
      cancelUrl: 'https://www.spotify.com/account/subscription/'
    },
    {
      id: 'demo_nyt',
      serviceKey: 'nyt',
      name: 'New York Times',
      plan: 'All Access',
      amount: 17.00,
      currency: 'USD',
      cycle: 'monthly',
      nextRenewal: now + 8 * day,
      startedAt: now - 500 * day,
      status: 'active',
      isTrial: false,
      category: 'News',
      color: '#000000',
      cancelUrl: 'https://myaccount.nytimes.com/seg/subscription'
    }
  ];
  await bulkSetSubs(sample);
  // Seed usage data: Audible hasn't been visited in 87 days → shadow charge
  const usage = {
    netflix: now - 2 * day,
    chatgpt: now - 1 * day,
    audible: now - 87 * day,
    spotify: now - 0.5 * day,
    nyt: now - 40 * day,
    adobecc: now - 3 * day
  };
  await set(STORE_KEYS.USAGE, usage);
  await logEvent({
    type: 'price_change',
    subId: 'demo_netflix',
    subName: 'Netflix',
    from: 22.99, to: 24.99, currency: 'USD', ts: now - 6 * day
  });
  await logEvent({ type: 'sample_loaded', ts: now });
}

// ----------------------------------------------------------------------------
// Offline Statement / CSV Parser & Subscription Auto-Detector
// ----------------------------------------------------------------------------
export function parseStatementCsv(csvText, existingSubs = []) {
  if (!csvText || typeof csvText !== 'string') return [];

  // Parse CSV lines into rows handling commas inside quotes
  const parseLine = (line) => {
    const row = [];
    let inQuotes = false;
    let cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    row.push(cur.trim());
    return row;
  };

  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  // Find column indexes
  let descIdx = headers.findIndex(h => /desc|memo|payee|merchant|narrative|name|details/.test(h));
  let amountIdx = headers.findIndex(h => /amount|debit|charge|total/.test(h));
  let dateIdx = headers.findIndex(h => /date|posted|trans/.test(h));

  // Fallbacks if headers weren't named standardly
  if (descIdx === -1) descIdx = 1;
  if (amountIdx === -1) amountIdx = headers.length > 2 ? 2 : 1;
  if (dateIdx === -1) dateIdx = 0;

  const detected = [];
  const seenKeys = new Set();
  const existingNames = new Set(existingSubs.map(s => (s.name || '').toLowerCase()));
  const existingKeys = new Set(existingSubs.map(s => s.serviceKey).filter(Boolean));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (!cols || cols.length <= Math.max(descIdx, amountIdx)) continue;

    const rawDesc = cols[descIdx] || '';
    if (!rawDesc || rawDesc.length < 2) continue;

    const matched = normalizeServiceName(rawDesc);
    if (!matched || !matched.service) continue;

    const serviceKey = matched.key;
    if (seenKeys.has(serviceKey)) continue; // keep first occurrence in statement

    // Parse amount: clean out "$", "€", "£", "-", commas
    let rawAmount = (cols[amountIdx] || '').replace(/[^0-9.-]/g, '');
    let amount = Math.abs(parseFloat(rawAmount));
    if (!amount || Number.isNaN(amount)) {
      amount = matched.service.defaultPrice || 9.99;
    }

    // Parse date if present
    let rawDate = cols[dateIdx] || '';
    let parsedDate = Date.parse(rawDate);
    let nextRenewal = !Number.isNaN(parsedDate) ? parsedDate : Date.now() + 30 * 86400_000;
    // ensure next renewal is in the future
    while (nextRenewal <= Date.now()) {
      nextRenewal += 30 * 86400_000;
    }

    const isAlreadyTracked = existingKeys.has(serviceKey) || existingNames.has(matched.service.name.toLowerCase());

    seenKeys.add(serviceKey);
    detected.push({
      serviceKey,
      name: matched.service.name,
      amount,
      currency: matched.service.currency || 'USD',
      cycle: matched.service.cycle || 'monthly',
      category: matched.service.category || 'General',
      color: matched.service.color || '#1B5BFF',
      cancelUrl: matched.service.cancelUrl || '',
      nextRenewal,
      rawDesc,
      alreadyTracked: isAlreadyTracked,
      workspace: 'personal'
    });
  }

  return detected;
}

// ============================================================================
// CATCHLY BEST OFFER ENGINE — STORAGE APIS (Master Plan §13, §14, §29)
// 100% on-device, local-first in chrome.storage.local. Zero paid API dependencies.
// ============================================================================

/**
 * Records a price observation for a product into local storage.
 * Deduplicates multiple visits within 1 hour for the same product to conserve storage quota.
 */
export async function recordPriceObservation(observation) {
  if (!observation || !observation.canonicalProductId || !observation.price) return null;

  const rawHistory = await get(STORE_KEYS.PRICE_HISTORY, {});
  const pid = observation.canonicalProductId;
  const productEntries = rawHistory[pid] || [];
  const now = observation.timestamp || Date.now();

  // Deduplicate if observed on same merchant within 1 hour
  const lastEntry = productEntries[productEntries.length - 1];
  if (lastEntry && (now - lastEntry.timestamp < 3600_000) && lastEntry.merchantKey === observation.merchantKey) {
    // Update price if changed
    lastEntry.price = observation.price;
    lastEntry.effectivePrice = observation.effectivePrice || observation.price;
    lastEntry.timestamp = now;
  } else {
    productEntries.push({
      price: observation.price,
      originalPrice: observation.originalPrice || observation.price,
      effectivePrice: observation.effectivePrice || observation.price,
      currency: observation.currency || 'INR',
      merchant: observation.merchant || 'Store',
      merchantKey: observation.merchantKey || 'store',
      url: observation.url || '',
      timestamp: now
    });
  }

  // Cap each product to last 40 observations
  if (productEntries.length > 40) {
    productEntries.splice(0, productEntries.length - 40);
  }

  rawHistory[pid] = productEntries;

  // Prune storage if total products exceed 150
  const productKeys = Object.keys(rawHistory);
  if (productKeys.length > 150) {
    const oldestKey = productKeys[0];
    delete rawHistory[oldestKey];
  }

  await set(STORE_KEYS.PRICE_HISTORY, rawHistory);
  return productEntries;
}

/**
 * Fetches price observations array for a product.
 */
export async function getProductPriceHistory(canonicalProductId) {
  if (!canonicalProductId) return [];
  const rawHistory = await get(STORE_KEYS.PRICE_HISTORY, {});
  return rawHistory[canonicalProductId] || [];
}

/**
 * Stores the currently active offer on the active tab for instant popup display.
 */
export async function setActiveOffer(offerData) {
  await set(STORE_KEYS.ACTIVE_OFFER, offerData);
}

/**
 * Gets the active offer.
 */
export async function getActiveOffer() {
  return await get(STORE_KEYS.ACTIVE_OFFER, null);
}

/**
 * Confirms a savings event (when user takes advantage of a Catchly deal).
 */
export async function recordSavingsEvent(event) {
  if (!event || !event.savings) return null;
  const savings = await get(STORE_KEYS.SAVINGS, { totalSaved: 0, events: [] });
  const entry = {
    id: uid(),
    productId: event.productId || '',
    title: event.title || 'Deal',
    merchant: event.merchant || 'Store',
    originalPrice: event.originalPrice || 0,
    finalPrice: event.finalPrice || 0,
    savings: Math.round(event.savings),
    currency: event.currency || 'INR',
    timestamp: Date.now()
  };

  savings.totalSaved = (savings.totalSaved || 0) + entry.savings;
  savings.events = [entry, ...(savings.events || [])].slice(0, 50);

  await set(STORE_KEYS.SAVINGS, savings);
  return entry;
}

/**
 * Returns overall user savings metrics.
 */
export async function getSavingsSummary() {
  const savings = await get(STORE_KEYS.SAVINGS, { totalSaved: 0, events: [] });
  return {
    totalSaved: savings.totalSaved || 0,
    dealCount: savings.events?.length || 0,
    recentEvents: savings.events || []
  };
}

/**
 * Watchlist / Tracked Price Drops
 */
export async function getWatchlist() {
  return await get(STORE_KEYS.WATCHLIST, []);
}

export async function addToWatchlist(item) {
  if (!item || !item.canonicalProductId) return [];
  const list = await getWatchlist();
  const existingIdx = list.findIndex(p => p.canonicalProductId === item.canonicalProductId);
  const now = Date.now();
  const payload = {
    canonicalProductId: item.canonicalProductId,
    title: item.title,
    brand: item.brand,
    image: item.image,
    price: item.price,
    effectivePrice: item.effectivePrice || item.price,
    currency: item.currency || 'INR',
    merchant: item.merchant,
    url: item.url,
    targetPrice: item.targetPrice || Math.round(item.price * 0.9),
    trackedAt: now
  };

  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...payload };
  } else {
    list.unshift(payload);
  }

  await set(STORE_KEYS.WATCHLIST, list.slice(0, 30));
  return list;
}

export async function removeFromWatchlist(canonicalProductId) {
  const list = await getWatchlist();
  const filtered = list.filter(p => p.canonicalProductId !== canonicalProductId);
  await set(STORE_KEYS.WATCHLIST, filtered);
  return filtered;
}

