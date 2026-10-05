// content.js — runs on every page (document_idle).
// Detects subscription checkout / signup pages and surfaces a capture toast.
// Privacy: nothing leaves the browser. The capture only stores: service name,
// best-guess price, cycle, source URL. User must click "Track" to save.

(function () {
  if (window.__catchlyContentLoaded) return;
  window.__catchlyContentLoaded = true;

  // ---------- theme (Part C) ----------
  let __currentTheme = 'system';
  const __VALID_THEMES = { system: 1, editorial: 1, utility: 1, dark: 1 };
  try {
    chrome.storage.local.get('settings_v1', (res) => {
      const t = res && res.settings_v1 && res.settings_v1.theme;
      if (__VALID_THEMES[t]) __currentTheme = t;
      const open = __shadow?.getElementById('__catchly_toast');
      if (open) open.setAttribute('data-theme', __currentTheme);
      const offerEl = __shadow?.getElementById('__catchly_offer_widget');
      if (offerEl) offerEl.setAttribute('data-theme', __currentTheme);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings_v1?.newValue?.theme) {
        const t = changes.settings_v1.newValue.theme;
        if (__VALID_THEMES[t]) {
          __currentTheme = t;
          const open = __shadow?.getElementById('__catchly_toast');
          if (open) open.setAttribute('data-theme', __currentTheme);
          const offerEl = __shadow?.getElementById('__catchly_offer_widget');
          if (offerEl) offerEl.setAttribute('data-theme', __currentTheme);
        }
      }
    });
  } catch {}
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'theme_changed') return;
      if (__VALID_THEMES[msg.theme]) {
        __currentTheme = msg.theme;
        const open = __shadow?.getElementById('__catchly_toast');
        if (open) open.setAttribute('data-theme', __currentTheme);
        const offerEl = __shadow?.getElementById('__catchly_offer_widget');
        if (offerEl) offerEl.setAttribute('data-theme', __currentTheme);
      }
    });
  } catch {}

  // ---------- shadow root host ----------
  let __host = null;
  let __shadow = null;

  function getShadowRoot() {
    if (__shadow && __host && __host.isConnected) return __shadow;
    if (__host) __host.remove();
    __host = document.createElement('catchly-toast-host');
    __host.id = '__catchly_host';
    __host.style.all = 'initial';
    __host.style.position = 'fixed';
    __host.style.right = '0';
    __host.style.bottom = '0';
    __host.style.zIndex = '2147483647';
    __host.style.pointerEvents = 'none';

    __shadow = __host.attachShadow({ mode: 'open' });
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content.css');
    __shadow.appendChild(link);

    document.documentElement.appendChild(__host);
    return __shadow;
  }

  // ---------- detection ----------
  function looksLikeSubscriptionPage() {
    const text = (document.body && document.body.innerText || '').toLowerCase();
    if (!text || text.length < 50) return false;
    const triggers = [
      'free trial', 'start free trial', 'start your free trial',
      'start trial', 'subscribe now', 'start subscription',
      'recurring', 'billed monthly', 'per month', '/month',
      'billed yearly', 'per year', '/year', '/yr',
      'auto-renew', 'auto renew', 'first month free'
    ];
    let hits = 0;
    for (const t of triggers) if (text.includes(t)) hits++;
    return hits >= 2;
  }

  // Best-effort price extraction. Looks for "$X.XX/month" patterns.
  function guessPriceAndCycle() {
    const html = document.body ? document.body.innerText : '';
    const patterns = [
      /(?:US\$|\$|€|£)\s?(\d+(?:\.\d{1,2})?)\s*(?:\/|per\s+)\s*(month|mo|year|yr|week|wk)/i,
      /(\d+(?:\.\d{1,2})?)\s*(?:USD|EUR|GBP)\s*(?:\/|per\s+)\s*(month|mo|year|yr|week|wk)/i
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const amount = parseFloat(m[1]);
        const cycleRaw = m[2].toLowerCase();
        const cycle = /^y/.test(cycleRaw) ? 'yearly'
                    : /^w/.test(cycleRaw) ? 'weekly'
                    : 'monthly';
        return { amount, cycle };
      }
    }
    return null;
  }

  function guessIsTrial() {
    const text = (document.body && document.body.innerText || '').toLowerCase();
    return /free\s+trial|start\s+trial|first\s+month\s+free|try\s+free/i.test(text);
  }

  // ---------- toast UI (Shadow DOM Encapsulated) ----------
  function buildToast({ serviceName, amount, cycle, isTrial, color, serviceKey }) {
    const shadow = getShadowRoot();
    // Remove any prior toast
    const prior = shadow.getElementById('__catchly_toast');
    if (prior) prior.remove();

    const root = document.createElement('div');
    root.id = '__catchly_toast';
    root.className = 'catchly-toast';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Catchly — track this subscription?');
    root.setAttribute('data-theme', __currentTheme);

    const priceStr = amount ? `$${amount.toFixed(2)}/${cycle === 'yearly' ? 'yr' : cycle === 'weekly' ? 'wk' : 'mo'}` : '';
    const label = isTrial ? 'Free trial detected' : 'Subscription detected';
    const colorDot = color || '#0F1419';

    root.innerHTML = `
      <div class="catchly-toast-bar" style="background:${colorDot}"></div>
      <div class="catchly-toast-body">
        <div class="catchly-toast-eyebrow">${label}</div>
        <div class="catchly-toast-title">${escapeHtml(serviceName)}</div>
        ${priceStr ? `<div class="catchly-toast-price">${priceStr}${isTrial ? ' after trial' : ''}</div>` : ''}
        ${isTrial ? `<div class="catchly-toast-trial-tip" style="font-size:11px;line-height:1.3;color:#D97757;margin:4px 0 6px;font-weight:500;display:flex;align-items:flex-start;gap:4px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><span>Pro tip: Cancel immediately in account settings. You'll retain full access until trial ends without auto-charges.</span></div>` : ''}
        <div class="catchly-toast-actions">
          <button class="catchly-btn catchly-btn-primary" data-act="track">Track this</button>
          <button class="catchly-btn catchly-btn-ghost" data-act="dismiss">Not now</button>
        </div>
        <div class="catchly-toast-foot">Stays on your device. Nothing sent anywhere.</div>
      </div>
      <button class="catchly-toast-close" data-act="dismiss" aria-label="Close">×</button>
    `;
    shadow.appendChild(root);

    requestAnimationFrame(() => root.classList.add('catchly-toast-in'));

    // Auto-dismiss timer set below; dismiss() clears it so the manual-dismiss
    // path doesn't leave a 25s timeout firing on an already-removed node.
    let autoDismissTimer = null;
    const dismiss = () => {
      if (autoDismissTimer !== null) {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
      }
      root.classList.remove('catchly-toast-in');
      setTimeout(() => root.remove(), 250);
    };

    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute('data-act');
      if (act === 'dismiss') return dismiss();
      if (act === 'track') {
        const payload = {
          serviceKey,
          name: serviceName,
          amount: amount || 0,
          cycle: cycle || 'monthly',
          isTrial: !!isTrial,
          sourceUrl: location.href,
          color: colorDot
        };
        try {
          await chrome.runtime.sendMessage({ type: 'capture', payload });
          showToastConfirmation();
        } catch (err) {
          console.warn('[Catchly] capture failed', err);
        }
        dismiss();
      }
    });

    // Auto-dismiss after 25 seconds if untouched
    autoDismissTimer = setTimeout(dismiss, 25000);
  }

  function showToastConfirmation() {
    const shadow = getShadowRoot();
    const c = document.createElement('div');
    c.className = 'catchly-toast catchly-toast-confirm catchly-toast-in';
    c.setAttribute('data-theme', __currentTheme);
    c.innerHTML = `
      <div class="catchly-toast-bar" style="background:#3D8B5C"></div>
      <div class="catchly-toast-body">
        <div class="catchly-toast-title">Tracked.</div>
        <div class="catchly-toast-foot">Open the Catchly icon to view.</div>
      </div>`;
    shadow.appendChild(c);
    setTimeout(() => {
      c.classList.remove('catchly-toast-in');
      setTimeout(() => c.remove(), 250);
    }, 2500);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- service matching (subset of merchants.js, inlined for content script) ----------
  // Content scripts can't import ES modules from extension easily; we duplicate
  // a minimal lookup map here. Background still owns the canonical list.
  const KNOWN_DOMAINS = {
    'netflix.com': { key: 'netflix', name: 'Netflix', color: '#E50914' },
    'spotify.com': { key: 'spotify', name: 'Spotify', color: '#1DB954' },
    'disneyplus.com': { key: 'disneyplus', name: 'Disney+', color: '#0E47A1' },
    'max.com': { key: 'max', name: 'Max (HBO)', color: '#002BE7' },
    'hbomax.com': { key: 'max', name: 'Max (HBO)', color: '#002BE7' },
    'hulu.com': { key: 'hulu', name: 'Hulu', color: '#1CE783' },
    'primevideo.com': { key: 'primevideo', name: 'Amazon Prime Video', color: '#FF9900' },
    'music.apple.com': { key: 'applemusic', name: 'Apple Music', color: '#FA243C' },
    'tv.apple.com': { key: 'appletv', name: 'Apple TV+', color: '#000000' },
    'youtube.com': { key: 'youtubepremium', name: 'YouTube Premium', color: '#FF0000' },
    'chatgpt.com': { key: 'chatgpt', name: 'ChatGPT Plus', color: '#10A37F' },
    'openai.com': { key: 'chatgpt', name: 'ChatGPT Plus', color: '#10A37F' },
    'claude.ai': { key: 'claude', name: 'Claude Pro', color: '#D97757' },
    'anthropic.com': { key: 'claude', name: 'Claude Pro', color: '#D97757' },
    'notion.so': { key: 'notion', name: 'Notion', color: '#000000' },
    'notion.com': { key: 'notion', name: 'Notion', color: '#000000' },
    'grammarly.com': { key: 'grammarly', name: 'Grammarly Premium', color: '#15C39A' },
    'dropbox.com': { key: 'dropbox', name: 'Dropbox', color: '#0061FF' },
    '1password.com': { key: 'onepassword', name: '1Password', color: '#0572EC' },
    'adobe.com': { key: 'adobecc', name: 'Adobe Creative Cloud', color: '#FA0F00' },
    'audible.com': { key: 'audible', name: 'Audible', color: '#F8991C' },
    'nytimes.com': { key: 'nyt', name: 'New York Times', color: '#000000' },
    'github.com': { key: 'github', name: 'GitHub', color: '#181717' },
    'figma.com': { key: 'figma', name: 'Figma', color: '#F24E1E' }
  };

  function identifyService() {
    const host = location.hostname.replace(/^www\./, '');
    for (const [d, svc] of Object.entries(KNOWN_DOMAINS)) {
      if (host === d || host.endsWith('.' + d)) return svc;
    }
    // Fall back to page title
    const title = (document.title || '').toLowerCase();
    for (const [, svc] of Object.entries(KNOWN_DOMAINS)) {
      if (title.includes(svc.name.toLowerCase())) return svc;
    }
    return null;
  }

  // ---------- main ----------
  async function detectionEnabled() {
    try {
      const res = await chrome.storage.local.get('settings_v1');
      const s = res.settings_v1 || {};
      return s.detectOnPages !== false; // default on
    } catch {
      return true;
    }
  }

  async function maybeTrigger() {
    if (!(await detectionEnabled())) return;
    if (!looksLikeSubscriptionPage()) return;
    let svc = identifyService();
    let name = svc ? svc.name : null;
    let color = svc ? svc.color : '#1B5BFF';
    let serviceKey = svc ? svc.key : null;

    if (!svc) {
      // Universal detection on checkout platforms or confirmation pages
      const isCheckoutPlatform = /stripe\.com|paddle\.com|lemonsqueezy\.com|shopify\.com/i.test(location.hostname);
      const bodyText = (document.body && document.body.innerText) || '';
      const isConfirmation = /thank\s*you|confirmed|receipt|subscription\s*activated|welcome\s*to/i.test(document.title + ' ' + bodyText);
      if (isCheckoutPlatform || isConfirmation) {
        const rawTitle = document.title.split(/[-|–:•]/)[0].trim();
        name = (rawTitle.length >= 3 && rawTitle.length <= 30) ? rawTitle : location.hostname.replace(/^www\./, '').split('.')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
      } else {
        return;
      }
    }

    const price = guessPriceAndCycle();
    const isTrial = guessIsTrial();
    buildToast({
      serviceName: name,
      serviceKey: serviceKey,
      color: color,
      amount: price ? price.amount : null,
      cycle: price ? price.cycle : 'monthly',
      isTrial
    });
  }

  // ==========================================================================
  // CATCHLY BEST OFFER ENGINE (IN-PAGE CLIENT)
  // 100% on-device, local-first. Master Plan §2, §3, §7, §8, §10, §24
  // ==========================================================================

  let __hasTriggeredOffer = false;

  function fmtCurrency(val, cur = 'INR') {
    const symbols = { USD: '$', EUR: '€', GBP: '£', INR: '₹', CAD: 'CA$', AUD: 'A$', JPY: '¥' };
    const sym = symbols[cur] || cur + ' ';
    return `${sym}${Math.round(val).toLocaleString()}`;
  }

  function detectInPageProduct() {
    const host = location.hostname.toLowerCase().replace(/^www\./, '');
    const href = location.href;

    // --- Amazon Adapter ---
    if (host.includes('amazon.')) {
      const titleEl = document.getElementById('productTitle') || document.getElementById('title');
      if (titleEl) {
        const rawTitle = titleEl.innerText.trim();
        let price = null;
        let originalPrice = null;

        const priceWhole = document.querySelector('.priceToPay .a-price-whole, #corePriceDisplay_desktop_feature_div .a-price-whole, #corePrice_desktop .a-price-whole');
        const priceFraction = document.querySelector('.priceToPay .a-price-fraction, #corePriceDisplay_desktop_feature_div .a-price-fraction');
        if (priceWhole) {
          const w = priceWhole.innerText.replace(/[^0-9]/g, '');
          const f = priceFraction ? priceFraction.innerText.replace(/[^0-9]/g, '') : '00';
          price = parseFloat(`${w}.${f}`);
        }
        if (!price || isNaN(price)) {
          const off = document.querySelector('#corePrice_desktop .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen');
          if (off) price = parseFloat(off.innerText.replace(/[^0-9.]/g, ''));
        }

        const mrpEl = document.querySelector('.basisPrice .a-offscreen, #corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen, #basis-price');
        if (mrpEl) {
          const m = parseFloat(mrpEl.innerText.replace(/[^0-9.]/g, ''));
          if (!isNaN(m) && m > (price || 0)) originalPrice = m;
        }

        let asin = null;
        const asinInput = document.getElementById('ASIN');
        if (asinInput && asinInput.value) asin = asinInput.value.trim();
        else {
          const m = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
          if (m) asin = m[1];
        }

        let brand = 'Unknown';
        const byline = document.getElementById('bylineInfo');
        if (byline) brand = byline.innerText.replace(/^Brand:\s*|^Visit the\s*|\s*Store$/gi, '').trim();

        const imgEl = document.getElementById('landingImage') || document.getElementById('imgBlkFront');
        const image = imgEl ? (imgEl.getAttribute('data-old-hires') || imgEl.getAttribute('src')) : null;
        const currency = host.endsWith('.in') ? 'INR' : host.endsWith('.co.uk') ? 'GBP' : 'USD';

        if (price && !isNaN(price)) {
          return {
            title: rawTitle.replace(/\s*[-|–]\s*Amazon.*$/i, '').trim(),
            rawTitle,
            brand: brand || 'Store',
            price,
            originalPrice,
            currency,
            image,
            asin,
            sku: asin,
            canonicalProductId: asin ? `asin:${asin}` : `amazon:${rawTitle.slice(0, 30)}`,
            merchant: 'Amazon',
            merchantKey: 'amazon',
            url: href
          };
        }
      }
    }

    // --- Flipkart Adapter ---
    if (host.includes('flipkart.com')) {
      const titleEl = document.querySelector('span.B_NuCI, h1.VU-ZEz, h1.title-blade');
      if (titleEl) {
        const rawTitle = titleEl.innerText.trim();
        let price = null;
        let originalPrice = null;

        const pEl = document.querySelector('div._30jeq3._16Jk6d, div.Nx9bqj.CxhGGd, div._30jeq3');
        if (pEl) price = parseFloat(pEl.innerText.replace(/[^0-9.]/g, ''));

        const mEl = document.querySelector('div._3I9_wc._2p6lqe, div.yRaY8j.A6\\+E6v');
        if (mEl) {
          const m = parseFloat(mEl.innerText.replace(/[^0-9.]/g, ''));
          if (!isNaN(m) && m > (price || 0)) originalPrice = m;
        }

        const brandEl = document.querySelector('span.G6XhRU');
        const brand = brandEl ? brandEl.innerText.trim() : 'Store';
        const imgEl = document.querySelector('img._396cs4._2amPTt, img.DByuf4');
        const image = imgEl ? imgEl.getAttribute('src') : null;

        const urlObj = new URL(href);
        const pid = urlObj.searchParams.get('pid') || null;

        if (price && !isNaN(price)) {
          return {
            title: rawTitle.replace(/\s*[-|–]\s*Flipkart.*$/i, '').trim(),
            rawTitle,
            brand,
            price,
            originalPrice,
            currency: 'INR',
            image,
            sku: pid,
            canonicalProductId: pid ? `flipkart:${pid}` : `flipkart:${rawTitle.slice(0, 30)}`,
            merchant: 'Flipkart',
            merchantKey: 'flipkart',
            url: href
          };
        }
      }
    }

    // --- JSON-LD fallback for generic e-commerce sites ---
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent || '{}');
        const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
        for (const item of items) {
          if (!item) continue;
          const type = String(item['@type'] || '');
          if (type === 'Product' || type.endsWith('/Product')) {
            const name = item.name || '';
            const rawOffers = item.offers;
            const offer = Array.isArray(rawOffers) ? rawOffers[0] : rawOffers;
            if (offer && (offer.price || offer.lowPrice)) {
              const price = parseFloat(offer.price || offer.lowPrice);
              const currency = offer.priceCurrency ? offer.priceCurrency.toUpperCase() : 'INR';
              const image = Array.isArray(item.image) ? item.image[0] : (item.image?.url || item.image);
              const brand = typeof item.brand === 'string' ? item.brand : (item.brand?.name || 'Store');
              const gtin = item.gtin13 || item.gtin || item.sku || null;

              if (name && price && !isNaN(price)) {
                return {
                  title: name,
                  rawTitle: name,
                  brand,
                  price,
                  originalPrice: null,
                  currency,
                  image,
                  sku: item.sku || null,
                  canonicalProductId: gtin ? `gtin:${gtin}` : `norm:${brand}-${name.slice(0, 25).replace(/[^a-z0-9]/gi, '')}`,
                  merchant: host.split('.')[0].toUpperCase(),
                  merchantKey: host.split('.')[0].toLowerCase(),
                  url: href
                };
              }
            }
          }
        }
      } catch {}
    }

    return null;
  }

  function detectInPageOffers(basePrice) {
    const offers = [];

    // Coupon detection
    const azCoupon = document.getElementById('couponBadge') || document.querySelector('.couponBadge, #vpcButton, label[for*="coupon"]');
    if (azCoupon) {
      const text = azCoupon.innerText || '';
      const m = text.match(/(?:Save|Apply|₹|\$)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:coupon|voucher|off)/i);
      const pctMatch = text.match(/(\d+)%\s*(?:coupon|voucher|off)/i);
      if (m) {
        const amt = parseFloat(m[1].replace(/,/g, ''));
        if (amt > 0 && amt < basePrice) {
          offers.push({ type: 'coupon', title: 'Clip Coupon', amount: amt, tier: 'guaranteed' });
        }
      } else if (pctMatch) {
        const pct = parseInt(pctMatch[1], 10);
        const amt = Math.round((basePrice * pct) / 100);
        offers.push({ type: 'coupon', title: `${pct}% Clip Coupon`, amount: amt, tier: 'guaranteed' });
      }
    }

    // Bank offers
    const bodyText = (document.body && document.body.innerText) || '';
    const bankMatches = bodyText.match(/(?:SBI|HDFC|ICICI|Axis|Kotak|Amex|Federal)\s*(?:Bank)?\s*(?:Credit|Debit)?\s*Card[^\n]{0,80}/gi) || [];
    for (const raw of bankMatches.slice(0, 3)) {
      const flat = raw.match(/(?:Flat\s*)?(?:₹|\$)\s*([\d,]+)\s*(?:Off|Discount)/i);
      const pct = raw.match(/(\d+)%\s*(?:Instant\s*)?Discount/i);
      let amt = 0;
      if (flat) amt = parseFloat(flat[1].replace(/,/g, ''));
      else if (pct) {
        const p = parseInt(pct[1], 10);
        amt = Math.min(Math.round((basePrice * p) / 100), 2000);
      }
      if (amt > 0 && amt < basePrice) {
        const bankName = raw.split(/[\s,]/)[0].toUpperCase();
        offers.push({
          type: 'bank_discount',
          title: `${bankName} Card Offer`,
          amount: amt,
          tier: 'conditional'
        });
        break; // Keep best bank offer
      }
    }

    // Cashback
    if (/amazon pay|flipkart axis/i.test(bodyText)) {
      const cbAmt = Math.round(basePrice * 0.05);
      if (cbAmt > 50 && cbAmt <= 1500) {
        offers.push({ type: 'cashback', title: '5% Cashback', amount: cbAmt, tier: 'potential' });
      }
    }

    // Free delivery check
    const isFreeDelivery = /free\s+delivery|free\s+shipping/i.test(bodyText);

    return {
      offers,
      isFreeDelivery
    };
  }

  function renderBestOfferWidget({ product, bestOffer, buyWait }) {
    const shadow = getShadowRoot();
    const existing = shadow.getElementById('__catchly_offer_widget');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = '__catchly_offer_widget';
    root.className = 'catchly-offer-widget';
    root.setAttribute('data-theme', __currentTheme);

    const cur = product.currency || 'INR';
    const effectiveStr = fmtCurrency(bestOffer.potentialEffectivePrice, cur);
    const baseStr = fmtCurrency(product.price, cur);
    const saveStr = bestOffer.totalSavings > 0 ? fmtCurrency(bestOffer.totalSavings, cur) : null;

    // Render collapsed pill initially, expandable to full card
    root.innerHTML = `
      <!-- Collapsed Pill -->
      <div class="catchly-offer-pill" id="__catchly_pill" title="Click to view Best Offer breakdown">
        <img class="catchly-pill-logo" src="${chrome.runtime.getURL('icons/icon32.png')}" alt="" />
        <span class="catchly-pill-tag">Best Offer</span>
        <span class="catchly-pill-price">${effectiveStr}</span>
        ${saveStr ? `<span class="catchly-pill-save">Save ${saveStr}</span>` : ''}
        <button class="catchly-pill-close" data-offer-act="dismiss" aria-label="Dismiss">×</button>
      </div>

      <!-- Expanded Card -->
      <div class="catchly-offer-card" id="__catchly_card" style="display:none;">
        <header class="catchly-card-head">
          <div class="catchly-card-brand">
            <img src="${chrome.runtime.getURL('icons/icon32.png')}" width="16" height="16" alt="" style="border-radius:3px;" />
            <span>Catchly Best Offer</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="catchly-card-merchant-badge">${escapeHtml(product.merchant || 'Store')}</span>
            <button class="catchly-card-close" data-offer-act="collapse" aria-label="Collapse">▾</button>
          </div>
        </header>

        <div class="catchly-card-body">
          <div class="catchly-product-title">${escapeHtml(product.title)}</div>

          <div class="catchly-price-hero">
            <div>
              <span class="catchly-effective-price">${effectiveStr}</span>
              ${saveStr ? `<span class="catchly-base-strike">${baseStr}</span>` : ''}
            </div>
            ${saveStr ? `<span class="catchly-savings-chip">Save ${saveStr}</span>` : ''}
          </div>

          <div class="catchly-offer-list">
            ${bestOffer.appliedOffers.map(o => `
              <div class="catchly-offer-item">
                <div class="catchly-offer-item-left">
                  <span class="catchly-check-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span>${escapeHtml(o.title)}</span>
                </div>
                <div class="catchly-offer-item-right">-${fmtCurrency(o.amount, cur)}</div>
              </div>
            `).join('')}
            ${bestOffer.isFreeDelivery ? `
              <div class="catchly-offer-item">
                <div class="catchly-offer-item-left">
                  <span class="catchly-check-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                  <span>Free Delivery</span>
                </div>
                <div class="catchly-offer-item-right" style="color:var(--o-muted);">Included</div>
              </div>
            ` : ''}
          </div>

          <div class="catchly-verdict-box ${buyWait.badgeClass}">
            <span>${buyWait.label}</span>
            <span style="opacity:0.85;font-size:10.5px;">&bull; ${escapeHtml(buyWait.summary)}</span>
          </div>

          <!-- In-Page Cross Store Comparison Section -->
          <div class="catchly-compare-section" id="__catchly_compare_section" style="display:none;">
            <div class="catchly-compare-head">
              <span>Compare Across Stores</span>
              <span style="font-size:9px;color:var(--o-success);">Live</span>
            </div>
            <div class="catchly-compare-list" id="__catchly_compare_list"></div>
          </div>

          <div class="catchly-card-actions">
            <button class="catchly-cta-btn catchly-cta-primary" data-offer-act="save-deal">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Confirm Deal</span>
            </button>
            <button class="catchly-cta-btn catchly-cta-secondary" data-offer-act="track-price">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              <span>Track Price</span>
            </button>
          </div>

          <div class="catchly-card-foot">
            Zero external data sent. 100% on-device local intelligence.
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(root);

    const pill = root.querySelector('#__catchly_pill');
    const card = root.querySelector('#__catchly_card');

    // Asynchronously fetch competitor store prices
    try {
      chrome.runtime.sendMessage(
        {
          type: 'get_cross_store_comparison',
          product: {
            ...product,
            effectivePrice: bestOffer.potentialEffectivePrice
          }
        },
        (res) => {
          const comp = res?.comparison;
          if (!comp || !comp.allStores || comp.allStores.length < 2) return;
          const section = card.querySelector('#__catchly_compare_section');
          const list = card.querySelector('#__catchly_compare_list');
          if (!section || !list) return;

          section.style.display = 'flex';
          list.innerHTML = comp.allStores.map(store => {
            const isBest = store.price === comp.allStores[0].price;
            return `
              <div class="catchly-compare-row ${isBest ? 'is-best-store' : ''}">
                <div class="catchly-compare-left">
                  <span class="catchly-store-dot ${isBest ? 'is-best' : ''}"></span>
                  <span>${escapeHtml(store.merchant)}</span>
                  ${store.isCurrent ? '<span style="font-size:10px;color:var(--o-muted);font-weight:500;">(Current)</span>' : ''}
                  ${!store.isCurrent && store.savingsVsCurrent > 50 ? `<span style="font-size:10px;color:var(--o-success);font-weight:600;">Save ${fmtCurrency(store.savingsVsCurrent, cur)}</span>` : ''}
                </div>
                <div class="catchly-compare-right">
                  <span class="catchly-compare-price">${fmtCurrency(store.price, cur)}</span>
                  ${!store.isCurrent && store.url ? `<a href="${escapeHtml(store.url)}" target="_blank" rel="noopener noreferrer" class="catchly-compare-link">View ↗</a>` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      );
    } catch {}

    pill.addEventListener('click', (e) => {
      const act = e.target?.getAttribute('data-offer-act');
      if (act === 'dismiss') {
        root.remove();
        return;
      }
      pill.style.display = 'none';
      card.style.display = 'block';
      requestAnimationFrame(() => card.classList.add('catchly-in'));
    });

    card.addEventListener('click', async (e) => {
      const t = e.target;
      const act = t?.getAttribute('data-offer-act');
      if (act === 'collapse') {
        card.classList.remove('catchly-in');
        setTimeout(() => {
          card.style.display = 'none';
          pill.style.display = 'flex';
        }, 150);
      } else if (act === 'track-price') {
        t.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>Tracking';
        t.style.pointerEvents = 'none';
        chrome.runtime.sendMessage({
          type: 'add_to_watchlist',
          payload: {
            ...product,
            effectivePrice: bestOffer.potentialEffectivePrice
          }
        });
      } else if (act === 'save-deal') {
        t.innerText = 'Saved!';
        t.style.pointerEvents = 'none';
        chrome.runtime.sendMessage({
          type: 'record_savings',
          payload: {
            productId: product.canonicalProductId,
            title: product.title,
            merchant: product.merchant,
            originalPrice: product.price,
            finalPrice: bestOffer.potentialEffectivePrice,
            savings: bestOffer.totalSavings,
            currency: cur
          }
        });
      }
    });
  }

  async function maybeTriggerBestOffer() {
    const prod = detectInPageProduct();
    if (!prod) return;

    const offerResult = detectInPageOffers(prod.price);
    const offers = offerResult.offers;

    let guaranteedSavings = 0;
    let conditionalSavings = 0;
    let potentialSavings = 0;

    for (const o of offers) {
      if (o.tier === 'guaranteed') guaranteedSavings += o.amount;
      else if (o.tier === 'conditional') conditionalSavings += o.amount;
      else if (o.tier === 'potential') potentialSavings += o.amount;
    }

    const totalSavings = guaranteedSavings + conditionalSavings + potentialSavings;
    const guaranteedEffectivePrice = Math.max(0, prod.price - guaranteedSavings);
    const potentialEffectivePrice = Math.max(0, prod.price - totalSavings);

    const bestOffer = {
      basePrice: prod.price,
      guaranteedSavings,
      conditionalSavings,
      potentialSavings,
      totalSavings,
      guaranteedEffectivePrice,
      potentialEffectivePrice,
      isFreeDelivery: offerResult.isFreeDelivery,
      appliedOffers: offers
    };

    // Save observation & sync active offer to background
    try {
      chrome.runtime.sendMessage({
        type: 'record_price_observation',
        payload: {
          ...prod,
          effectivePrice: potentialEffectivePrice
        }
      });
      chrome.runtime.sendMessage({
        type: 'set_active_offer',
        payload: {
          product: prod,
          bestOffer,
          observedAt: Date.now()
        }
      });
    } catch {}

    // Evaluate Buy vs Wait
    let buyWait = {
      verdict: 'good',
      label: 'Good Time to Buy',
      badgeClass: 'deal-good',
      summary: totalSavings > 0 ? `Save ${fmtCurrency(totalSavings, prod.currency)} with detected offers` : 'Best verified current price'
    };

    try {
      chrome.runtime.sendMessage(
        { type: 'get_price_history', canonicalProductId: prod.canonicalProductId },
        (res) => {
          const hist = res?.history || [];
          if (hist.length >= 2) {
            const prices = hist.map(h => h.effectivePrice || h.price).filter(p => p > 0);
            const sum = prices.reduce((a, b) => a + b, 0);
            const avg = Math.round(sum / prices.length);
            const diffPct = Math.round(((avg - potentialEffectivePrice) / avg) * 100);
            if (diffPct >= 10) {
              buyWait = {
                verdict: 'excellent',
                label: 'Excellent Deal',
                badgeClass: 'deal-excellent',
                summary: `${diffPct}% below recent average (${fmtCurrency(avg, prod.currency)})`
              };
            } else if (diffPct <= -5) {
              buyWait = {
                verdict: 'wait',
                label: "I'd Wait",
                badgeClass: 'deal-wait',
                summary: `Price is ${Math.abs(diffPct)}% above recent average (${fmtCurrency(avg, prod.currency)})`
              };
            }
          }
          renderBestOfferWidget({ product: prod, bestOffer, buyWait });
        }
      );
    } catch {
      renderBestOfferWidget({ product: prod, bestOffer, buyWait });
    }
  }

  function recordPageVisit() {
    const svc = identifyService();
    if (svc) {
      try {
        chrome.runtime.sendMessage({ type: 'usage', serviceKey: svc.key });
      } catch {}
    }
  }

  // Run after a short delay so dynamic content has time to render.
  setTimeout(() => {
    recordPageVisit();
    maybeTrigger();
    maybeTriggerBestOffer();
  }, 1500);

  // Re-check on SPA-style navigation
  let lastHref = location.href;
  const onUrlChange = () => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    setTimeout(() => {
      recordPageVisit();
      maybeTrigger();
      maybeTriggerBestOffer();
    }, 1500);
  };
  const wrap = (k) => {
    const orig = history[k];
    history[k] = function () {
      const r = orig.apply(this, arguments);
      onUrlChange();
      return r;
    };
  };
  try { wrap('pushState'); wrap('replaceState'); } catch {}
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
})();
