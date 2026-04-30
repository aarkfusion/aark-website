/**
 * Playwright tests for:
 *   1. Add to Cart — buttons disabled until size selected (Option D)
 *   2. Buy Now    — only the current product goes to checkout, real cart untouched
 *
 * Run:  node test-cart-buynow.mjs
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
let passed = 0, failed = 0;

function ok(label, condition, detail = '') {
  if (condition) { console.log(`  ✅  ${label}`); passed++; }
  else           { console.log(`  ❌  ${label}${detail ? '\n       → ' + detail : ''}`); failed++; }
}

async function openProduct(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  // Navigate to shop and open first product
  await page.evaluate(() => showPage('shop'));
  await page.waitForSelector('#page-shop.active', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('#page-shop .product-card').first().click();
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

// ─── Suite 1: Add to Cart — Option D (buttons disabled until size picked) ─────
console.log('\n══ Suite 1: Add to Cart — disabled until size selected ══════════════════════');

const page1 = await context.newPage();
await openProduct(page1);

// 1a. Both CTA buttons disabled on load
const atcDisabled = await page1.locator('#addToCartBtn').isDisabled();
const bnDisabled  = await page1.locator('#buyNowBtn').isDisabled();
ok('Add to Cart button starts disabled', atcDisabled);
ok('Buy Now button starts disabled',     bnDisabled);

// 1b. Size hint text is visible
const hintVisible = await page1.locator('#sizeHint').isVisible();
ok('"Select a size to continue" hint is visible', hintVisible);

// 1c. Buttons still disabled after clicking (should not respond)
await page1.locator('#addToCartBtn').click({ force: true });
const cartCountBefore = await page1.evaluate(() => cart.length);
ok('Cart unchanged when button clicked while disabled', cartCountBefore === 0,
  `cart.length = ${cartCountBefore}`);

// 1d. Select a size → buttons become enabled
await page1.locator('.size-opt').first().click();
await page1.waitForTimeout(200);
const atcEnabled = await page1.locator('#addToCartBtn').isEnabled();
const bnEnabled  = await page1.locator('#buyNowBtn').isEnabled();
ok('Add to Cart button enabled after size selected', atcEnabled);
ok('Buy Now button enabled after size selected',     bnEnabled);

// 1e. Hint disappears after size selected
const hintHidden = await page1.locator('#sizeHint').isHidden();
ok('"Select a size" hint hidden after size selected', hintHidden);

// 1f. Add to Cart actually adds the product
await page1.locator('#addToCartBtn').click();
await page1.waitForTimeout(300);
const cartCount = await page1.evaluate(() => cart.length);
const cartSku   = await page1.evaluate(() => cart[0]?.sku || null);
const cartSize  = await page1.evaluate(() => cart[0]?.selectedSize || null);
ok('Product added to cart after clicking Add to Cart', cartCount === 1,
  `cart.length = ${cartCount}`);
ok('Cart item has a SKU',  cartSku !== null,  `sku = ${cartSku}`);
ok('Cart item has a size', cartSize !== null, `size = ${cartSize}`);

await page1.close();

// ─── Suite 2: Buy Now — only current product, real cart untouched ──────────────
console.log('\n══ Suite 2: Buy Now — isolated from regular cart ════════════════════════════');

const page2 = await context.newPage();

// Pre-load cart with a different product via localStorage
await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
await page2.evaluate(() => {
  localStorage.setItem('aark_cart', JSON.stringify([
    { id: 99, name: 'Pre-existing Item', sku: 'EXISTING', price: 870,
      qty: 2, selectedSize: 'M', fabric: 'Cotton', image: '', series: 'Test' }
  ]));
});

// Open a product page
await openProduct(page2);

// Pick a size
await page2.locator('.size-opt').first().click();
await page2.waitForTimeout(200);

const chosenSku  = await page2.evaluate(() => currentProduct?.sku || null);
const chosenSize = await page2.evaluate(() =>
  document.querySelector('.size-opt.active')?.textContent || null
);
console.log(`  Product: ${chosenSku}  size: ${chosenSize}`);

// Click Buy Now — intercept navigation
let buyNowUrl = null;
page2.once('framenavigated', frame => {
  if (frame === page2.mainFrame()) buyNowUrl = frame.url();
});

await page2.locator('#buyNowBtn').click();
await page2.waitForTimeout(600);

// 2a. Navigated to checkout with ?buynow=1
ok('Buy Now navigates to checkout.html?buynow=1',
  buyNowUrl?.includes('checkout.html?buynow=1') || page2.url().includes('buynow=1'),
  `url = ${buyNowUrl || page2.url()}`);

// 2b. aark_buynow contains only the Buy Now product
const buyNowData = await page2.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('aark_buynow') || 'null'); } catch { return null; }
});
ok('aark_buynow written to localStorage', Array.isArray(buyNowData) && buyNowData.length === 1,
  `value = ${JSON.stringify(buyNowData)}`);
ok('aark_buynow contains the correct SKU',
  buyNowData?.[0]?.sku === chosenSku,
  `expected ${chosenSku}, got ${buyNowData?.[0]?.sku}`);
ok('aark_buynow contains the chosen size',
  buyNowData?.[0]?.selectedSize === chosenSize,
  `expected ${chosenSize}, got ${buyNowData?.[0]?.selectedSize}`);

// 2c. aark_cart (real cart) is unchanged — pre-existing item still there
const realCart = await page2.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('aark_cart') || 'null'); } catch { return null; }
});
ok('Real cart (aark_cart) is NOT modified by Buy Now',
  realCart?.[0]?.sku === 'EXISTING' && realCart.length === 1,
  `cart = ${JSON.stringify(realCart)}`);

// 2d. aark_buynow has only 1 item — not merged with real cart
ok('aark_buynow has exactly 1 item (not merged with cart)',
  buyNowData?.length === 1,
  `items = ${buyNowData?.length}`);

await page2.close();

// ─── Suite 3: Edge cases ──────────────────────────────────────────────────────
console.log('\n══ Suite 3: Edge cases ══════════════════════════════════════════════════════');

const page3 = await context.newPage();
await openProduct(page3);

// 3a. Switching sizes keeps buttons enabled and updates selection
await page3.locator('.size-opt').first().click();
await page3.waitForTimeout(100);
const sizeOpts = await page3.locator('.size-opt').count();
if (sizeOpts > 1) {
  await page3.locator('.size-opt').nth(1).click();
  await page3.waitForTimeout(100);
  const secondSizeActive = await page3.locator('.size-opt').nth(1).evaluate(el => el.classList.contains('active'));
  const firstSizeActive  = await page3.locator('.size-opt').first().evaluate(el => el.classList.contains('active'));
  ok('Switching size moves active class to new size', secondSizeActive && !firstSizeActive);
}

// 3b. Adding same product twice (different size) creates separate cart entries
await page3.evaluate(() => { cart.length = 0; renderCart(); saveCart(); }); // clear cart
await page3.locator('.size-opt').first().click();
await page3.waitForTimeout(100);
await page3.locator('#addToCartBtn').click();
await page3.waitForTimeout(200);

if (sizeOpts > 1) {
  await page3.locator('.size-opt').nth(1).click();
  await page3.waitForTimeout(100);
  await page3.locator('#addToCartBtn').click();
  await page3.waitForTimeout(200);
  const cartLen = await page3.evaluate(() => cart.length);
  ok('Same product in two sizes creates two cart entries', cartLen === 2,
    `cart.length = ${cartLen}`);
} else {
  // Only one size — adding twice should increase qty
  await page3.locator('#addToCartBtn').click();
  await page3.waitForTimeout(200);
  const qty = await page3.evaluate(() => cart[0]?.qty || 0);
  ok('Adding same product+size again increments qty', qty === 2,
    `qty = ${qty}`);
}

await page3.close();

// ─── Summary ─────────────────────────────────────────────────────────────────
await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
if (failed > 0) process.exit(1);
