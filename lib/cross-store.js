// lib/cross-store.js
// Multi-Store Price Comparison Engine (100% on-device, zero external paid APIs).
// Queries alternative platforms (Amazon, Flipkart, Croma) in the background to find
// the best offer across stores and provides direct comparison with 1-click links.

/**
 * Builds clean search terms from a product title and brand.
 * e.g., "Apple iPhone 15 (Blue, 128 GB) - Buy Online at Amazon.in" -> "Apple iPhone 15 128GB"
 */
export function buildSearchQuery(product = {}) {
  const brand = (product.brand && product.brand !== 'Unknown') ? product.brand : '';
  const title = product.title || '';

  // Extract storage if present (e.g., 128GB, 256GB)
  const storageMatch = title.match(/\b(16|32|64|128|256|512)\s*(?:GB|gb)\b|\b([1-4])\s*(?:TB|tb)\b/i);
  const storage = storageMatch ? storageMatch[0].toUpperCase().replace(/\s+/g, '') : '';

  // Clean title words (strip noise and punctuation)
  const cleanTokens = title
    .replace(/\s*[-|–|•:]\s*(Amazon\.[a-z.]+|Flipkart|Myntra|Croma|Nykaa|Ajio|Buy Online.*)$/i, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !['with', 'and', 'for', 'the', 'new', 'edition', 'smart', 'wireless', 'original', 'online', 'buy', 'price'].includes(t.toLowerCase()))
    .slice(0, 4);

  const queryParts = [];
  if (brand && !cleanTokens.map(t => t.toLowerCase()).includes(brand.toLowerCase())) {
    queryParts.push(brand);
  }
  queryParts.push(...cleanTokens);
  if (storage && !queryParts.map(t => t.toLowerCase()).includes(storage.toLowerCase())) {
    queryParts.push(storage);
  }

  return queryParts.join(' ').trim();
}

/**
 * Computes fuzzy match score (0.0 to 1.0) between target query and candidate title.
 */
export function computeMatchScore(query, candidateTitle) {
  if (!query || !candidateTitle) return 0;
  const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  const cText = candidateTitle.toLowerCase();

  let hits = 0;
  for (const token of qTokens) {
    if (cText.includes(token)) hits++;
  }
  return hits / qTokens.length;
}

/**
 * Searches Flipkart public search HTML for alternative product price.
 */
export async function searchFlipkart(searchQuery) {
  try {
    const q = encodeURIComponent(searchQuery);
    const url = `https://www.flipkart.com/search?q=${q}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Match product card with /p/itm and price
    const regex = /href=\"(\/[^\"]+\/p\/itm[^\"]+)\"[^>]*>.*?alt=\"([^\"]+)\"/gs;
    let match;
    let bestCandidate = null;

    while ((match = regex.exec(html)) !== null) {
      const cardHref = match[1];
      const cardTitle = match[2];
      const afterSlice = html.slice(match.index, match.index + 2500);
      const priceMatch = afterSlice.match(/₹([\d,]+)/);

      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        const score = computeMatchScore(searchQuery, cardTitle);

        if (score >= 0.5) {
          let fullUrl = cardHref.replace(/&amp;/g, '&');
          if (!fullUrl.startsWith('http')) fullUrl = `https://www.flipkart.com${fullUrl}`;
          // Clean tracking query params
          fullUrl = fullUrl.split('?')[0];

          bestCandidate = {
            merchant: 'Flipkart',
            merchantKey: 'flipkart',
            title: cardTitle,
            price,
            currency: 'INR',
            url: fullUrl,
            matchScore: score
          };
          break; // First matching product with price
        }
      }
    }

    return bestCandidate;
  } catch (err) {
    return null;
  }
}

/**
 * Searches Amazon.in public search HTML for alternative product price.
 */
export async function searchAmazon(searchQuery) {
  try {
    const q = encodeURIComponent(searchQuery);
    const url = `https://www.amazon.in/s?k=${q}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    const cards = html.split('data-component-type="s-search-result"');
    for (let i = 1; i < Math.min(cards.length, 6); i++) {
      const card = cards[i];
      const titleMatch = card.match(/<h2[^>]*>.*?<span[^>]*>([^<]+)<\/span>/s);
      const priceMatch = card.match(/class="a-price-whole">([^<]+)<\/span>/);
      const asinMatch = card.match(/data-asin="([A-Z0-9]{10})"/);

      if (titleMatch && priceMatch) {
        const title = titleMatch[1].trim();
        const price = parseFloat(priceMatch[1].replace(/[^0-9]/g, ''));
        const asin = asinMatch ? asinMatch[1] : null;
        const score = computeMatchScore(searchQuery, title);

        if (score >= 0.5 && price > 0) {
          const itemUrl = asin ? `https://www.amazon.in/dp/${asin}` : `https://www.amazon.in/s?k=${q}`;
          return {
            merchant: 'Amazon',
            merchantKey: 'amazon',
            title,
            price,
            currency: 'INR',
            url: itemUrl,
            asin,
            matchScore: score
          };
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Searches Croma public store for alternative product price.
 */
export async function searchCroma(searchQuery) {
  try {
    const q = encodeURIComponent(searchQuery);
    const url = `https://www.croma.com/searchB?q=${q}%3Arelevance&text=${q}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return null;
    const html = await res.text();

    const priceMatch = html.match(/class=\"[^\"]*(?:amount|price)[^\"]*\">₹?([\d,]+)/i);
    const titleMatch = html.match(/class=\"[^\"]*product-title[^\"]*\"[^>]*>([^<]+)<\//i);

    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      const title = titleMatch ? titleMatch[1].trim() : searchQuery;
      return {
        merchant: 'Croma',
        merchantKey: 'croma',
        title,
        price,
        currency: 'INR',
        url,
        matchScore: 0.6
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Main cross-store comparison function:
 * Compares current product against alternative platforms (Flipkart, Amazon, Croma).
 */
export async function fetchCrossStoreComparisons(product = {}) {
  const currentPrice = product.effectivePrice || product.price || 0;
  const currentMerchantKey = (product.merchantKey || '').toLowerCase();
  const query = buildSearchQuery(product);

  if (!query || currentPrice <= 0) {
    return {
      currentMerchant: product.merchant || 'Current Store',
      currentPrice,
      comparisons: [],
      bestDeal: null
    };
  }

  const tasks = [];

  // If currently browsing Amazon, query Flipkart and Croma
  if (currentMerchantKey.includes('amazon')) {
    tasks.push(searchFlipkart(query));
    tasks.push(searchCroma(query));
  } else if (currentMerchantKey.includes('flipkart')) {
    // If currently browsing Flipkart, query Amazon and Croma
    tasks.push(searchAmazon(query));
    tasks.push(searchCroma(query));
  } else {
    // If on Croma or other, query both Amazon and Flipkart
    tasks.push(searchAmazon(query));
    tasks.push(searchFlipkart(query));
  }

  const results = await Promise.allSettled(tasks);
  const foundStores = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value && r.value.price > 0) {
      foundStores.push(r.value);
    }
  }

  // Build unified comparison rows including current store
  const allStores = [
    {
      merchant: product.merchant || 'Current Store',
      merchantKey: currentMerchantKey,
      price: currentPrice,
      currency: product.currency || 'INR',
      url: product.url || '',
      isCurrent: true,
      savingsVsCurrent: 0
    }
  ];

  for (const s of foundStores) {
    allStores.push({
      merchant: s.merchant,
      merchantKey: s.merchantKey,
      price: s.price,
      currency: s.currency || 'INR',
      url: s.url,
      isCurrent: false,
      savingsVsCurrent: Math.round(currentPrice - s.price)
    });
  }

  // Sort by price ascending (cheapest first)
  allStores.sort((a, b) => a.price - b.price);

  const bestStore = allStores[0];
  const isAnotherStoreCheaper = bestStore && !bestStore.isCurrent && bestStore.savingsVsCurrent > 50;

  return {
    query,
    currentPrice,
    currentMerchant: product.merchant || 'Current Store',
    allStores,
    bestStore,
    isAnotherStoreCheaper,
    cheaperSavings: isAnotherStoreCheaper ? bestStore.savingsVsCurrent : 0
  };
}
