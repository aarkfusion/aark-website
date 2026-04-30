import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
let passed = 0, failed = 0;

function ok(label, condition, detail = '') {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.log(`  ❌  ${label}${detail ? '\n       → ' + detail : ''}`); failed++; }
}

async function getState(page) {
  return page.evaluate(() => ({
    activePage: (document.querySelector('.page.active') || {}).id || null,
    hash: location.hash,
    filter: typeof activeFilters !== 'undefined' ? JSON.stringify(activeFilters) : '?',
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

// ─── Flow 1: Home → Shop → Product → Back → Back ─────────────────────────────
console.log('\n── Flow 1: Home → Shop → Product → Back → Back ────────────────────────────');

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
let s = await getState(page);
console.log(`  Load home        → ${s.activePage}  hash=${s.hash || '(none)'}`);
ok('Load → home', s.activePage === 'page-home');

// Single showPage call for shop — one history entry
await page.evaluate(() => showPage('shop'));
await page.waitForSelector('#page-shop.active', { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(200);
s = await getState(page);
console.log(`  showPage(shop)   → ${s.activePage}  hash=${s.hash}`);
ok('→ page-shop', s.activePage === 'page-shop');

// Click a product card
await page.locator('#page-shop .product-card').first().click();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  click product    → ${s.activePage}  hash=${s.hash}`);
ok('→ page-product', s.activePage === 'page-product');

await page.goBack();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  back (1)         → ${s.activePage}  hash=${s.hash}`);
ok('Back → page-shop', s.activePage === 'page-shop', `got: ${s.activePage}`);

await page.goBack();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  back (2)         → ${s.activePage}  hash=${s.hash}`);
ok('Back → page-home', s.activePage === 'page-home', `got: ${s.activePage}`);

// ─── Flow 2: Home → Collection card → Product → Back → Back ──────────────────
console.log('\n── Flow 2: Home → Collection card → Product → Back → Back ─────────────────');

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);

// Click collection card — triggers showShopWithFilter → showPage('shop') once
await page.locator('.sc-card').first().click();
await page.waitForSelector('#page-shop.active', { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(300);
s = await getState(page);
console.log(`  click collection → ${s.activePage}  hash=${s.hash}  filter=${s.filter}`);
ok('→ page-shop', s.activePage === 'page-shop', `got: ${s.activePage}`);

// Click first product card (already visible since shop is active)
await page.locator('#page-shop .product-card').first().click();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  click product    → ${s.activePage}  hash=${s.hash}`);
ok('→ page-product', s.activePage === 'page-product', `got: ${s.activePage}`);

await page.goBack();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  back (1)         → ${s.activePage}  hash=${s.hash}  filter=${s.filter}`);
ok('Back → page-shop', s.activePage === 'page-shop', `got: ${s.activePage}`);

await page.goBack();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  back (2)         → ${s.activePage}  hash=${s.hash}`);
ok('Back → page-home', s.activePage === 'page-home', `got: ${s.activePage}`);

// ─── Flow 3: Forward after back ───────────────────────────────────────────────
console.log('\n── Flow 3: Forward after back ──────────────────────────────────────────────');

await page.goForward();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  forward (1)      → ${s.activePage}  hash=${s.hash}`);
ok('Forward → page-shop', s.activePage === 'page-shop', `got: ${s.activePage}`);

await page.goForward();
await page.waitForTimeout(400);
s = await getState(page);
console.log(`  forward (2)      → ${s.activePage}  hash=${s.hash}`);
ok('Forward → page-product', s.activePage === 'page-product', `got: ${s.activePage}`);

// ─── Summary ─────────────────────────────────────────────────────────────────
await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
if (failed > 0) process.exit(1);
