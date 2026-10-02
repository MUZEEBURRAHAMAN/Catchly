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

// Notice period deadline helpers
export function getNoticeDeadline(nextRenewal, noticeDays) {
  if (!nextRenewal || !noticeDays || noticeDays <= 0) return null;
  return nextRenewal - (noticeDays * 86400_000);
}

export function daysUntilNotice(nextRenewal, noticeDays) {
  const deadline = getNoticeDeadline(nextRenewal, noticeDays);
  if (!deadline) return null;
  return Math.ceil((deadline - Date.now()) / 86400_000);
}

// Formats date into iCal UTC format: YYYYMMDDTHHMMSSZ or YYYYMMDD
function toIcalDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

// Generates RFC 5545 .ics calendar content for all active subscriptions
export function createIcsContent(subs = []) {
  const active = subs.filter(s => s && s.status === 'active' && s.nextRenewal);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Catchly//Subscription Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Catchly Subscriptions'
  ];

  for (const s of active) {
    const start = toIcalDate(s.nextRenewal);
    const end = toIcalDate(s.nextRenewal + 3600_000); // 1 hour event
    const now = toIcalDate(Date.now());
    const freq = s.cycle === 'yearly' ? 'YEARLY' : s.cycle === 'weekly' ? 'WEEKLY' : s.cycle === 'quarterly' ? 'MONTHLY;INTERVAL=3' : 'MONTHLY';
    const amountStr = fmtMoney(s.amount, s.currency || 'USD');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:catchly_${s.id || uid()}@getcatchly.com`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`RRULE:FREQ=${freq}`);
    lines.push(`SUMMARY:Renew ${s.name} (${amountStr})`);
    lines.push(`DESCRIPTION:Catchly renewal reminder for ${s.name}. Amount: ${amountStr} (${s.cycle || 'monthly'}). ${s.cancelUrl ? `Cancel link: ${s.cancelUrl}` : ''}`);
    lines.push('STATUS:CONFIRMED');

    // Alarm: 1 day prior
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P1D');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Renewal reminder for ${s.name}`);
    lines.push('END:VALARM');

    // Alarm: 7 days prior
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-P7D');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Upcoming renewal for ${s.name} in 7 days`);
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// 1-Click web link to add renewal event to Google Calendar
export function createGoogleCalendarUrl(sub) {
  if (!sub || !sub.nextRenewal) return '#';
  const start = toIcalDate(sub.nextRenewal);
  const end = toIcalDate(sub.nextRenewal + 3600_000);
  const title = encodeURIComponent(`Renew ${sub.name} (${fmtMoney(sub.amount, sub.currency || 'USD')})`);
  const details = encodeURIComponent(`Catchly Subscription Renewal Reminder.\nAmount: ${fmtMoney(sub.amount, sub.currency || 'USD')}\nCycle: ${sub.cycle || 'monthly'}\nCategory: ${sub.category || 'General'}${sub.cancelUrl ? `\nCancel: ${sub.cancelUrl}` : ''}`);
  return `https://calendar.google.com/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&add=none`;
}

// Export work / tax-deductible subscriptions to CSV
export function exportWorkSubsCsv(subs = []) {
  const workSubs = subs.filter(s => s && (s.workspace === 'work' || s.category === 'Work' || s.category === 'Developer' || s.category === 'Productivity'));
  const headers = ['Name', 'Workspace', 'Category', 'Amount', 'Currency', 'Cycle', 'Monthly Equivalent', 'Annual Cost', 'Status', 'Next Renewal', 'Cancel URL'];
  const rows = workSubs.map(s => [
    `"${(s.name || '').replace(/"/g, '""')}"`,
    `"${s.workspace || 'work'}"`,
    `"${s.category || 'General'}"`,
    s.amount || 0,
    `"${s.currency || 'USD'}"`,
    `"${s.cycle || 'monthly'}"`,
    (toMonthly(s.amount || 0, s.cycle || 'monthly')).toFixed(2),
    (toYearly(s.amount || 0, s.cycle || 'monthly')).toFixed(2),
    `"${s.status || 'active'}"`,
    `"${fmtDate(s.nextRenewal)}"`,
    `"${(s.cancelUrl || '').replace(/"/g, '""')}"`
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

