// lib/product-detector.js
// Multi-strategy product detection & normalization engine (100% local, zero external APIs).
// Priority:
// 1. JSON-LD (<script type="application/ld+json"> Product / Offer / AggregateOffer)
// 2. OpenGraph & Meta tags (og:title, og:price:amount, product:price:amount, etc.)
// 3. Microdata (itemprop="name", itemprop="price", itemprop="priceCurrency")
// 4. Merchant-specific adapters (Amazon, Flipkart, Myntra, Croma, Apple, etc.)
// 5. DOM heuristics & Fallbacks

/**
 * Normalizes title by removing SEO suffixes, store names, and excess punctuation.
 */
export function normalizeTitle(rawTitle) {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/\s*[-|–|•:]\s*(Amazon\.[a-z.]+|Flipkart|Myntra|Croma|Nykaa|Ajio|Buy Online.*|Official Store.*)$/i, '')
    .replace(/\s*[:|–|-]\s*Buy\s+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts recognized brand from title or brand string.
 */
export function normalizeBrand(brandString, title = '') {
  const KNOWN_BRANDS = [
    'Apple', 'Sony', 'Samsung', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer',
    'OnePlus', 'Google', 'Xiaomi', 'Redmi', 'Realme', 'Motorola', 'Boat',
    'Noise', 'Boult', 'JBL', 'Bose', 'Sennheiser', 'Marshall', 'Logitech',
    'Nike', 'Adidas', 'Puma', 'Zara', 'H&M', 'Levi\'s', 'Fastrack',
    'Titan', 'Casio', 'Fossil', 'Dyson', 'LG', 'Whirlpool', 'Philips',
    'Canon', 'Nikon', 'PlayStation', 'Xbox', 'Nintendo', 'Anker'
  ];

  const searchTarget = `${brandString || ''} ${title}`;
  for (const b of KNOWN_BRANDS) {
    const re = new RegExp(`\\b${b}\\b`, 'i');
    if (re.test(searchTarget)) return b;
  }

  if (brandString && brandString.trim().length > 1) {
    let clean = brandString.trim()
      .replace(/\s*[,.]?\s*\b(Inc|LLC|Ltd|Corporation|Corp|Pvt Ltd|Co)\b.*$/i, '')
      .trim();
    if (!/unknown|brand|generic|n\/a/i.test(clean) && clean.length > 1) {
      return clean;
    }
  }

  return brandString ? brandString.trim() : 'Unknown';
}

/**
 * Extracts storage spec (e.g. 128GB, 256GB, 1TB).
 */
export function normalizeStorage(title = '') {
  const match = title.match(/\b(16|32|64|128|256|512)\s*(?:GB|gb)\b|\b([1-4])\s*(?:TB|tb)\b/i);
  if (!match) return null;
  return match[0].toUpperCase().replace(/\s+/g, '');
}

/**
 * Extracts common device colors.
 */
export function normalizeColor(title = '') {
  const COLORS = [
    'Space Black', 'Space Gray', 'Space Grey', 'Natural Titanium', 'Desert Titanium',
    'Black Titanium', 'White Titanium', 'Midnight', 'Starlight', 'Deep Purple',
    'Pacific Blue', 'Sierra Blue', 'Phantom Black', 'Graphite', 'Silver',
    'Gold', 'Rose Gold', 'Black', 'White', 'Blue', 'Red', 'Green', 'Yellow',
    'Purple', 'Orange', 'Coral', 'Beige', 'Grey', 'Gray', 'Charcoal'
  ];
  for (const c of COLORS) {
    const re = new RegExp(`\\b${c}\\b`, 'i');
    if (re.test(title)) return c;
  }
  return null;
}

/**
 * Generates a deterministic canonical product ID for local cross-matching.
 */
export function generateCanonicalProductId({ brand, title, gtin, asin, sku, model }) {
  if (gtin && String(gtin).trim().length >= 8) {
    return `gtin:${String(gtin).trim().toLowerCase()}`;
  }
  if (asin && String(asin).trim().length >= 8) {
    return `asin:${String(asin).trim().toUpperCase()}`;
  }
  if (sku && brand && brand !== 'Unknown') {
    const cleanSku = String(sku).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (cleanSku.length >= 4) {
      return `sku:${brand.toLowerCase()}:${cleanSku}`;
    }
  }

  // Deterministic slug: brand|model|storage|color
  const normBrand = normalizeBrand(brand, title).toLowerCase().replace(/[^a-z0-9]/g, '');
  const storage = normalizeStorage(title);
  const color = normalizeColor(title);
  
  // Clean title words (strip common noise words & brand)
  const tokens = normalizeTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t !== normBrand && !['with', 'and', 'for', 'the', 'new', 'edition', 'smart', 'wireless', 'original'].includes(t))
    .slice(0, 5);

  const parts = [normBrand || 'item', ...tokens];
  if (storage && !parts.includes(storage.toLowerCase())) parts.push(storage.toLowerCase());
  if (color && !parts.includes(color.toLowerCase().replace(/[^a-z0-9]/g, ''))) parts.push(color.toLowerCase().replace(/[^a-z0-9]/g, ''));

  return `norm:${parts.join('-')}`;
}

/**
 * Extracts JSON-LD structured data from document.
 */
export function extractJsonLd(doc = document) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script.textContent || '{}');
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
      
      for (const item of items) {
        if (!item) continue;
        const type = String(item['@type'] || '');
        if (type === 'Product' || type === 'IndividualProduct' || type.endsWith('/Product')) {
          const name = item.name || '';
          const brandObj = item.brand;
          const brand = typeof brandObj === 'string' ? brandObj : (brandObj?.name || '');
          const image = Array.isArray(item.image) ? item.image[0] : (item.image?.url || item.image || null);
          const sku = item.sku || null;
          const gtin = item.gtin13 || item.gtin12 || item.gtin8 || item.gtin || item.isbn || null;
          const mpn = item.mpn || null;

          let price = null;
          let originalPrice = null;
          let currency = 'INR';
          let availability = 'in_stock';
          let offerUrl = null;

          const rawOffers = item.offers;
          const offer = Array.isArray(rawOffers) ? rawOffers[0] : rawOffers;
          if (offer) {
            price = parseFloat(offer.price || offer.lowPrice || offer.highPrice);
            if (offer.priceCurrency) currency = offer.priceCurrency.toUpperCase();
            if (offer.availability) {
              const avail = String(offer.availability).toLowerCase();
              if (avail.includes('outofstock')) availability = 'out_of_stock';
              else if (avail.includes('instock') || avail.includes('preorder')) availability = 'in_stock';
            }
            if (offer.url) offerUrl = offer.url;
          }

          if (name && (price !== null && !isNaN(price))) {
            return {
              strategy: 'json-ld',
              title: normalizeTitle(name),
              rawTitle: name,
              brand: normalizeBrand(brand, name),
              price,
              originalPrice,
              currency,
              availability,
              image,
              sku,
              gtin,
              mpn,
              url: offerUrl || doc.location?.href || ''
            };
          }
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Extracts product metadata from OpenGraph and HTML meta tags.
 */
export function extractOpenGraph(doc = document) {
  const getMeta = (propNames) => {
    for (const p of propNames) {
      const el = doc.querySelector(`meta[property="${p}"], meta[name="${p}"]`);
      if (el && el.getAttribute('content')) {
        return el.getAttribute('content').trim();
      }
    }
    return null;
  };

  const title = getMeta(['og:title', 'twitter:title']);
  const priceStr = getMeta(['og:price:amount', 'product:price:amount', 'price']);
  const currency = getMeta(['og:price:currency', 'product:price:currency']) || 'INR';
  const image = getMeta(['og:image', 'twitter:image']);
  const brand = getMeta(['og:brand', 'product:brand', 'brand']);
  const avail = getMeta(['og:availability', 'product:availability']);

  const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : null;

  if (title && price && !isNaN(price)) {
    return {
      strategy: 'opengraph',
      title: normalizeTitle(title),
      rawTitle: title,
      brand: normalizeBrand(brand, title),
      price,
      originalPrice: null,
      currency: currency.toUpperCase(),
      availability: avail && /out\s*of\s*stock/i.test(avail) ? 'out_of_stock' : 'in_stock',
      image,
      sku: null,
      gtin: null,
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Extracts product data from HTML Microdata (itemprop attributes).
 */
export function extractMicrodata(doc = document) {
  const productScope = doc.querySelector('[itemscope][itemtype*="Product"]');
  if (!productScope) return null;

  const getProp = (name) => {
    const el = productScope.querySelector(`[itemprop="${name}"]`);
    if (!el) return null;
    return el.getAttribute('content') || el.innerText || el.getAttribute('src');
  };

  const name = getProp('name');
  const priceStr = getProp('price');
  const currency = getProp('priceCurrency') || 'INR';
  const brand = getProp('brand');
  const image = getProp('image');

  const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : null;

  if (name && price && !isNaN(price)) {
    return {
      strategy: 'microdata',
      title: normalizeTitle(name),
      rawTitle: name,
      brand: normalizeBrand(brand, name),
      price,
      originalPrice: null,
      currency: currency.toUpperCase(),
      availability: 'in_stock',
      image,
      sku: getProp('sku') || null,
      gtin: getProp('gtin13') || getProp('gtin') || null,
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Merchant-specific extraction adapter for Amazon (.in, .com, .co.uk, etc.)
 */
export function extractAmazon(doc = document) {
  const host = doc.location?.hostname || '';
  if (!host.includes('amazon.')) return null;

  const titleEl = doc.getElementById('productTitle') || doc.getElementById('title');
  if (!titleEl) return null;
  const rawTitle = titleEl.innerText.trim();

  // Price extraction
  let price = null;
  let originalPrice = null;

  // Modern price block
  const priceWhole = doc.querySelector('.priceToPay .a-price-whole, #corePriceDisplay_desktop_feature_div .a-price-whole, #corePrice_desktop .a-price-whole');
  const priceFraction = doc.querySelector('.priceToPay .a-price-fraction, #corePriceDisplay_desktop_feature_div .a-price-fraction');
  if (priceWhole) {
    const wholeStr = priceWhole.innerText.replace(/[^0-9]/g, '');
    const fracStr = priceFraction ? priceFraction.innerText.replace(/[^0-9]/g, '') : '00';
    price = parseFloat(`${wholeStr}.${fracStr}`);
  }

  // Fallback selectors
  if (!price || isNaN(price)) {
    const offscreen = doc.querySelector('#corePrice_desktop .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen');
    if (offscreen) {
      const match = offscreen.innerText.replace(/[^0-9.]/g, '');
      price = parseFloat(match);
    }
  }

  // MRP / Strikethrough price
  const mrpEl = doc.querySelector('.basisPrice .a-offscreen, #corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen, #basis-price');
  if (mrpEl) {
    const mrpMatch = mrpEl.innerText.replace(/[^0-9.]/g, '');
    const p = parseFloat(mrpMatch);
    if (!isNaN(p) && p > (price || 0)) originalPrice = p;
  }

  // ASIN
  let asin = null;
  const asinInput = doc.getElementById('ASIN');
  if (asinInput && asinInput.value) {
    asin = asinInput.value.trim();
  } else {
    const m = (doc.location?.pathname || '').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (m) asin = m[1];
  }

  // Brand
  let brand = 'Unknown';
  const byline = doc.getElementById('bylineInfo');
  if (byline) {
    brand = byline.innerText.replace(/^Brand:\s*|^Visit the\s*|\s*Store$/gi, '').trim();
  } else {
    const brandRow = doc.querySelector('.po-brand .a-span9');
    if (brandRow) brand = brandRow.innerText.trim();
  }

  // Image
  const imgEl = doc.getElementById('landingImage') || doc.getElementById('imgBlkFront');
  const image = imgEl ? (imgEl.getAttribute('data-old-hires') || imgEl.getAttribute('src')) : null;

  // Currency
  const currency = host.endsWith('.in') ? 'INR'
                 : host.endsWith('.co.uk') ? 'GBP'
                 : host.endsWith('.de') || host.endsWith('.fr') ? 'EUR'
                 : host.endsWith('.ca') ? 'CAD'
                 : 'USD';

  // Availability
  const availEl = doc.getElementById('availability');
  const isOutOfStock = availEl && /currently unavailable|out of stock/i.test(availEl.innerText);

  if (rawTitle && price && !isNaN(price)) {
    return {
      strategy: 'amazon-adapter',
      title: normalizeTitle(rawTitle),
      rawTitle,
      brand: normalizeBrand(brand, rawTitle),
      price,
      originalPrice,
      currency,
      availability: isOutOfStock ? 'out_of_stock' : 'in_stock',
      image,
      asin,
      sku: asin,
      gtin: null,
      merchant: 'Amazon',
      merchantKey: 'amazon',
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Merchant-specific extraction adapter for Flipkart
 */
export function extractFlipkart(doc = document) {
  const host = doc.location?.hostname || '';
  if (!host.includes('flipkart.com')) return null;

  const titleEl = doc.querySelector('span.B_NuCI, h1.VU-ZEz, h1.title-blade, span._35KyD6');
  if (!titleEl) return null;
  const rawTitle = titleEl.innerText.trim();

  // Price
  let price = null;
  let originalPrice = null;

  const priceEl = doc.querySelector('div._30jeq3._16Jk6d, div.Nx9bqj.CxhGGd, div._30jeq3');
  if (priceEl) {
    const p = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p)) price = p;
  }

  // MRP
  const mrpEl = doc.querySelector('div._3I9_wc._2p6lqe, div.yRaY8j.A6\\+E6v, div._3I9_wc');
  if (mrpEl) {
    const p = parseFloat(mrpEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > (price || 0)) originalPrice = p;
  }

  // Product ID / PID
  const urlObj = new URL(doc.location?.href || 'https://flipkart.com');
  const pid = urlObj.searchParams.get('pid') || null;

  // Brand
  let brand = 'Unknown';
  const brandEl = doc.querySelector('span.G6XhRU');
  if (brandEl) {
    brand = brandEl.innerText.trim();
  } else {
    brand = normalizeBrand(null, rawTitle);
  }

  // Image
  const imgEl = doc.querySelector('img._396cs4._2amPTt, img.DByuf4, img._2r_T1I');
  const image = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;

  if (rawTitle && price && !isNaN(price)) {
    return {
      strategy: 'flipkart-adapter',
      title: normalizeTitle(rawTitle),
      rawTitle,
      brand: normalizeBrand(brand, rawTitle),
      price,
      originalPrice,
      currency: 'INR',
      availability: doc.body.innerText.includes('Currently Out of Stock') ? 'out_of_stock' : 'in_stock',
      image,
      sku: pid,
      gtin: null,
      merchant: 'Flipkart',
      merchantKey: 'flipkart',
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Merchant-specific extraction adapter for Croma
 */
export function extractCroma(doc = document) {
  const host = doc.location?.hostname || '';
  if (!host.includes('croma.com')) return null;

  const titleEl = doc.querySelector('h1.pd-title, h1.cp-heading');
  if (!titleEl) return null;
  const rawTitle = titleEl.innerText.trim();

  let price = null;
  let originalPrice = null;

  const priceEl = doc.querySelector('.pd-price .amount, span.amount, .new-price');
  if (priceEl) {
    const p = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p)) price = p;
  }

  const mrpEl = doc.querySelector('.old-price, span.mrp');
  if (mrpEl) {
    const p = parseFloat(mrpEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > (price || 0)) originalPrice = p;
  }

  const imgEl = doc.querySelector('.product-image img, .pd-image-box img');
  const image = imgEl ? imgEl.getAttribute('src') : null;

  if (rawTitle && price && !isNaN(price)) {
    return {
      strategy: 'croma-adapter',
      title: normalizeTitle(rawTitle),
      rawTitle,
      brand: normalizeBrand(null, rawTitle),
      price,
      originalPrice,
      currency: 'INR',
      availability: 'in_stock',
      image,
      sku: null,
      gtin: null,
      merchant: 'Croma',
      merchantKey: 'croma',
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Merchant-specific extraction adapter for Myntra
 */
export function extractMyntra(doc = document) {
  const host = doc.location?.hostname || '';
  if (!host.includes('myntra.com')) return null;

  const brandEl = doc.querySelector('h1.pdp-title');
  const nameEl = doc.querySelector('h1.pdp-name');
  if (!brandEl && !nameEl) return null;

  const brand = brandEl ? brandEl.innerText.trim() : 'Unknown';
  const subName = nameEl ? nameEl.innerText.trim() : '';
  const rawTitle = `${brand} ${subName}`.trim();

  let price = null;
  let originalPrice = null;

  const priceEl = doc.querySelector('span.pdp-price strong');
  if (priceEl) {
    const p = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p)) price = p;
  }

  const mrpEl = doc.querySelector('span.pdp-mrp s');
  if (mrpEl) {
    const p = parseFloat(mrpEl.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(p) && p > (price || 0)) originalPrice = p;
  }

  const imgEl = doc.querySelector('.image-grid-image');
  let image = null;
  if (imgEl) {
    const bg = imgEl.style.backgroundImage;
    if (bg && bg.includes('url(')) {
      image = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    }
  }

  if (rawTitle && price && !isNaN(price)) {
    return {
      strategy: 'myntra-adapter',
      title: normalizeTitle(rawTitle),
      rawTitle,
      brand: normalizeBrand(brand, rawTitle),
      price,
      originalPrice,
      currency: 'INR',
      availability: 'in_stock',
      image,
      sku: null,
      gtin: null,
      merchant: 'Myntra',
      merchantKey: 'myntra',
      url: doc.location?.href || ''
    };
  }
  return null;
}

/**
 * Universal detector: executes extraction hierarchy and attaches canonical identifier.
 */
export function detectProduct(doc = document) {
  const host = doc.location?.hostname || '';

  // 1. Specific store adapters first when on known major retail domains
  if (host.includes('amazon.')) {
    const az = extractAmazon(doc);
    if (az) return finalizeProduct(az);
  }
  if (host.includes('flipkart.com')) {
    const fk = extractFlipkart(doc);
    if (fk) return finalizeProduct(fk);
  }
  if (host.includes('croma.com')) {
    const cr = extractCroma(doc);
    if (cr) return finalizeProduct(cr);
  }
  if (host.includes('myntra.com')) {
    const my = extractMyntra(doc);
    if (my) return finalizeProduct(my);
  }

  // 2. JSON-LD structured data
  const jsonLd = extractJsonLd(doc);
  if (jsonLd) {
    jsonLd.merchant = getMerchantNameFromHost(host);
    jsonLd.merchantKey = getMerchantKeyFromHost(host);
    return finalizeProduct(jsonLd);
  }

  // 3. OpenGraph tags
  const og = extractOpenGraph(doc);
  if (og) {
    og.merchant = getMerchantNameFromHost(host);
    og.merchantKey = getMerchantKeyFromHost(host);
    return finalizeProduct(og);
  }

  // 4. Microdata
  const micro = extractMicrodata(doc);
  if (micro) {
    micro.merchant = getMerchantNameFromHost(host);
    micro.merchantKey = getMerchantKeyFromHost(host);
    return finalizeProduct(micro);
  }

  return null;
}

function finalizeProduct(prod) {
  prod.canonicalProductId = generateCanonicalProductId(prod);
  prod.detectedAt = Date.now();
  return prod;
}

export function getMerchantNameFromHost(host = '') {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h.includes('amazon.')) return 'Amazon';
  if (h.includes('flipkart.com')) return 'Flipkart';
  if (h.includes('myntra.com')) return 'Myntra';
  if (h.includes('croma.com')) return 'Croma';
  if (h.includes('reliancedigital.in')) return 'Reliance Digital';
  if (h.includes('nykaa.com')) return 'Nykaa';
  if (h.includes('ajio.com')) return 'Ajio';
  if (h.includes('tatacliq.com')) return 'Tata CLiQ';
  if (h.includes('apple.com')) return 'Apple Store';
  if (h.includes('bestbuy.com')) return 'Best Buy';
  if (h.includes('walmart.com')) return 'Walmart';
  if (h.includes('target.com')) return 'Target';

  const parts = h.split('.');
  if (parts.length > 0) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return 'Store';
}

export function getMerchantKeyFromHost(host = '') {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h.includes('amazon.')) return 'amazon';
  if (h.includes('flipkart.com')) return 'flipkart';
  if (h.includes('myntra.com')) return 'myntra';
  if (h.includes('croma.com')) return 'croma';
  if (h.includes('reliancedigital.in')) return 'reliance';
  if (h.includes('nykaa.com')) return 'nykaa';
  if (h.includes('ajio.com')) return 'ajio';
  if (h.includes('tatacliq.com')) return 'tatacliq';
  if (h.includes('apple.com')) return 'apple';
  const parts = h.split('.');
  return parts[0] || 'store';
}
