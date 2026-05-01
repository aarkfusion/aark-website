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
  // KF001 absent → all sizes = 0
};

// ── Replicate production filter logic ──────────────────────────────────────────

function getAvailableStock(inventory, sku, size) {
  return Math.max(0, (inventory[sku] || {})[size] || 0);
}

function getFilteredProducts(products, inventory, inventoryLoaded, activeFilters) {
  let filtered = [...products];

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
