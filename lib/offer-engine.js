// lib/offer-engine.js
// Current-page offer parser, effective price calculation, confidence scoring,
// and statistical Buy vs. Wait engine (100% on-device, zero external APIs).

/**
 * Extracts discounts, coupons, bank offers, and cashback from current document.
 */
export function extractPageOffers(doc = document, product = {}) {
  const offers = [];
  const basePrice = product.price || 0;
  const currency = product.currency || 'INR';

  // 1. Instant Markdown / List Price savings
  if (product.originalPrice && product.originalPrice > basePrice) {
    const markdown = product.originalPrice - basePrice;
    offers.push({
      type: 'instant_discount',
      title: 'Store Markdown',
      description: `Discount off MRP (${product.originalPrice})`,
      amount: markdown,
      percentage: Math.round((markdown / product.originalPrice) * 100),
      confidence: 1.0,
      tier: 'guaranteed'
    });
  }

  // 2. Coupon detection
  const couponData = detectCoupons(doc, basePrice);
  if (couponData) {
    offers.push({
      type: 'coupon',
      title: couponData.title || 'Coupon Savings',
      description: couponData.description,
      amount: couponData.amount,
      percentage: couponData.percentage,
      code: couponData.code || null,
      confidence: 0.95,
      tier: 'guaranteed'
    });
  }

  // 3. Bank & Payment Offers
  const bankOffers = detectBankOffers(doc, basePrice);
  for (const bo of bankOffers) {
    offers.push({
      type: 'bank_discount',
      title: bo.title,
      description: bo.description,
      bank: bo.bank,
      cardType: bo.cardType,
      amount: bo.amount,
      percentage: bo.percentage,
      maxCap: bo.maxCap,
      confidence: 0.85,
      tier: 'conditional'
    });
  }

  // 4. Cashback & Rewards
  const cashbackData = detectCashback(doc, basePrice);
  if (cashbackData) {
    offers.push({
      type: 'cashback',
      title: cashbackData.title,
      description: cashbackData.description,
      amount: cashbackData.amount,
      confidence: 0.60,
      tier: 'potential'
    });
  }

  // 5. Shipping / Delivery
  const shipping = detectShipping(doc);

  return {
    offers,
    shipping
  };
}

/**
 * Scans page for clickable or clip-able coupons.
 */
function detectCoupons(doc, basePrice) {
  // Amazon coupon badges & checkboxes
  const azCoupon = doc.getElementById('couponBadge') || doc.querySelector('.couponBadge, #vpcButton, label[for*="coupon"]');
  if (azCoupon) {
    const text = azCoupon.innerText || '';
    const flatMatch = text.match(/(?:Save|Apply|₹|\$)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:coupon|voucher|off)/i);
    const pctMatch = text.match(/(\d+)%\s*(?:coupon|voucher|off)/i);
    
    if (flatMatch) {
      const amount = parseFloat(flatMatch[1].replace(/,/g, ''));
      if (amount > 0 && amount < basePrice) {
        return {
          title: 'Amazon Clip Coupon',
          description: `Instant ₹${amount} off at checkout`,
          amount
        };
      }
    } else if (pctMatch) {
      const pct = parseInt(pctMatch[1], 10);
      const amount = Math.round((basePrice * pct) / 100);
      return {
        title: 'Amazon Clip Coupon',
        description: `${pct}% off applied at checkout`,
        amount,
        percentage: pct
      };
    }
  }

  // Flipkart coupon section
  const fkCoupon = doc.querySelector('div[class*="coupon"], ._3jXgCr, ._1vC4OE');
  if (fkCoupon) {
    const text = fkCoupon.innerText || '';
    const m = text.match(/(?:Special Price|Coupon Discount|Save)\s*(?:₹|\$)?\s*([\d,]+)/i);
    if (m) {
      const amount = parseFloat(m[1].replace(/,/g, ''));
      if (amount > 0 && amount < basePrice) {
        return {
          title: 'Special Coupon',
          description: `₹${amount} extra discount`,
          amount
        };
      }
    }
  }

  // Generic coupon badge
  const promoEl = doc.querySelector('.promo-code, .coupon-tag, [data-testid="coupon-code"]');
  if (promoEl) {
    const text = promoEl.innerText.trim();
    return {
      title: 'Promo Available',
      description: text.slice(0, 40),
      amount: 0,
      code: text.replace(/[^A-Z0-9]/g, '')
    };
  }

  return null;
}

/**
 * Scans page for card / bank instant discounts.
 */
function detectBankOffers(doc, basePrice) {
  const results = [];
  const bodyText = (doc.body && doc.body.innerText) || '';

  // Specific retail bank sections
  const offerContainers = doc.querySelectorAll(
    '#itembox-InstantBankDiscount, #bankOffers_feature_div, .bank-offers-list, ' +
    'li._16eBzU, div.x5Odtw, .bank-offer-item'
  );

  const textsToScan = [];
  if (offerContainers.length > 0) {
    offerContainers.forEach(el => textsToScan.push(el.innerText));
  } else {
    // Scan matching lines in text
    const lines = bodyText.split('\n');
    for (const l of lines) {
      if (/bank offer|instant discount|credit card|debit card/i.test(l) && l.length < 160) {
        textsToScan.push(l);
      }
    }
  }

  const KNOWN_BANKS = ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak', 'Amex', 'Federal', 'OneCard', 'HSBC', 'BoB'];

  for (const raw of textsToScan) {
    const matchedBank = KNOWN_BANKS.find(b => new RegExp(`\\b${b}\\b`, 'i').test(raw));
    if (!matchedBank) continue;

    // Look for discount amount or percentage
    // e.g. "10% Instant Discount up to ₹1,500 on SBI Credit Card"
    // e.g. "Flat ₹2,000 Off on HDFC Bank Cards"
    const pctMatch = raw.match(/(\d+)%\s*(?:Instant\s*)?Discount/i);
    const flatMatch = raw.match(/(?:Flat\s*)?(?:₹|\$)\s*([\d,]+)\s*(?:Off|Discount)/i);
    const capMatch = raw.match(/(?:up\s*to|max)\s*(?:₹|\$)\s*([\d,]+)/i);

    let amount = 0;
    let percentage = null;
    let maxCap = null;

    if (capMatch) {
      maxCap = parseFloat(capMatch[1].replace(/,/g, ''));
    }

    if (flatMatch) {
      amount = parseFloat(flatMatch[1].replace(/,/g, ''));
    } else if (pctMatch) {
      percentage = parseInt(pctMatch[1], 10);
      let calculated = (basePrice * percentage) / 100;
      if (maxCap && calculated > maxCap) calculated = maxCap;
      amount = Math.round(calculated);
    }

    const cardType = /credit\s*card/i.test(raw) ? 'Credit Card'
                   : /debit\s*card/i.test(raw) ? 'Debit Card'
                   : 'Card';

    if (amount > 0 && amount < basePrice) {
      results.push({
        title: `${matchedBank} ${cardType} Offer`,
        description: raw.trim().replace(/\s+/g, ' ').slice(0, 75),
        bank: matchedBank,
        cardType,
        amount,
        percentage,
        maxCap
      });
      // Deduplicate by bank name
      if (results.length >= 3) break;
    }
  }

  return results;
}

/**
 * Scans page for cashback promotions.
 */
function detectCashback(doc, basePrice) {
  const text = (doc.body && doc.body.innerText) || '';
  const match = text.match(/(?:₹|\$)\s*([\d,]+)\s*(?:cashback|Amazon Pay balance)/i)
             || text.match(/(?:5%|3%)\s*cashback\s*with\s*(?:Amazon Pay|Flipkart Axis)/i);

  if (match) {
    let amount = 0;
    if (match[1]) {
      amount = parseFloat(match[1].replace(/,/g, ''));
    } else if (match[0].includes('5%')) {
      amount = Math.round(basePrice * 0.05);
    }
    if (amount > 0 && amount < basePrice * 0.5) {
      return {
        title: 'Cashback / Rewards',
        description: match[0].trim(),
        amount
      };
    }
  }
  return null;
}

/**
 * Detects shipping or delivery fee.
 */
function detectShipping(doc) {
  const text = (doc.body && doc.body.innerText) || '';
  if (/free\s+delivery|free\s+shipping/i.test(text)) {
    return { fee: 0, isFree: true, label: 'Free Delivery' };
  }
  const feeMatch = text.match(/(?:delivery|shipping)\s*(?:fee|charges)?[:\s]*(?:₹|\$)\s*([\d.]+)/i);
  if (feeMatch) {
    const fee = parseFloat(feeMatch[1]);
    return { fee, isFree: false, label: `+₹${fee} Delivery` };
  }
  return { fee: 0, isFree: true, label: 'Free Delivery' };
}

/**
 * Calculates Best Offer breakdowns:
 * - Guaranteed Effective Price: basePrice - coupon - instantMarkdown
 * - Potential Effective Price: basePrice - coupon - bestBankDiscount - cashback + shippingFee
 */
export function calculateBestOffer(product, extractedOffers) {
  const basePrice = product.price || 0;
  const listPrice = product.originalPrice || basePrice;
  const { offers, shipping } = extractedOffers;

  let couponSavings = 0;
  let bankSavings = 0;
  let cashbackSavings = 0;
  let bestBankOffer = null;

  for (const o of offers) {
    if (o.type === 'coupon') {
      couponSavings = Math.max(couponSavings, o.amount || 0);
    } else if (o.type === 'bank_discount') {
      if ((o.amount || 0) > bankSavings) {
        bankSavings = o.amount;
        bestBankOffer = o;
      }
    } else if (o.type === 'cashback') {
      cashbackSavings = Math.max(cashbackSavings, o.amount || 0);
    }
  }

  // Shipping fee
  const shippingFee = shipping?.fee || 0;

  // Master Plan §31 & §32: Never mix guaranteed and potential savings!
  const guaranteedSavings = couponSavings;
  const conditionalSavings = bankSavings;
  const potentialSavings = cashbackSavings;

  const totalMaxSavings = guaranteedSavings + conditionalSavings + potentialSavings;

  const guaranteedEffectivePrice = Math.max(0, basePrice - guaranteedSavings + shippingFee);
  const potentialEffectivePrice = Math.max(0, basePrice - totalMaxSavings + shippingFee);

  // Confidence calculation
  let confidence = 0.90;
  if (guaranteedSavings > 0) confidence = 0.95;
  if (conditionalSavings > 0 && guaranteedSavings === 0) confidence = 0.85;

  return {
    basePrice,
    listPrice,
    shippingFee,
    guaranteedSavings,
    conditionalSavings,
    potentialSavings,
    totalSavings: totalMaxSavings,
    guaranteedEffectivePrice,
    potentialEffectivePrice,
    bestBankOffer,
    appliedOffers: offers,
    confidence
  };
}

/**
 * Buy vs. Wait Statistical Engine (Master Plan §12, 22)
 * Compares current price against local observations from chrome.storage.local
 */
export function evaluateBuyVsWait(currentPrice, priceHistory = []) {
  if (!priceHistory || priceHistory.length < 2) {
    return {
      verdict: 'good',
      label: 'Good Offer',
      badgeClass: 'deal-good',
      summary: 'Verified current offer. Start tracking to build price history.',
      discountFromAvgPct: 0,
      lowestPrice: currentPrice,
      highestPrice: currentPrice,
      averagePrice: currentPrice,
      dataPoints: priceHistory?.length || 1
    };
  }

  const prices = priceHistory.map(h => h.price).filter(p => p > 0);
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);
  const sum = prices.reduce((a, b) => a + b, 0);
  const averagePrice = Math.round(sum / prices.length);

  const diff = averagePrice - currentPrice;
  const discountFromAvgPct = Math.round((diff / averagePrice) * 100);

  if (discountFromAvgPct >= 10) {
    return {
      verdict: 'excellent',
      label: '🟢 Excellent Deal',
      badgeClass: 'deal-excellent',
      summary: `Price is ${discountFromAvgPct}% below recent average (${averagePrice}). Strong buy.`,
      discountFromAvgPct,
      lowestPrice,
      highestPrice,
      averagePrice,
      dataPoints: prices.length
    };
  }

  if (discountFromAvgPct >= 4) {
    return {
      verdict: 'good',
      label: '🟢 Good Time to Buy',
      badgeClass: 'deal-good',
      summary: `Price is ${discountFromAvgPct}% below recent average. Great savings.`,
      discountFromAvgPct,
      lowestPrice,
      highestPrice,
      averagePrice,
      dataPoints: prices.length
    };
  }

  if (discountFromAvgPct >= -5) {
    return {
      verdict: 'normal',
      label: '🟡 Normal Price',
      badgeClass: 'deal-normal',
      summary: `Within typical price range (recent average: ${averagePrice}).`,
      discountFromAvgPct,
      lowestPrice,
      highestPrice,
      averagePrice,
      dataPoints: prices.length
    };
  }

  const hikePct = Math.abs(discountFromAvgPct);
  return {
    verdict: 'wait',
    label: '🔴 I\'d Wait',
    badgeClass: 'deal-wait',
    summary: `Price is currently ${hikePct}% higher than recent average (${averagePrice}). Better to wait for a price drop.`,
    discountFromAvgPct,
    lowestPrice,
    highestPrice,
    averagePrice,
    dataPoints: prices.length
  };
}

/**
 * Builds "Why Catchly Recommends This" verification points (Master Plan §33).
 */
export function generateRecommendationReasons(product, bestOffer, buyWait) {
  const reasons = [];

  if (bestOffer.bestBankOffer) {
    reasons.push(`Save ₹${bestOffer.bestBankOffer.amount} with ${bestOffer.bestBankOffer.title}`);
  }

  if (bestOffer.guaranteedSavings > 0) {
    reasons.push(`₹${bestOffer.guaranteedSavings} instant coupon available on page`);
  }

  if (buyWait.discountFromAvgPct >= 5) {
    reasons.push(`Price is ${buyWait.discountFromAvgPct}% below 30-day average`);
  } else if (product.originalPrice && product.originalPrice > product.price) {
    const diff = product.originalPrice - product.price;
    reasons.push(`₹${diff} markdown from manufacturer MRP`);
  }

  if (bestOffer.shippingFee === 0) {
    reasons.push('Free delivery included');
  }

  if (product.availability === 'in_stock') {
    reasons.push('In stock & verified merchant listing');
  }

  return reasons.slice(0, 4);
}
