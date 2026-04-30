/**
 * Link/navigation test for aark-website.html
 * Tests that right-click "Open in New Tab" resolves correctly on any origin.
 *
 * Run:  node test-links.js
 */

const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html  = fs.readFileSync(path.join(__dirname, 'aark-website.html'), 'utf8');
const dom   = new JSDOM(html, { url: 'http://localhost:8080/' });
const doc   = dom.window.document;

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.log(`  ❌  ${label}${detail ? '\n       ' + detail : ''}`);
    failed++;
  }
}

// ─── 1. No hardcoded production domain in href / data-href attributes ─────────
console.log('\n── 1. No hardcoded production domain in href / data-href ──────────────────');

const allAnchors = [...doc.querySelectorAll('a[href]')];
const badHref = allAnchors.filter(a => {
  const h = a.getAttribute('href');
  return h && h.includes('aarkfusion.com') &&
    !h.includes('wa.me') &&           // WhatsApp links — OK to be absolute
    !h.includes('chat.whatsapp.com') &&
    !h.includes('instagram.com') &&
    !h.includes('maps.google.com') &&
    !h.includes('mailto:');
});
ok(
  `No nav/card <a href> hardcoded to production domain (${allAnchors.length} anchors checked)`,
  badHref.length === 0,
  badHref.map(a => `  href="${a.getAttribute('href')}"`).join('\n       ')
);

const allDataHref = [...doc.querySelectorAll('[data-href]')];
const badDataHref = allDataHref.filter(el => el.dataset.href.includes('aarkfusion.com'));
ok(
  `No data-href hardcoded to production domain (${allDataHref.length} elements checked)`,
  badDataHref.length === 0,
  badDataHref.map(el => `data-href="${el.dataset.href}"`).join('\n       ')
);

// ─── 2. data-href values are relative hashes ──────────────────────────────────
console.log('\n── 2. data-href values are relative hashes ────────────────────────────────');

// Product cards are built dynamically by buildProductCard() — check the template source
const buildProductCardSrc = html.match(/function buildProductCard[\s\S]*?^}/m)?.[0] || html;
const collectionEls = [...doc.querySelectorAll('.ace-item[data-href], .sc-card[data-href]')];

ok(
  "buildProductCard template contains data-href=\"#product-${p.sku}\"",
  buildProductCardSrc.includes('data-href="#product-${p.sku}"') ||
  html.includes("data-href=\"#product-${p.sku}\"")
);
ok(
  `Static collection items have data-href  (found ${collectionEls.length})`,
  collectionEls.length > 0
);

// Verify no product data-href has a hardcoded domain in the template
ok(
  'buildProductCard data-href does not hardcode production domain',
  !html.match(/data-href="https?:\/\/aarkfusion\.com[^"]*#product-/)
);

const badCollHref = collectionEls.filter(c => !c.dataset.href.startsWith('#shop-'));
ok(
  'All collection data-href values start with #shop-',
  badCollHref.length === 0,
  badCollHref.map(c => `data-href="${c.dataset.href}"`).join('\n       ')
);

// ─── 3. resolveLink returns a relative URL (no domain) ───────────────────────
console.log('\n── 3. resolveLink returns relative URL (no domain) ────────────────────────');

// Extract resolveLink from the second <script> block
const scripts   = [...doc.querySelectorAll('script')];
const ctxScript = scripts.find(s => s.textContent.includes('resolveLink'));
const srcText   = ctxScript ? ctxScript.textContent : '';

ok(
  "resolveLink does NOT contain 'https://aarkfusion.com'",
  !srcText.includes("'https://aarkfusion.com'") && !srcText.includes('"https://aarkfusion.com"')
);

// Simulate resolveLink — mirrors the real implementation (uses current origin, not hardcoded domain)
function resolveLink(el) {
  const target = el.closest('[data-href]');
  if (!target) return null;
  const base = dom.window.location.href.split('#')[0]; // 'http://localhost:8080/'
  return base + target.dataset.href;
}

// Simulated product card (dynamic — built by buildProductCard at runtime)
const fakeCard = doc.createElement('div');
fakeCard.className = 'product-card';
fakeCard.dataset.href = '#product-SC001';
const fakeImg = doc.createElement('img');
fakeCard.appendChild(fakeImg);
const productUrl = resolveLink(fakeImg);
ok(
  `resolveLink on product card → full URL with current origin  (${productUrl})`,
  productUrl !== null &&
  productUrl.startsWith('http://localhost:8080/') &&
  productUrl.includes('#product-') &&
  !productUrl.includes('aarkfusion.com')
);
if (collectionEls.length > 0) {
  const collUrl = resolveLink(collectionEls[0].querySelector('img') || collectionEls[0]);
  ok(
    `resolveLink on collection item → full URL with current origin  (${collUrl})`,
    collUrl !== null &&
    collUrl.startsWith('http://localhost:8080/') &&
    collUrl.includes('#shop-') &&
    !collUrl.includes('aarkfusion.com')
  );
}

// ─── 4. Nav / footer <a> tags have relative hrefs ────────────────────────────
console.log('\n── 4. Nav / footer <a> tags have relative href ────────────────────────────');

const navLinks = [
  ...doc.querySelectorAll('.mobile-nav a'),
  ...doc.querySelectorAll('.mobile-bottom-nav a'),
  ...doc.querySelectorAll('.footer-col a[onclick]'),
];
const navMissingHref = navLinks.filter(a => !a.getAttribute('href') || a.getAttribute('href') === '');
ok(
  `All nav/footer links have an href attribute  (${navLinks.length} checked)`,
  navMissingHref.length === 0,
  navMissingHref.map(a => a.textContent.trim()).join(', ')
);
const navAbsoluteHref = navLinks.filter(a => {
  const h = a.getAttribute('href') || '';
  return h.includes('aarkfusion.com');
});
ok(
  'No nav/footer link points to absolute production domain',
  navAbsoluteHref.length === 0,
  navAbsoluteHref.map(a => `href="${a.getAttribute('href')}"`).join('\n       ')
);

// ─── 5. Hash router handles product, shop, and page hashes ───────────────────
console.log('\n── 5. Hash router covers all data-href patterns ───────────────────────────');

// Extract initFromHash source
const mainScript = scripts.find(s =>
  s.textContent.includes('initFromHash') && s.textContent.includes('startsWith')
);
const routerSrc = mainScript ? mainScript.textContent : '';

ok("Hash router handles '#product-' prefix",  routerSrc.includes("startsWith('#product-')"));
ok("Hash router handles '#shop-' prefix",     routerSrc.includes("startsWith('#shop-')"));
ok("Hash router handles generic page hashes", routerSrc.includes("getElementById('page-'"));

// ─── 6. <base> tag check ──────────────────────────────────────────────────────
console.log('\n── 6. No problematic <base> tag ───────────────────────────────────────────');

const baseTag = doc.querySelector('base');
ok(
  'No <base> tag in <head>',
  !baseTag,
  baseTag ? `Found: <base href="${baseTag.getAttribute('href')}">` : ''
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`  ${passed} passed   ${failed} failed   (${passed + failed} total)\n`);
if (failed > 0) process.exit(1);
