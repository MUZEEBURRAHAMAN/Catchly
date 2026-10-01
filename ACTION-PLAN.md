# Catchly — SEO Action Plan & Roadmap

This action plan provides prioritized, step-by-step implementations to raise Catchly's SEO score from **49/100** to **95+/100**.

---

## Priority Matrix (Effort vs. Impact)

| Phase | Tasks | Target Score Impact | Implementation Time |
| :--- | :--- | :---: | :---: |
| **Phase 1: Quick Wins** | Meta tags, title optimization, canonical fix, image alt text | **+18 pts** (67/100) | Immediate (< 15 mins) |
| **Phase 2: Indexing & Crawlability** | Add `robots.txt`, `sitemap.xml`, and explicit robots meta | **+15 pts** (82/100) | Immediate (< 15 mins) |
| **Phase 3: Structured Data Schema** | Inject `SoftwareApplication`, `Organization`, and `WebSite` JSON-LD | **+12 pts** (94/100) | Immediate (< 20 mins) |
| **Phase 4: AI Engine Optimization** | Generate `llms.txt` and `llms-full.txt` for AI search crawlers | **+4 pts** (98/100) | Immediate (< 10 mins) |

---

## Step-by-Step Implementation Guide

### Task 1: Generate `docs/robots.txt`
Allow all reputable search and AI crawlers, specify crawl path, and declare the sitemap URI.

```txt
User-agent: *
Allow: /

# Priority AI Search Crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: https://getcatchly.com/sitemap.xml
```

### Task 2: Generate `docs/sitemap.xml`
Create standard XML sitemap listing canonical site URLs with `lastmod` and `changefreq`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://getcatchly.com/</loc>
    <lastmod>2026-10-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://getcatchly.com/privacy.html</loc>
    <lastmod>2026-10-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
```

### Task 3: Generate `docs/llms.txt` & `docs/llms-full.txt`
AI Search readiness format for ChatGPT, Claude, and Perplexity:

```markdown
# Catchly

> Catchly is a privacy-first, local-by-default Chrome extension that detects and tracks subscriptions, flags price hikes, and alerts you before renewal dates without requiring bank logins.

## Core Features
- Local-first architecture: all subscription data lives in Chrome local storage
- Sign-up & checkout detection on 24+ popular services
- Advance renewal reminders (1, 3, and 7-day notifications)
- Free-trial expiration countdowns
- Price hike detection and shadow charge warnings
- Quick 1-click cancellation links

## Priority URLs
- Website: https://getcatchly.com/
- Privacy Policy: https://getcatchly.com/privacy.html
- Chrome Web Store: https://chromewebstore.google.com/detail/ogfdfheefhnmgkafcahpelmcofmgcobk
- Source Code: https://github.com/Muzeeb1998/Catchly
```

### Task 4: Inject JSON-LD Structured Data Schema into `docs/index.html`
Add `SoftwareApplication`, `Organization`, and `WebSite` JSON-LD schemas.

### Task 5: Optimize On-Page Head Meta in `docs/index.html`
1. Title tag: `Catchly — Privacy Subscription Tracker Chrome Extension`
2. Meta description: `Catch forgotten subscriptions, track renewal dates, and flag price hikes locally in your browser. Private, free, and no bank login required.`
3. Social tags: Add missing `twitter:title`, `twitter:description`, `twitter:image`, and `og:site_name`.
4. Fix image `alt` attributes on all 4 `<img>` tags.
5. Fix `docs/privacy.html` canonical tag to `https://getcatchly.com/privacy.html`.
