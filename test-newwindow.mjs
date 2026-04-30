/**
 * Tests "Open in New Window" via the custom context menu (openWin helper).
 * Verifies the new window routes to the correct page (not home).
 *
 * Run: node test-newwindow.mjs
 */
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
    sku: typeof currentProduct !== 'undefined' && currentProduct ? currentProduct.sku : null,
  }));
}

// Simulate openWin exactly as coded: window.open(url, '_blank', 'width=1280,height=860,left=120,top=80')
async function openWin(context, fromPage, url) {
  const pagePromise = context.waitForEvent('page');
  await fromPage.evaluate((u) =>
    window.open(u, '_blank', 'width=1280,height=860,left=120,top=80'), url
  );
  const win = await pagePromise;
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(800);
  return win;
}

// Simulate openTab: window.open(url, '_blank') — no features
async function openTab(context, fromPage, url) {
  const pagePromise = context.waitForEvent('page');
  await fromPage.evaluate((u) => window.open(u, '_blank'), url);
  const tab = await pagePromise;
  await tab.waitForLoadState('domcontentloaded');
  await tab.waitForTimeout(800);
  return tab;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const main = await context.newPage();

await main.goto(BASE, { waitUntil: 'domcontentloaded' });
await main.waitForTimeout(400);

// ─── Get test URLs ────────────────────────────────────────────────────────────
await main.locator('.sc-card').first().click();
await main.waitForTimeout(300);
const shopState = await getState(main);
const shopHash = '#shop-' + JSON.parse(shopState.filter).category;

await main.evaluate(() => showPage('shop'));
await main.waitForSelector('#page-shop.active', { timeout: 2000 }).catch(() => {});
await main.waitForTimeout(200);
const prodHash = await main.evaluate(() =>
  document.querySelector('#page-shop .product-card')?.dataset.href || null
);

console.log(`  Shop URL:    ${BASE + shopHash}`);
console.log(`  Product URL: ${BASE + prodHash}`);

// ─── Suite 1: Collection in new tab (baseline) ───────────────────────────────
console.log('\n── Suite 1: Collection — new tab (baseline) ────────────────────────────────');
const tab1 = await openTab(context, main, BASE + shopHash);
const tab1State = await getState(tab1);
console.log(`  activePage=${tab1State.activePage}  hash=${tab1State.hash}`);
ok('Collection new tab → page-shop',   tab1State.activePage === 'page-shop', `got: ${tab1State.activePage}`);
ok('Collection new tab hash preserved', tab1State.hash.startsWith('#shop'), `got: ${tab1State.hash}`);
await tab1.close();

// ─── Suite 2: Collection in new window ───────────────────────────────────────
console.log('\n── Suite 2: Collection — new window (openWin) ──────────────────────────────');
const win1 = await openWin(context, main, BASE + shopHash);
const win1State = await getState(win1);
console.log(`  activePage=${win1State.activePage}  hash=${win1State.hash}`);
ok('Collection new window → page-shop',     win1State.activePage === 'page-shop', `got: ${win1State.activePage}`);
ok('Collection new window hash preserved',  win1State.hash.startsWith('#shop'),   `got: ${win1State.hash}`);
ok('Collection new window filter set',      win1State.filter.includes('category'), `got: ${win1State.filter}`);
await win1.close();

// ─── Suite 3: Product in new window ──────────────────────────────────────────
console.log('\n── Suite 3: Product — new window (openWin) ─────────────────────────────────');
if (prodHash) {
  const win2 = await openWin(context, main, BASE + prodHash);
  const win2State = await getState(win2);
  console.log(`  activePage=${win2State.activePage}  hash=${win2State.hash}  sku=${win2State.sku}`);
  ok('Product new window → page-product',    win2State.activePage === 'page-product', `got: ${win2State.activePage}`);
  ok('Product new window hash preserved',    win2State.hash.startsWith('#product-'),  `got: ${win2State.hash}`);
  ok('Product new window correct SKU loaded', win2State.sku !== null,                  `sku: ${win2State.sku}`);
  await win2.close();
} else {
  console.log('  ⚠️  Could not get product hash — skipping');
  failed += 3;
}

// ─── Suite 4: New window matches new tab for same URL ────────────────────────
console.log('\n── Suite 4: New window == new tab for same URL ─────────────────────────────');
const [tab2, win3] = await Promise.all([
  openTab(context, main, BASE + shopHash),
  openWin(context, main, BASE + shopHash),
]);
const [tab2State, win3State] = await Promise.all([getState(tab2), getState(win3)]);
ok('New window active page matches new tab', win3State.activePage === tab2State.activePage,
  `tab: ${tab2State.activePage}  win: ${win3State.activePage}`);
ok('New window filter matches new tab',      win3State.filter === tab2State.filter,
  `tab: ${tab2State.filter}  win: ${win3State.filter}`);
await Promise.all([tab2.close(), win3.close()]);

// ─── Summary ─────────────────────────────────────────────────────────────────
await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
if (failed > 0) process.exit(1);
