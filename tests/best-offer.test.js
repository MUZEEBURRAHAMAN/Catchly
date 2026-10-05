// tests/best-offer.test.js
// Node.js test suite for Catchly Best Offer Engine (Product Detector, Offer Engine, Buy/Wait, Confidence)

import assert from 'node:assert';
import {
  normalizeTitle, normalizeBrand, normalizeStorage, normalizeColor,
  generateCanonicalProductId
} from '../lib/product-detector.js';

import {
  calculateBestOffer, evaluateBuyVsWait, generateRecommendationReasons
} from '../lib/offer-engine.js';

console.log('🧪 Running Best Offer Engine Test Suite...\n');

// 1. Normalization Tests
console.log('1. Testing Product Normalization...');
{
  const rawTitle = 'Apple iPhone 17 Pro Max 256GB Natural Titanium - Buy Online at Best Price in India - Amazon.in';
  const cleanTitle = normalizeTitle(rawTitle);
  assert.strictEqual(cleanTitle, 'Apple iPhone 17 Pro Max 256GB Natural Titanium');

  const brand = normalizeBrand('Apple Inc.', cleanTitle);
  assert.strictEqual(brand, 'Apple');

  const storage = normalizeStorage(cleanTitle);
  assert.strictEqual(storage, '256GB');

  const color = normalizeColor(cleanTitle);
  assert.strictEqual(color, 'Natural Titanium');

  const pid = generateCanonicalProductId({
    brand,
    title: cleanTitle,
    asin: 'B0CHX1W1XY'
  });
  assert.strictEqual(pid, 'asin:B0CHX1W1XY');

  const gtinPid = generateCanonicalProductId({
    brand: 'Sony',
    title: 'Sony WH-1000XM6 Headphones',
    gtin: '4548736132456'
  });
  assert.strictEqual(gtinPid, 'gtin:4548736132456');

  const fallbackPid = generateCanonicalProductId({
    brand: 'Sony',
    title: 'Sony WH-1000XM6 Wireless Headphones Black'
  });
  assert(fallbackPid.startsWith('norm:sony-wh-1000xm6'));
  console.log('   ✓ Normalization tests passed.');
}

// 2. Offer Calculation & Effective Price Tests
console.log('\n2. Testing Offer Calculation (Guaranteed vs Potential Savings)...');
{
  const product = {
    price: 49999,
    originalPrice: 54999,
    currency: 'INR',
    title: 'Sony WH-1000XM6'
  };

  const extractedOffers = {
    offers: [
      { type: 'coupon', title: '₹2,000 Clip Coupon', amount: 2000, tier: 'guaranteed' },
      { type: 'bank_discount', title: 'SBI Card Offer', amount: 1500, tier: 'conditional' },
      { type: 'cashback', title: 'Amazon Pay Cashback', amount: 1000, tier: 'potential' }
    ],
    shipping: { fee: 0, isFree: true }
  };

  const result = calculateBestOffer(product, extractedOffers);

  // Guaranteed savings should only be coupon (₹2,000)
  assert.strictEqual(result.guaranteedSavings, 2000);
  assert.strictEqual(result.conditionalSavings, 1500);
  assert.strictEqual(result.potentialSavings, 1000);
  assert.strictEqual(result.totalSavings, 4500);

  // Guaranteed Effective Price: 49,999 - 2,000 = 47,999
  assert.strictEqual(result.guaranteedEffectivePrice, 47999);

  // Potential Effective Price: 49,999 - 4,500 = 45,499
  assert.strictEqual(result.potentialEffectivePrice, 45499);

  assert(result.confidence >= 0.90);
  console.log('   ✓ Offer calculations & tier separations passed.');
}

// 3. Buy vs. Wait Statistical Engine Tests
console.log('\n3. Testing Buy vs. Wait Statistical Engine...');
{
  const priceHistory = [
    { price: 32000, timestamp: Date.now() - 20 * 86400000 },
    { price: 31500, timestamp: Date.now() - 10 * 86400000 },
    { price: 31000, timestamp: Date.now() - 5 * 86400000 }
  ]; // avg ~ 31500

  // Case A: Price is 27,999 (11.1% discount) -> Excellent Deal
  const excellent = evaluateBuyVsWait(27999, priceHistory);
  assert.strictEqual(excellent.verdict, 'excellent');
  assert(excellent.discountFromAvgPct >= 10);
  assert.strictEqual(excellent.badgeClass, 'deal-excellent');

  // Case B: Price is 29,500 (6.3% discount) -> Good Deal
  const good = evaluateBuyVsWait(29500, priceHistory);
  assert.strictEqual(good.verdict, 'good');
  assert.strictEqual(good.badgeClass, 'deal-good');

  // Case C: Price is 31,400 (normal range) -> Normal
  const normal = evaluateBuyVsWait(31400, priceHistory);
  assert.strictEqual(normal.verdict, 'normal');
  assert.strictEqual(normal.badgeClass, 'deal-normal');

  // Case D: Price is 34,999 (+11.1% hike) -> Wait
  const wait = evaluateBuyVsWait(34999, priceHistory);
  assert.strictEqual(wait.verdict, 'wait');
  assert.strictEqual(wait.badgeClass, 'deal-wait');

  console.log('   ✓ Buy vs. Wait statistical verdicts verified.');
}

// 4. Recommendation Explanations Tests
console.log('\n4. Testing "Why Catchly Recommends This" Bullet Points...');
{
  const product = {
    price: 27999,
    originalPrice: 32999,
    availability: 'in_stock'
  };
  const bestOffer = {
    bestBankOffer: { title: 'SBI Card Offer', amount: 1500 },
    guaranteedSavings: 500,
    shippingFee: 0
  };
  const buyWait = {
    discountFromAvgPct: 11
  };

  const reasons = generateRecommendationReasons(product, bestOffer, buyWait);
  assert(reasons.length >= 3);
  assert(reasons.some(r => r.includes('SBI Card Offer')));
  assert(reasons.some(r => r.includes('coupon available')));
  assert(reasons.some(r => r.includes('Free delivery')));
  console.log('   ✓ Recommendation reasons verified:');
  reasons.forEach(r => console.log('     • ' + r));
}

// 5. Cross-Store Comparison Tests
console.log('\n5. Testing Cross-Store Comparison & Query Building...');
{
  const { buildSearchQuery, computeMatchScore } = await import('../lib/cross-store.js');
  const query = buildSearchQuery({
    title: 'Apple iPhone 15 (Blue, 128 GB) - Buy Online at Best Price - Amazon.in',
    brand: 'Apple'
  });
  assert(query.includes('Apple'));
  assert(query.includes('iPhone'));
  assert(query.includes('15'));
  assert(query.includes('128GB'));

  const score1 = computeMatchScore(query, 'Apple iPhone 15 (Blue, 128 GB)');
  assert(score1 >= 0.7);

  const scoreDiff = computeMatchScore(query, 'Samsung Galaxy S24 Ultra 256GB');
  assert(scoreDiff < 0.3);

  console.log('   ✓ Cross-store search query building & matching score verified.');
}

// 6. Strict Same-Product & 10-Store Table Tests
console.log('\n6. Testing Strict Same-Product Filter & 10-Store Comparison...');
{
  const {
    isPriceSane, isExactSameProduct, STORE_ROSTER, fetchCrossStoreComparisons
  } = await import('../lib/cross-store.js');

  // Verify 10 platforms in store roster
  assert.strictEqual(STORE_ROSTER.length, 10);
  assert(STORE_ROSTER.some(s => s.key === 'amazon'));
  assert(STORE_ROSTER.some(s => s.key === 'flipkart'));
  assert(STORE_ROSTER.some(s => s.key === 'croma'));
  assert(STORE_ROSTER.some(s => s.key === 'reliance'));
  assert(STORE_ROSTER.some(s => s.key === 'tatacliq'));
  assert(STORE_ROSTER.some(s => s.key === 'vijaysales'));
  assert(STORE_ROSTER.some(s => s.key === 'jiomart'));
  assert(STORE_ROSTER.some(s => s.key === 'poorvika'));
  assert(STORE_ROSTER.some(s => s.key === 'sangeetha'));
  assert(STORE_ROSTER.some(s => s.key === 'brandstore'));

  // Test Price Sanity Filter: User reported ₹96,990 vs ₹4,70,990
  const basePrice = 96990;
  assert.strictEqual(isPriceSane(470990, basePrice), false); // 4.8x higher -> REJECTED!
  assert.strictEqual(isPriceSane(94990, basePrice), true);   // within 2% -> ACCEPTED
  assert.strictEqual(isPriceSane(102000, basePrice), true);  // within 5% -> ACCEPTED
  assert.strictEqual(isPriceSane(150000, basePrice), false); // >30% higher -> REJECTED
  assert.strictEqual(isPriceSane(50000, basePrice), false);  // <30% lower -> REJECTED

  // Test Exact Same Product checks
  const targetProduct = {
    brand: 'Apple',
    title: 'Apple iPhone 16 Pro 128GB Desert Titanium',
    price: 96990
  };

  // Wildly mismatched product / bundle
  assert.strictEqual(isExactSameProduct(targetProduct, 'Apple Mac Studio M2 Ultra 128GB RAM', 470990), false);

  // Differing model tier (Pro vs Pro Max)
  assert.strictEqual(isExactSameProduct(targetProduct, 'Apple iPhone 16 Pro Max 128GB', 96990), false);

  // Differing storage tier (128GB vs 256GB)
  assert.strictEqual(isExactSameProduct(targetProduct, 'Apple iPhone 16 Pro 256GB Desert Titanium', 106990), false);

  // Case/accessory match
  assert.strictEqual(isExactSameProduct(targetProduct, 'Clear Case for Apple iPhone 16 Pro', 999), false);

  // Exact match candidate
  assert.strictEqual(isExactSameProduct(targetProduct, 'Apple iPhone 16 Pro (Desert Titanium, 128 GB)', 95999), true);

  // Test 10-Platform Comparison Table generation
  const comp = await fetchCrossStoreComparisons({
    title: 'Apple iPhone 16 Pro 128GB',
    brand: 'Apple',
    merchant: 'Amazon',
    merchantKey: 'amazon',
    price: 96990
  });

  assert.strictEqual(comp.allStores.length, 10);
  assert(comp.allStores.some(s => s.merchantKey === 'amazon' && s.isCurrent === true));
  assert(comp.allStores.some(s => s.merchantKey === 'flipkart'));
  assert(comp.allStores.some(s => s.merchantKey === 'croma'));
  assert(comp.allStores.some(s => s.merchantKey === 'reliance'));

  // Ensure prices are sorted ascending
  for (let i = 1; i < comp.allStores.length; i++) {
    assert(comp.allStores[i].price >= comp.allStores[i - 1].price);
  }

  console.log('   ✓ Strict same-product filter & 10-store comparison table verified.');
}

// 7. Multi-Platform Support: Target, Croma, Global/US Platforms
console.log('\n7. Testing Multi-Platform (Target, Croma, US & Global Roster)...');
{
  const {
    STORE_ROSTER_IN, STORE_ROSTER_US, getStoreRoster, fetchCrossStoreComparisons
  } = await import('../lib/cross-store.js');
  const {
    getMerchantNameFromHost, getMerchantKeyFromHost
  } = await import('../lib/product-detector.js');

  // Verify US/Global platforms roster
  assert.strictEqual(STORE_ROSTER_US.length, 10);
  assert(STORE_ROSTER_US.some(s => s.key === 'target' && s.domain === 'target.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'walmart' && s.domain === 'walmart.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'bestbuy' && s.domain === 'bestbuy.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'amazon' && s.domain === 'amazon.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'bhphoto' && s.domain === 'bhphotovideo.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'newegg' && s.domain === 'newegg.com'));
  assert(STORE_ROSTER_US.some(s => s.key === 'costco' && s.domain === 'costco.com'));

  // Verify India roster has Croma, Flipkart, Reliance Digital, etc.
  assert(STORE_ROSTER_IN.some(s => s.key === 'croma' && s.domain === 'croma.com'));
  assert(STORE_ROSTER_IN.some(s => s.key === 'flipkart' && s.domain === 'flipkart.com'));

  // Test merchant detection for Target & Croma
  assert.strictEqual(getMerchantNameFromHost('www.target.com'), 'Target');
  assert.strictEqual(getMerchantKeyFromHost('www.target.com'), 'target');
  assert.strictEqual(getMerchantNameFromHost('www.croma.com'), 'Croma');
  assert.strictEqual(getMerchantKeyFromHost('www.croma.com'), 'croma');

  // Test roster selection logic
  const targetProduct = {
    title: 'Apple AirPods Pro 2nd Gen',
    brand: 'Apple',
    merchant: 'Target',
    merchantKey: 'target',
    currency: 'USD',
    price: 199.99,
    url: 'https://www.target.com/p/apple-airpods-pro-2nd-gen/-/A-85978612'
  };
  const selectedRosterUS = getStoreRoster(targetProduct);
  assert.strictEqual(selectedRosterUS, STORE_ROSTER_US);

  const cromaProduct = {
    title: 'Apple iPhone 16 Pro 128GB',
    brand: 'Apple',
    merchant: 'Croma',
    merchantKey: 'croma',
    currency: 'INR',
    price: 96990,
    url: 'https://www.croma.com/apple-iphone-16-pro/p/308571'
  };
  const selectedRosterIN = getStoreRoster(cromaProduct);
  assert.strictEqual(selectedRosterIN, STORE_ROSTER_IN);

  // Test US Comparison generation with Target as current store
  const targetComp = await fetchCrossStoreComparisons(targetProduct);
  assert.strictEqual(targetComp.allStores.length, 10);
  assert(targetComp.allStores.some(s => s.merchantKey === 'target' && s.isCurrent === true));
  assert(targetComp.allStores.some(s => s.merchantKey === 'walmart'));
  assert(targetComp.allStores.some(s => s.merchantKey === 'bestbuy'));
  assert(targetComp.allStores.some(s => s.merchantKey === 'amazon'));

  // Test Croma Comparison generation with Croma as current store
  const cromaComp = await fetchCrossStoreComparisons(cromaProduct);
  assert.strictEqual(cromaComp.allStores.length, 10);
  assert(cromaComp.allStores.some(s => s.merchantKey === 'croma' && s.isCurrent === true));
  assert(cromaComp.allStores.some(s => s.merchantKey === 'amazon'));
  assert(cromaComp.allStores.some(s => s.merchantKey === 'flipkart'));

  console.log('   ✓ Target, Croma, US & India 10-store platform comparisons verified.');
}

console.log('\n🎉 ALL BEST OFFER ENGINE TESTS PASSED SUCCESSFULLY!\n');
