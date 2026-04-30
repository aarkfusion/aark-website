/**
 * Playwright end-to-end navigation test.
 *
 * Tests the real question: when a new tab opens with a hash URL
 * (what happens after right-click → Open in New Tab), does the SPA
 * show the correct page or the home page?
 *
 * Run:  node test-navigation.mjs
 */

import { chromium } from 'playwright';

const BASE  = 'http://localhost:8080';
let passed = 0, failed = 0;

function ok(label, condition, detail = '') {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.log(`  ❌  ${label}${detail ? '\n       → ' + detail : ''}`); failed++; }
}

async function getState(page) {
  return page.evaluate(() => ({
    activePage: (document.querySelector('.page.active') || {}).id || null,
    hash:       location.hash,
    url:        location.href,
    filter:     typeof activeFilters !== 'undefined' ? JSON.stringify(activeFilters) : '?',
    sku:        typeof currentProduct !== 'undefined' && currentProduct ? currentProduct.sku : null,
    errors:     window.__testErrors || [],
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

/* Capture JS errors from every page — including simulated new tabs */
await context.addInitScript(() => {
  window.__testErrors = [];
  window.addEventListener('error', e =>
    window.__testErrors.push(e.message + ' @ ' + (e.filename||'?') + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e =>
    window.__testErrors.push('Unhandled: ' + String(e.reason)));
});

// ─── Helper: open a page at a hash URL (simulates what "Open in New Tab" does)
async function openHashUrl(hash) {
  const page = await context.newPage();
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);  // wait for DOMContentLoaded handlers (initFromHash)
  return page;
}

// ─── Test 1: left-click sets the baseline ────────────────────────────────────
console.log('\n── Step 1: Capture left-click state (baseline) ────────────────────────────');

const mainPage = await context.newPage();
await mainPage.goto(BASE, { waitUntil: 'domcontentloaded' });
await mainPage.waitForTimeout(500);

// Click the first sc-card (same as the user clicking a collection on home page)
await mainPage.locator('.sc-card').first().click();
await mainPage.waitForTimeout(400);
const lcState = await getState(mainPage);
console.log(`  Left-click → activePage=${lcState.activePage}  filter=${lcState.filter}  hash=${lcState.hash}`);
ok('Left-click → shop page (not home)', lcState.activePage === 'page-shop');
ok('Left-click → category filter set',  lcState.filter.includes('category'));

const expectedFilter = lcState.filter;   // e.g. {"category":"straight-cut-kurtis"}
const expectedHash   = '#shop-' + JSON.parse(lcState.filter).category;   // e.g. #shop-straight-cut-kurtis
console.log(`\n  Expected URL for new tab: ${BASE + expectedHash}`);

// ─── Test 2: new tab with hash URL shows same page as left-click ─────────────
console.log('\n── Step 2: Open same URL in new tab (simulates right-click → Open in New Tab)');

const newTab = await openHashUrl(expectedHash);
const ntState = await getState(newTab);
console.log(`  New tab   → activePage=${ntState.activePage}  filter=${ntState.filter}  hash=${ntState.hash}`);
if (ntState.errors.length) console.log(`  JS errors: ${ntState.errors.join(' | ')}`);

ok('New tab URL has shop hash',                ntState.hash.startsWith('#shop'));
ok('New tab → shop page, NOT home page',      ntState.activePage === 'page-shop',
  `got: ${ntState.activePage}`);
ok('New tab → same filter as left-click',     ntState.filter === expectedFilter,
  `expected: ${expectedFilter}  got: ${ntState.filter}`);

await newTab.close();

// ─── Test 3: product hash URL shows correct product page ─────────────────────
console.log('\n── Step 3: Product hash URL ────────────────────────────────────────────────');

// Navigate to shop page and get a real SKU from the products array directly
await mainPage.goto(BASE + '#shop', { waitUntil: 'domcontentloaded' });
await mainPage.waitForTimeout(600);

// Get a real SKU via evaluate (products array is globally accessible in non-module scripts)
const firstSku = await mainPage.evaluate(() =>
  typeof products !== 'undefined' && products.length ? products[0].sku : null
);

// Also test left-click on a product card by making the shop page visible first
await mainPage.evaluate(() => { if (typeof showPage === 'function') showPage('shop'); });
await mainPage.waitForSelector('#page-shop.active', { timeout: 3000 }).catch(() => {});
await mainPage.waitForTimeout(300);
await mainPage.locator('#page-shop .product-card').first().click();
await mainPage.waitForTimeout(400);
const prodState = await getState(mainPage);
console.log(`  Left-click product → activePage=${prodState.activePage}  sku=${prodState.sku}  hash=${prodState.hash}`);
ok('Left-click → product page', prodState.activePage === 'page-product');

const testSku = prodState.sku || firstSku;
if (testSku) {
  const prodHash = '#product-' + testSku;
  const prodTab  = await openHashUrl(prodHash);
  const ptState  = await getState(prodTab);
  console.log(`  New tab   → activePage=${ptState.activePage}  sku=${ptState.sku}  hash=${ptState.hash}`);
  if (ptState.errors.length) console.log(`  JS errors: ${ptState.errors.join(' | ')}`);

  ok('Product new tab URL has #product- hash', ptState.hash.startsWith('#product-'));
  ok('Product new tab → product page, NOT home', ptState.activePage === 'page-product',
    `got: ${ptState.activePage}`);
  ok('Product new tab → same SKU',  ptState.sku === testSku,
    `expected: ${testSku}  got: ${ptState.sku}`);

  await prodTab.close();
} else {
  console.log('  ⚠️  Could not get product SKU — skipping product tab test');
  failed += 3;
}

// ─── Test 4: nav page hash URLs work ─────────────────────────────────────────
console.log('\n── Step 4: Nav page hashes ─────────────────────────────────────────────────');

for (const [pageHash, expectedId] of [['#shop', 'page-shop'], ['#about', 'page-about'], ['#contact', 'page-contact']]) {
  const p = await openHashUrl(pageHash);
  const s = await getState(p);
  ok(`Hash ${pageHash} → ${expectedId}`, s.activePage === expectedId, `got: ${s.activePage}`);
  await p.close();
}

// ─── Summary ─────────────────────────────────────────────────────────────────
await browser.close();
await mainPage.close().catch(() => {});

console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
if (failed > 0) process.exit(1);
