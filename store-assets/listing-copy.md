# Chrome Web Store listing copy

Paste these strings verbatim into the corresponding fields in the
Chrome Web Store developer dashboard.

> **Note on brand names.** The Web Store rejected our first
> submission ("Yellow Argon" — Spam and Placement) because the
> public-facing **Detailed description** field enumerated brand
> names (Netflix, Spotify, etc.) as if for SEO. The new public
> description below uses category descriptors only (streaming,
> AI, productivity, news, design, storage). The non-public
> **Permission justification** fields on the Privacy tab DO
> still enumerate the 24 host domains by name — those are
> reviewer-only fields, not displayed on the listing page, and
> reviewers need the explicit list to verify the narrow
> allowlist claim.

---

## Short description (≤ 132 chars) — Store listing tab

```
Catch forgotten subscriptions, price hikes, and shadow charges — locally, in your browser. No bank login. No account.
```

*(119 characters)*

---

## Detailed description (≤ 16 000 chars) — Store listing tab

```
The subscriptions you forgot about are the ones costing you the most.

Catchly is a privacy-first subscription tracker that runs entirely inside your browser. It quietly watches signup confirmations, checkout pages, and renewal notices on the specific services it supports, then keeps an organized dashboard of every recurring charge. There is no bank login. There is no account required. Your financial data stays 100% on your device.

SINGLE PURPOSE

Catchly does one thing: detect, track, and warn you about recurring charges — subscriptions, free trials, contract notice deadlines, price hikes, and unused "shadow" services — locally, on the device you installed it on, with zero cloud backend.

WHAT CATCHLY DOES

- Auto-Detection at Checkout: Catches new subscription signups on supported streaming, AI, developer, and productivity services, plus modern checkout platforms (Stripe, Paddle, LemonSqueezy).
- Offline Bank Statement Importer (CSV): Upload an Apple Card, Chase, Amex, or bank statement export. Catchly scans descriptors offline in your browser to detect recurring subscriptions in seconds. Zero uploads.
- Side Panel Docking: Keep Catchly open alongside your active browsing tabs via Chrome's Side Panel (Chrome 114+) so your renewals and calendar are always a glance away.
- 1-Click Calendar Sync (.ics): Export a standard RFC 5545 .ics calendar with renewal alerts (1 day and 7 days prior) for Apple Calendar, Outlook, and Google Calendar, or click "Add to Google Calendar" from any subscription.
- Work vs. Personal Workspaces: Separate business and freelance expenses from personal subscriptions with dedicated filter pills and a 1-click Tax Write-off CSV export.
- Contract Notice Period Deadlines: Set contractual cancellation notice windows (7d, 14d, 30d, 60d) and receive urgent countdown alerts before your cancellation window closes.
- Free Trial Guardian & "Trial Ghost" Tips: Receive 24-hour warnings before free trials convert to paid charges, complete with cancellation coaching tips.
- Price Hike Detection: Spot price increases the day they appear on a renewal page, not weeks later on your bank statement.
- Shadow Charge Sweeps: Flags services you haven't opened in 30+ days that are quietly billing you in the background.
- Real-Time Multi-Currency Conversion: Switch between USD, EUR, GBP, CAD, AUD, JPY, and INR with instant FX conversion across all dashboard stats, categories, and subscriptions.
- 10-Second Manual Entry: Quick-pick grid for popular services or add any custom service with custom cycle, category, and direct cancellation link.

PRIVACY THAT ACTUALLY MEANS SOMETHING

Catchly runs entirely on your device:
✗ Does not connect to your bank (no Plaid, no bank credentials)
✗ Does not require an account, password, or sign-up
✗ Does not upload or sync your subscription data to any server
✗ Does not track your web browsing across the internet
✗ Does not contain analytics SDKs, telemetry beacons, crash reporters, or error loggers
✗ Does not load brand logos from third-party CDNs — every icon is bundled inside the extension
✗ Does not execute remote code or dynamic scripts

Every host permission is enumerated explicitly in the published manifest.json file. The browser enforces this allowlist at the platform level; Catchly cannot run on any banking, brokerage, healthcare, identity-provider, or government login page.

OPEN SOURCE — VERIFY EVERY CLAIM

Catchly is open source. Every claim in this listing is verifiable directly in the code:
https://github.com/Muzeeb1998/Catchly

PRICING

Catchly's core product is 100% free and private. No paywalled features, no subscriptions to track your subscriptions.

SUPPORT & CONTACT

Website: https://getcatchly.com
Privacy policy: https://getcatchly.com/privacy
Issues & feedback: https://github.com/Muzeeb1998/Catchly/issues
```

---

## Privacy tab — Single purpose description (≤ 1 000 chars)

```
Catchly's single purpose is to help users track recurring subscription charges without using a bank login, an account, or any cloud backend. The extension detects subscription sign-up and checkout pages on specific supported services and checkout platforms (Stripe, Paddle, LemonSqueezy) listed in the manifest's host_permissions, lets the user save subscriptions to chrome.storage.local, import offline bank statement CSVs, sync renewals to their calendar, separate work from personal expenses, and surfaces local-only renewal reminders, free-trial countdowns, notice deadlines, price-hike alerts, and shadow-charge warnings. Nothing else.
```

---

## Privacy tab — storage justification (≤ 1 000 chars)

```
The "storage" permission persists the user's saved subscription list, app settings, currency preference, workspace categorization, usage history (for the "haven't visited in X days" shadow-charge feature), and pending-capture queue to chrome.storage.local on the user's device. Every value the extension reads or writes lives in chrome.storage.local — never chrome.storage.sync — so user data never leaves the device. The extension is non-functional without this permission: subscriptions would be forgotten on every popup close, alarms could not be scheduled, and settings could not be restored. Implementation in lib/storage.js — source at https://github.com/Muzeeb1998/Catchly.
```

---

## Privacy tab — sidePanel justification (≤ 1 000 chars)

```
The "sidePanel" permission allows Catchly to open as a persistent companion inside Chrome's built-in Side Panel (Chrome 114+) when the user clicks the side panel toggle. This lets users reference their upcoming renewals, calendar, and active subscriptions side-by-side with their open browser tabs without the popup automatically closing upon clicking into the page.
```

---

## Privacy tab — alarms justification (≤ 1 000 chars)

```
The "alarms" permission schedules Chrome alarms that fire renewal reminder notifications at the user-configured offset before each subscription's next renewal (default 3 days; configurable to 1, 3, or 7 days, or any combination). Also used for the free-trial 24-hour-before-end alarm, a daily housekeeping alarm that runs the shadow-charge sweep and recomputes the action-icon badge, and an hourly badge-refresh alarm. There is no alternative MV3 API for scheduling background work at a future time — setTimeout does not survive service-worker termination. Used only by background.js.
```

---

## Privacy tab — notifications justification (≤ 1 000 chars)

```
The "notifications" permission displays Chrome desktop notifications when a subscription renewal is approaching, when a contract cancellation notice deadline is near, when a free trial is about to convert to paid, and when a shadow-charge sweep flags a subscription the user has not visited in the user-configured threshold of days (default 30). All notifications are generated and dispatched locally from the background service worker; the notification body never contains data fetched from a remote server. The user can disable any notification category in the Settings pane of the popup. Used only by background.js.
```

---

## Privacy tab — Host permission justification (≤ 1 000 chars)

> Reviewer-only field; not displayed on the public listing. Enumerating
> the domains here demonstrates the narrow-allowlist claim.

```
host_permissions declares a fixed allowlist of specific subscription-service domains and checkout platforms (netflix.com, spotify.com, disneyplus.com, max.com, hbomax.com, hulu.com, primevideo.com, youtube.com, music.apple.com, tv.apple.com, chatgpt.com, openai.com, claude.ai, anthropic.com, notion.so, notion.com, grammarly.com, dropbox.com, 1password.com, adobe.com, audible.com, nytimes.com, github.com, figma.com, checkout.stripe.com, paddle.com, lemonsqueezy.com). It is NOT <all_urls>. The content script (content.js) runs on these specific hosts to detect when the user lands on a subscription sign-up or checkout flow for a service Catchly recognizes — auto-detecting subscriptions at the moment of sign-up is the central value proposition. The browser enforces this allowlist at the platform level; Catchly cannot run on any other site, including banks, brokerages, healthcare, identity providers, or government logins.
```

---

## Privacy tab — Are you using remote code?

**Select: `○ No, I am not using remote code`**

Catchly bundles every JS file, every font, every brand icon. No external script tags, no CDN imports, no eval, no `new Function()`. The Cloudflare Worker call is data submission, not code execution.

---

## Privacy tab — Data usage section

**Check exactly one box:**

- ✅ **Personally identifiable information** (email — for the opt-in waitlist signup)

**Leave all others unchecked.**

**Check all three certifications:**

- ✅ I do not sell or transfer user data to third parties, outside of the approved use cases
- ✅ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ✅ I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## Privacy policy URL

```
https://getcatchly.com/privacy
```

---

## Store listing tab — additional fields

| Field | Value |
|---|---|
| Homepage URL | `https://getcatchly.com` |
| Support URL | `https://github.com/Muzeeb1998/Catchly/issues` |

---

## Category

- **Primary:** Productivity

## Language

English (only supported language at launch)

---

## Test instructions tab

**Credentials:** leave blank (Catchly has no login).

**Additional instructions (≤ 500 chars):**

```
Catchly has no login, no account, and no required setup — open the toolbar icon and you're in the dashboard.

Fastest path to verify functionality:
1. Click the Catchly icon → 3-screen onboarding shows on first run.
2. Settings tab → "Load sample data" populates the dashboard with example subs.
3. Visit netflix.com/signup/planform — the in-page detection toast appears.
4. Header calendar icon → 30-day renewal calendar drawer.

Source: https://github.com/Muzeeb1998/Catchly
```
