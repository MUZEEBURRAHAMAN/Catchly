# Catchly — Privacy Subscription Tracker Chrome Extension

Catchly is an open-source, privacy-first **subscription tracker Chrome extension** that monitors your recurring charges, renewal dates, and price hikes without ever asking for your bank login. Detects sign-ups on 24 supported services, warns you before upcoming renewals, flags unexpected rate hikes, surfaces unused "shadow charges", and provides direct links to cancel subscriptions in one click.

**Status:** v0.1.0 — submitted to the Chrome Web Store. MIT Licensed.

- Official Website: <https://getcatchly.com>
- Privacy Policy: <https://getcatchly.com/privacy.html>
- Chrome Web Store: <https://chromewebstore.google.com/detail/ogfdfheefhnmgkafcahpelmcofmgcobk>
- Submission package: `dist/catchly-v0.1.0.zip`

---

## Install

### From source (developer / reviewer)

1. Clone or download this repo.
2. Open `chrome://extensions/` in Chrome, Brave, or Edge.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select this folder.
5. Click the Catchly icon in the toolbar. The 3-screen
   onboarding plays on first open.
6. Open Settings → **Load sample data** for a 2-second tour.
7. When Chrome asks, **allow notifications** so renewal and
   trial reminders work.

### From the Chrome Web Store

Pending review at time of writing. Listing URL will be linked
here once approved.

---

## Screenshots, Verified Features & Demo

Everything listed below is functional code, not stubs. The
Playwright smoke suite in `tests/smoke.spec.js` exercises the
critical paths on every run.

| # | Feature | Where to see it |
|---|---|---|
| 1 | **Auto-detect at checkout** | Visit `netflix.com/signup`, `spotify.com/premium`, `chatgpt.com`, etc. — the in-page toast slides in. |
| 2 | **One-click manual add** | `+` icon in the popup header. Quick-pick known services or type any name. |
| 3 | **Smart reminders** | Configurable 1 / 3 / 7-day pre-renewal Chrome notifications (Settings → Notifications). |
| 4 | **Spending dashboard** | Subs tab — monthly / yearly / active-count summary strip, mixed-currency aware. |
| 5 | **Local-only storage** | Every value lives in `chrome.storage.local`. Never `chrome.storage.sync`. Verify in DevTools → Storage. |
| 6 | **Merchant normalization** | 20+ services in `lib/merchants.js` with aliases — "GOOGLE *YOUTUBE PREMIUM" maps cleanly to YouTube. |
| 7 | **Price-hike alerts** | Sample data includes a Netflix hike ($22.99 → $24.99) so the Alerts tab + drawer warning render immediately. |
| 8 | **Shadow-charge detector** | Sample data includes Audible: last-visited 87 days ago + renewing in 11d. Open its drawer to see the warning. |
| 9 | **Guided cancel** | Detail drawer → "Cancel this" deep-links to the service's cancellation page and lists the dark-pattern steps in plain English. |
| 10 | **Action-icon badge** | Pin the icon — badge shows days to most-urgent renewal, color-coded safe → soon → urgent → overdue. |
| 11 | **Duplicate detection** | Try tracking Netflix twice — Catchly offers "Update price" instead. |
| 12 | **Annual recap** | Insights tab — italic accent number is your annual run-rate. |
| 13 | **Renewal calendar** | Header calendar icon opens a 30-day drawer with day-by-day dots and a rolling "next 30 days" list. |
| 14 | **4 themes** | Editorial (default), Utility (high-contrast yellow), Dark, and System (follows OS). Settings → Appearance. |
| 15 | **First-run onboarding** | 3-screen welcome overlay on first install. Skippable. |
| 16 | **What's New info icon** | ⓘ button in the header — popover with upcoming features. Pulsing dot when there's an unseen update. |
| 17 | **Multi-currency** | USD, EUR, GBP, CAD, AUD, JPY, INR — totals shown separately so mixed portfolios don't produce garbage numbers. |
| 18 | **Import / export** | Settings → Advanced — full JSON export and re-import. Your data, your file. |

---

## Privacy architecture

The extension makes **zero outbound network calls during normal
use**. The one exception, and only if the user explicitly clicks:

- **Gmail-auto-scan waitlist signup.** Clicking "Notify me" on
  the optional waitlist surface POSTs the user's email plus a
  short source label, the extension version, and a
  dismissed-prompt count to a Cloudflare Worker. The worker code
  is in `worker/`. Email is stored in Cloudflare Workers KV keyed
  by timestamp. Full disclosure in §2.2 of
  <https://getcatchly.com/privacy>.

Beyond that — no analytics SDK, no crash reporter, no telemetry
beacon, no error logger, no usage ping. Brand logos that used to
load from a third-party CDN are now bundled in `logos/`
(committed Simple Icons SVGs) so even icon rendering doesn't
reach the network.

**Host permissions are a narrow 24-domain allowlist**, not
`<all_urls>`. The browser itself enforces that Catchly cannot run
on banks, brokerages, healthcare portals, payment processors,
identity providers, or government logins. See `manifest.json`
for the exhaustive list.

---

## Architecture (10,000-foot)

```
manifest.json          MV3 — permissions: storage, alarms,
                       notifications, tabs. host_permissions:
                       narrow 24-domain allowlist.
background.js          Service worker — alarms, badge,
                       notifications, message router, usage
                       tracking via chrome.tabs.onUpdated.
content.js / content.css
                       Runs only on the 24 allowlisted hosts;
                       detects subs, renders the in-page toast.
popup.html/.js/.css    Main dashboard — 4 tabs (Subs, Alerts,
                       Insights, Settings), drawers, modals,
                       calendar, onboarding, info-icon popover.
options.html/.js/.css  Settings + welcome screen.
theme-bootstrap.js     External theme-bootstrap script (MV3
                       blocks inline scripts).
lib/merchants.js       Service catalog with cancel URLs,
                       aliases, default prices, brand colors.
                       THE CONTENT MOAT.
lib/storage.js         chrome.storage.local wrapper, sample
                       seeder, schema-versioned migrate-on-read.
lib/utils.js           Formatting, date helpers, fmtMoney.
lib/waitlist.js        Opt-in waitlist state machine + endpoint.
icons/                 16, 32, 48, 128 PNG icons.
fonts/                 Bundled Inter, JetBrains Mono, Fraunces.
logos/                 Bundled brand-mark SVGs (Simple Icons).
worker/                Cloudflare Worker — waitlist signup
                       endpoint, KV-backed.
docs/                  GitHub Pages source for getcatchly.com
                       and getcatchly.com/privacy.
store-assets/          Chrome Web Store listing artwork +
                       paste-ready listing copy.
tests/smoke.spec.js    Playwright smoke suite — 22 tests across
                       boot, storage, brand-logo loading,
                       worker CORS, onboarding, What's New
                       popover, integration.
```

---

## Tests

```bash
npm install
npx playwright install --no-shell chromium
npm run test:smoke         # runs all 22 tests in ~18 s
npm run test:smoke:report  # opens the last HTML report
```

The suite runs against the unpacked extension in real Chromium
(headed — MV3 extensions need it). Output lands in `qa/`, which
is gitignored so test artifacts don't get committed.

---

## What this build deliberately does NOT do

So you don't go looking for things that aren't there:

- **No Gmail scan yet.** The interface to opt in to the waitlist
  for it ships now. The actual feature requires Gmail OAuth,
  Google app verification, and a second restricted-scope review —
  a v1.0 milestone, not v0.1.0.
- **No full cancel automation.** Catchly deep-links to each
  service's cancel page and lists the dark-pattern steps in
  plain English. It does not auto-click cancel buttons.
  Per-service automation breaks weekly when sites redesign —
  Rocket Money outsources this to humans and charges 30 – 60 % of
  "savings." Catchly is honest about being a guide.
- **No Plaid / bank linking.** The entire product wedge is "we
  don't touch your bank." This isn't a roadmap item; it's an
  anti-roadmap item.
- **No backend that holds your subscriptions.** No sync across
  devices, no team mode, no admin dashboard. All on-device. The
  Cloudflare Worker exists only for the optional Gmail-scan
  waitlist signup and never sees your subscriptions.
- **No pro tier yet.** Free forever for the core product. A
  flat-monthly Pro will eventually exist for the Gmail-scan +
  cancel-copilot features — never a percentage of "savings."

---

## Building the submission ZIP

```bash
rm -f dist/catchly-v0.1.0.zip
zip -r dist/catchly-v0.1.0.zip \
  manifest.json \
  background.js \
  popup.html popup.js popup.css \
  options.html options.js options.css \
  theme-bootstrap.js \
  content.js content.css \
  icons/ fonts/ lib/ logos/ \
  LICENSE \
  -x '*.DS_Store' \
  -x 'logos/appicon.png' \
  -x 'logos/icon-master-512.png' \
  -x 'logos/logo_transparent.png'
```

The ZIP excludes source-art masters and macOS metadata. It does
not include `docs/`, `worker/`, `store-assets/`, `qa/`, or
`tests/` — those aren't part of the shipped extension.

---

## Roadmap

Rough order, not commitments:

1. **Web Store approval** — in review now.
2. **Expand `lib/merchants.js`.** Each new entry takes about five
   minutes; this is the content moat.
3. **Gmail auto-scan (v1.0)** — opt-in, on-device parsing of
   receipt emails. Requires Gmail OAuth + restricted-scope
   review.
4. **Cancellation copilot** — guided one-click cancellation for
   the top 50 services.
5. **Family-plan splitting** — track which subs are shared and
   whose card they hit.

Every future feature will follow the same rule: local-first, no
data sold, no bank login required.

---

## Contributing & support

- Bug reports and feature requests:
  <https://github.com/Muzeeb1998/Catchly/issues>
- Privacy questions: `privacy@getcatchly.com`
- License: MIT (see `LICENSE`)
