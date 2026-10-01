// Shared utility helpers.

export function uid(prefix = 'sub') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function fmtMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
      // narrowSymbol -> "$1.50" instead of locale-prefixed "US$1.50" / "A$1.50".
      // Saves 2 chars per value, lets a 380px popup fit currency without
      // ellipsis truncation. Trade-off: loses the currency-prefix
      // distinguisher for non-USD subs (acceptable since most users track
      // a single base currency).
      currencyDisplay: 'narrowSymbol'
    }).format(amount);
  } catch {
    return `$${(amount || 0).toFixed(2)}`;
  }
}

// Convert any cycle to monthly equivalent so totals can be compared.
export function toMonthly(amount, cycle) {
  switch (cycle) {
    case 'weekly': return amount * (52 / 12);
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount;
  }
}

export function toYearly(amount, cycle) {
  return toMonthly(amount, cycle) * 12;
}

export function daysUntil(ts) {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / 86400_000);
}

export function fmtRelative(ts) {
  const d = daysUntil(ts);
  if (d === null) return '—';
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return `in ${d} days`;
  if (d < 30) return `in ${Math.round(d / 7)}w`;
  return `in ${Math.round(d / 30)}mo`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// Urgency tier for trial countdown badge + UI colors.
// Returns: 'safe' | 'soon' | 'urgent' | 'overdue'
export function urgencyOf(ts) {
  const d = daysUntil(ts);
  if (d === null) return 'safe';
  if (d < 0) return 'overdue';
  if (d <= 2) return 'urgent';
  if (d <= 7) return 'soon';
  return 'safe';
}

// Compute next renewal date forward from a given date by cycle (monthly/yearly/etc.).
// Used after a renewal fires.
//
// JS Date.setMonth and Date.setFullYear roll overflow days forward —
// Jan 31 + 1 month becomes Mar 3 (Feb 31 → normalized), Feb 29 2024 +
// 1 year becomes Mar 1 2025 (Feb 29 → normalized). For subscription
// renewal dates that drift is real money: a $24.99/mo Netflix renewing
// on the 31st would walk ~12 days forward over 12 months.
//
// Clamp the day after stepping so months that don't have day 29/30/31
// land on the last day of that month instead of overflowing.
function addMonthsClamped(d, months) {
  const targetDay = d.getDate();
  // Set day to 1 first so setMonth never overflows on its own.
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Days in the resulting month (day-0 trick: day 0 of month+1 = last day of month).
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, daysInTarget));
}
export function nextRenewalAfter(ts, cycle) {
  const d = new Date(ts);
  switch (cycle) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': addMonthsClamped(d, 1); break;
    case 'quarterly': addMonthsClamped(d, 3); break;
    case 'yearly': addMonthsClamped(d, 12); break;
  }
  return d.getTime();
}

// HTML escape for inserting user-controlled text into innerHTML.
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Timezone-safe date input parsing (avoids UTC-midnight offset bug)
export function parseLocalDateInput(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

// Formats timestamp as YYYY-MM-DD for <input type="date"> in local time
export function toLocalDateInputValue(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rolls forward nextRenewal if a recurring subscription's date has passed
export function rolloverExpiredSub(sub, now = Date.now()) {
  if (!sub || sub.status !== 'active') return { sub, rolledOver: false };
  let rolled = false;
  const updated = { ...sub };
  if (updated.isTrial && updated.trialEndsAt && updated.trialEndsAt <= now) {
    updated.isTrial = false;
    updated.trialEndsAt = null;
    rolled = true;
  }
  if (updated.nextRenewal && updated.nextRenewal <= now) {
    let next = updated.nextRenewal;
    let iterations = 0;
    while (next <= now && iterations < 120) {
      next = nextRenewalAfter(next, updated.cycle || 'monthly');
      iterations++;
    }
    if (next !== updated.nextRenewal) {
      updated.nextRenewal = next;
      rolled = true;
    }
  }
  return { sub: updated, rolledOver: rolled };
}

