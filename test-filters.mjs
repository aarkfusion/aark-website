// test-filters.mjs
// Unit tests for the size filter feature (replaces price range filter)
// Run: node test-filters.mjs

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', X = '\x1b[0m';
let passed = 0, failed = 0;

function assert(condition, message) {
  if (condition) { console.log(`  ${G}✓${X} ${message}`); passed++; }
  else           { console.log(`  ${R}✗ FAIL${X}: ${message}`); failed++; }
}
function suite(name) { console.log(`\n${B}${Y}▶ ${name}${X}`); }

// ── Mock data ──────────────────────────────────────────────────────────────────

const mockProducts = [
  { id: 1, sku: 'SC001', cat: 'straight-cut-kurtis', sizes: ['XS','S','M','L','XL','XXL'], price: 850 },
  { id: 2, sku: 'SC002', cat: 'straight-cut-kurtis', sizes: ['S','M','L','XL'],            price: 750 },
  { id: 3, sku: 'F0002', cat: 'frocks',              sizes: ['XS','S','M','L','XL','XXL'], price: 1150 },
  { id: 4, sku: 'ST011', cat: 'fusion-tops',         sizes: ['XS','S','M','L'],            price: 900 },
  { id: 5, sku: 'KF001', cat: 'kids-frocks',         sizes: ['2-3yr','4-5yr','6-7yr'],     price: 650 },
];

const mockInventory = {
  SC001: { XS: 2, S: 3, M: 0, L: 1, XL: 0, XXL: 2 },
  SC002: { S: 0, M: 0, L: 1, XL: 2 },
  F0002: { XS: 1, S: 2, M: 3, L: 1, XL: 2, XXL: 0 },
  ST011: { XS: 0, S: 1, M: 2, L: 0 },
  KF001: { '2-3yr': 2, '4-5yr': 1, '6-7yr': 0 }, // tracked with stock
};

// ── Replicate production filter logic ──────────────────────────────────────────

function getAvailableStock(inventory, sku, size) {
  return Math.max(0, (inventory[sku] || {})[size] || 0);
}

function isFullySoldOut(p, inventory, inventoryLoaded, variantGroups, products) {
  if (!inventoryLoaded) return false;
  if (p.isGroupRep && p.variantGroupKey) {
    const grp = variantGroups[p.variantGroupKey];
    if (!grp) return false;
    return !grp.patterns.some(pt => {
      if (!inventory.hasOwnProperty(pt.sku)) return false; // untracked = sold out
      const ptProd = products.find(x => x.sku === pt.sku);
      if (!ptProd) return false;
      const ptSizes = ptProd.sizes;
      return !ptSizes.every(s => getAvailableStock(inventory, pt.sku, s) === 0);
    });
  }
  if (!inventory.hasOwnProperty(p.sku)) return true; // untracked = hidden
  return p.sizes.every(s => getAvailableStock(inventory, p.sku, s) === 0);
}

// allProducts: full catalog (includes isGroupHidden items) so group-sold-out check can find all patterns.
// Matches production where isFullySoldOut closes over the global `products` array.
function getFilteredProducts(products, inventory, inventoryLoaded, activeFilters, variantGroups = {}, allProducts = null) {
  const fullList = allProducts || products;
  let filtered = products.filter(p => !isFullySoldOut(p, inventory, inventoryLoaded, variantGroups, fullList));

  if (activeFilters.category) {
    filtered = filtered.filter(p => p.cat === activeFilters.category);
  }

  if (activeFilters.size) {
    const sz = activeFilters.size;
    filtered = filtered.filter(p => {
      if (!p.sizes.includes(sz)) return false;           // wrong size range entirely
      if (!inventoryLoaded) return true;                  // inventory not ready
      if (!inventory.hasOwnProperty(p.sku)) return true; // untracked SKU → assume available
      return getAvailableStock(inventory, p.sku, sz) > 0; // tracked → must have stock
    });
  }

  return filtered;
}

// ── Suite 1: Price range filter is fully gone ──────────────────────────────────
suite('Price Range Filter Removed');
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { priceRange: 'under800' });
  assert(r.length === mockProducts.length, 'priceRange key is ignored — all products returned');
}

// ── Suite 2: Size filter before inventory loads ────────────────────────────────
suite('Size Filter — inventory not yet loaded');
{
  const r = getFilteredProducts(mockProducts, {}, false, { size: 'XS' });
  assert(r.length === 3,              'XS: 3 products have XS in sizes array (SC001, F0002, ST011)');
  assert(!r.find(p=>p.sku==='SC002'), 'SC002 excluded — no XS in sizes');
  assert(!r.find(p=>p.sku==='KF001'), 'KF001 excluded — kids sizes only');
}
{
  const r = getFilteredProducts(mockProducts, {}, false, { size: 'M' });
  assert(r.length === 4,              'M: 4 products have M in sizes array');
  assert(!r.find(p=>p.sku==='KF001'), 'KF001 excluded');
}

// ── Suite 3: Size filter after inventory loads (stock-aware) ───────────────────
suite('Size Filter — inventory loaded (stock-aware)');
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { size: 'XS' });
  // SC001:XS=2✓  F0002:XS=1✓  ST011:XS=0✗
  assert(r.length === 2,               'XS in stock: SC001 and F0002 only');
  assert( r.find(p=>p.sku==='SC001'), 'SC001 shown (XS stock=2)');
  assert( r.find(p=>p.sku==='F0002'), 'F0002 shown (XS stock=1)');
  assert(!r.find(p=>p.sku==='ST011'), 'ST011 hidden (XS stock=0)');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { size: 'M' });
  // SC001:M=0✗  SC002:M=0✗  F0002:M=3✓  ST011:M=2✓
  assert(r.length === 2,               'M in stock: F0002 and ST011 only');
  assert( r.find(p=>p.sku==='F0002'), 'F0002 shown (M stock=3)');
  assert( r.find(p=>p.sku==='ST011'), 'ST011 shown (M stock=2)');
  assert(!r.find(p=>p.sku==='SC001'), 'SC001 hidden (M stock=0)');
  assert(!r.find(p=>p.sku==='SC002'), 'SC002 hidden (M stock=0)');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { size: 'L' });
  // SC001:L=1✓  SC002:L=1✓  F0002:L=1✓  ST011:L=0✗
  assert(r.length === 3,               'L in stock: SC001, SC002, F0002');
  assert(!r.find(p=>p.sku==='ST011'), 'ST011 hidden (L stock=0)');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { size: 'XXL' });
  // SC001:XXL=2✓  F0002:XXL=0✗  SC002:no XXL
  assert(r.length === 1,               'XXL in stock: SC001 only');
  assert( r.find(p=>p.sku==='SC001'), 'SC001 shown (XXL stock=2)');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { size: 'S' });
  // SC001:S=3✓  SC002:S=0✗  F0002:S=2✓  ST011:S=1✓
  assert(r.length === 3,               'S in stock: SC001, F0002, ST011');
  assert(!r.find(p=>p.sku==='SC002'), 'SC002 hidden (S stock=0)');
}

// ── Suite 4: Combined category + size ─────────────────────────────────────────
suite('Combined Category + Size Filter');
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { category:'frocks', size:'XS' });
  assert(r.length === 1 && r[0].sku === 'F0002', 'Frocks + XS: only F0002');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { category:'straight-cut-kurtis', size:'M' });
  assert(r.length === 0, 'Straight-cut-kurtis + M: none in stock (both M=0)');
}
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, { category:'fusion-tops', size:'S' });
  assert(r.length === 1 && r[0].sku === 'ST011', 'Fusion-tops + S: ST011 (S stock=1)');
}

// ── Suite 5: No filters ────────────────────────────────────────────────────────
suite('No Filters');
{
  const r = getFilteredProducts(mockProducts, mockInventory, true, {});
  assert(r.length === mockProducts.length, 'All products shown when no filters active');
}

// ── Suite 6: Kids products always excluded from adult size filters ──────────────
suite('Kids Products vs Adult Size Filter');
{
  ['XS','S','M','L','XL','XXL'].forEach(sz => {
    const r = getFilteredProducts(mockProducts, mockInventory, true, { size: sz });
    assert(!r.find(p=>p.sku==='KF001'), `KF001 excluded for size filter "${sz}"`);
  });
}

// ── Suite 7: Clear filters ─────────────────────────────────────────────────────
suite('Clear Filters');
{
  let af = { size: 'XS', category: 'frocks' };
  af = {};
  const r = getFilteredProducts(mockProducts, mockInventory, true, af);
  assert(r.length === mockProducts.length, 'After clear: all products shown');
}

// ── Suite 8: Sold-out product hiding ──────────────────────────────────────────
suite('Sold-Out Product Hiding');
{
  const soldOutProducts = [
    { id: 10, sku: 'SC013', cat: 'straight-cut-kurtis', sizes: ['XS','S','M','L','XL','XXL'], isGroupRep: false, variantGroupKey: null },
    { id: 11, sku: 'SC004', cat: 'straight-cut-kurtis', sizes: ['XS','S','M','L','XL','XXL'], isGroupRep: true,  variantGroupKey: 'riju-kurti-2' },
    { id: 12, sku: 'SC005', cat: 'straight-cut-kurtis', sizes: ['XS','S','M','L','XL','XXL'], isGroupRep: false, variantGroupKey: 'riju-kurti-2', isGroupHidden: true },
    { id: 13, sku: 'STGRP', cat: 'fusion-tops',         sizes: ['XS','S','M','L','XL'],       isGroupRep: true,  variantGroupKey: 'all-dead-group' },
    { id: 14, sku: 'STPAT', cat: 'fusion-tops',         sizes: ['XS','S','M','L','XL'],       isGroupRep: false, variantGroupKey: 'all-dead-group', isGroupHidden: true },
  ];
  const soldOutInventory = {
    SC013: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 },  // fully sold out standalone
    SC004: { XS:0, S:0, M:0, L:0, XL:0, XXL:0 },  // one sold-out pattern in group
    SC005: { XS:0, S:0, M:1, L:0, XL:0, XXL:0 },  // in-stock pattern keeps group visible
    STGRP: { XS:0, S:0, M:0, L:0, XL:0 },          // both patterns sold out
    STPAT: { XS:0, S:0, M:0, L:0, XL:0 },
  };
  const mockGroups = {
    'riju-kurti-2': { repSku: 'SC004', patterns: [{ sku:'SC004' }, { sku:'SC005' }] },
    'all-dead-group': { repSku: 'STGRP', patterns: [{ sku:'STGRP' }, { sku:'STPAT' }] },
  };

  // Standalone — all sizes 0 → hidden
  const visProducts = soldOutProducts.filter(p => !p.isGroupHidden);
  // Pass full soldOutProducts so group pattern lookup can find isGroupHidden siblings
  const r1 = getFilteredProducts(visProducts, soldOutInventory, true, {}, mockGroups, soldOutProducts);
  assert(!r1.find(p => p.sku === 'SC013'), 'SC013 hidden — standalone, all sizes 0');

  // Group rep — group has one in-stock pattern → stays visible
  assert(!!r1.find(p => p.sku === 'SC004'), 'SC004 group stays visible — SC005 has M:1 in stock');

  // Group rep — all patterns fully sold out → hidden
  assert(!r1.find(p => p.sku === 'STGRP'), 'STGRP group hidden — all patterns at zero');

  // Inventory not loaded → nothing hidden (show all)
  const r2 = getFilteredProducts(visProducts, soldOutInventory, false, {}, mockGroups, soldOutProducts);
  assert(!!r2.find(p => p.sku === 'SC013'), 'SC013 visible when inventoryLoaded=false');
  assert(r2.length === visProducts.length, 'All products shown when inventory not yet loaded');

  // Untracked product → hidden (absent from inventory.json means zero stock)
  const untrackedProducts = [{ id:20, sku:'KF099', cat:'kids-frocks', sizes:['2-3yr'], isGroupRep:false, variantGroupKey:null }];
  const r3 = getFilteredProducts(untrackedProducts, {}, true, {}, {});
  assert(!r3.find(p => p.sku === 'KF099'), 'Untracked SKU is hidden — absent from inventory.json means no stock');

  // Untracked product → visible when inventory not yet loaded
  const r3b = getFilteredProducts(untrackedProducts, {}, false, {}, {});
  assert(!!r3b.find(p => p.sku === 'KF099'), 'Untracked SKU visible before inventory loads');
}

// ── Suite 9: initHomeGrids null-safety ────────────────────────────────────────
// Root cause: initHomeGrids threw when homeProductGrid element was absent,
// silently killing initShopGrid() in the same fetch callback.
suite('initHomeGrids null-safety');
{
  function simulateInitHomeGrids(getElementById, products, inventory, inventoryLoaded, variantGroups) {
    const el = getElementById('homeProductGrid');
    if (!el) return 'early-return'; // guard — must not throw
    const full = products.filter(p => !p.isGroupHidden && !isFullySoldOut(p, inventory, inventoryLoaded, variantGroups, products));
    el.innerHTML = full.map(p => p.sku).join(',');
    return 'rendered';
  }

  // Element absent → returns early without throwing (would have killed initShopGrid)
  const noEl = simulateInitHomeGrids(() => null, mockProducts, mockInventory, true, {});
  assert(noEl === 'early-return', 'initHomeGrids returns early when homeProductGrid is absent');

  // Element present → renders normally (use mockInventory so products aren't all hidden as untracked)
  const fakeEl = { innerHTML: '' };
  const withEl = simulateInitHomeGrids(() => fakeEl, mockProducts, mockInventory, true, {});
  assert(withEl === 'rendered', 'initHomeGrids renders when element exists');
  assert(fakeEl.innerHTML.length > 0, 'innerHTML is populated when element exists');
}

// ── Summary ────────────────────────────────────────────────────────────────────
const bar = '─'.repeat(52);
console.log(`\n${bar}`);
const summary = `${B}Results: ${G}${passed} passed${X}${B}, ${failed > 0 ? R : G}${failed} failed${X}`;
console.log(summary);
if (failed === 0) {
  console.log(`${G}${B}✓ All tests passed — safe to push!${X}\n`);
  process.exit(0);
} else {
  console.log(`${R}${B}✗ Fix failures before pushing.${X}\n`);
  process.exit(1);
}
