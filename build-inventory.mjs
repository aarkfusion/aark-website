/**
 * build-inventory.mjs
 *
 * Reads inventry.xlsx → writes inventory.json
 *
 * Excel columns are looked up by header name (e.g. "Dress Code", "XS", ...)
 * rather than by position, so re-arranging or adding columns in the sheet
 * doesn't silently shift every SKU's stock by one slot.
 *
 * Behavior:
 *  - Only writes SKUs that exist in CATALOG_FILES (i.e. have product photos
 *    on the site). Excel rows for SKUs without a corresponding catalog
 *    entry are reported as "skipped" so a dev knows what's missing.
 *  - Preserves existing inventory.json entries for SKUs that aren't in the
 *    Excel sheet (e.g. kids products with non-adult size keys).
 *  - Preserves admin-edited `price` fields per SKU.
 *  - Normalizes output: SKUs alphabetical, size keys in canonical order
 *    (XS, S, M, L, XL, XXL → then kids by numeric age start → `price` last).
 *    Matches the backend's _normalize_inventory() so admin saves and this
 *    script always produce the same shape.
 *
 * Usage: node build-inventory.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { read, utils } from 'xlsx';

const EXCEL_FILE     = 'inventry.xlsx';
const OUTPUT_FILE    = 'inventory.json';
const CATALOG_SOURCE = 'index.html';

const SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// ── 1. Discover which SKUs have photos (i.e. are in CATALOG_FILES) ─────────
const catalogText = readFileSync(CATALOG_SOURCE, 'utf-8');
const cfBlock = catalogText.match(/const CATALOG_FILES\s*=\s*\[([\s\S]*?)\];/);
const photographedSkus = new Set();
if (cfBlock) {
  const re = /['"]([A-Z]+\d+)_[^'"]+['"]/g;
  let m;
  while ((m = re.exec(cfBlock[1])) !== null) photographedSkus.add(m[1]);
}
if (!photographedSkus.size) {
  console.error('⚠️  Could not find CATALOG_FILES in index.html — aborting to avoid clobbering inventory.');
  process.exit(1);
}

// ── 2. Read the existing JSON (preserve prices & non-Excel SKUs) ───────────
const existing = existsSync(OUTPUT_FILE)
  ? JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
  : {};

// ── 3. Read Excel and split into "in-catalog" vs "skipped" ─────────────────
const wb   = read(readFileSync(EXCEL_FILE));
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });

// Build a header-name → column-index map so we tolerate column reordering
// (and the historical "Dress Code | (empty) | XS | ..." vs current "Dress
// Code | XS | ..." shift that previously mis-labeled every size by one).
const header = (rows[0] || []).map((h) => (h || '').toString().trim());
const skuColIdx = header.findIndex((h) => h.toLowerCase() === 'dress code' || h.toLowerCase() === 'sku');
if (skuColIdx === -1) {
  console.error('⚠️  No "Dress Code" / "SKU" column in the Excel header — aborting.');
  process.exit(1);
}
const sizeColIdx = {};
SIZE_COLS.forEach((sz) => {
  const idx = header.findIndex((h) => h === sz);
  if (idx !== -1) sizeColIdx[sz] = idx;
});
const missingSizes = SIZE_COLS.filter((sz) => !(sz in sizeColIdx));
if (missingSizes.length) {
  console.error(`⚠️  Excel header is missing size column(s): ${missingSizes.join(', ')} — aborting.`);
  process.exit(1);
}

const inventory = {};
const skipped   = [];   // SKUs in Excel but not photographed yet

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const sku = (row[skuColIdx] || '').toString().trim();
  if (!sku) continue;

  const stock = {};
  SIZE_COLS.forEach((size) => {
    stock[size] = Number(row[sizeColIdx[size]]) || 0;
  });

  if (!photographedSkus.has(sku)) {
    skipped.push(sku);
    continue;
  }

  // Carry forward admin-set price for this SKU
  if (existing[sku] && typeof existing[sku].price === 'number') {
    stock.price = existing[sku].price;
  }
  inventory[sku] = stock;
}

// ── 4. Carry forward catalog SKUs that aren't in the Excel sheet ───────────
// (e.g. kids KST* with non-adult size keys the spreadsheet doesn't track)
for (const sku of photographedSkus) {
  if (!(sku in inventory) && existing[sku]) {
    inventory[sku] = existing[sku];
  }
}

// ── 5. Normalize: SKUs alphabetical; sizes XS→XXL → kids → price last ─────
const ADULT_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function sizeRank(k) {
  if (k === 'price') return [3, 0, ''];
  const i = ADULT_ORDER.indexOf(k);
  if (i !== -1) return [0, i, ''];
  const n = parseInt(String(k).split('-')[0], 10);
  if (!isNaN(n)) return [1, n, ''];
  return [2, 0, k];
}
function cmpRank(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
const normalized = {};
for (const sku of Object.keys(inventory).sort()) {
  const row = inventory[sku];
  const sortedRow = {};
  for (const k of Object.keys(row).sort((a, b) => cmpRank(sizeRank(a), sizeRank(b)))) {
    sortedRow[k] = row[k];
  }
  normalized[sku] = sortedRow;
}

writeFileSync(OUTPUT_FILE, JSON.stringify(normalized, null, 2) + '\n');

// ── 6. Report ─────────────────────────────────────────────────────────────
const isStock = (k) => k !== 'price';
const skuCount = Object.keys(normalized).length;
const totalUnits = Object.values(normalized)
  .flatMap(s => Object.entries(s).filter(([k]) => isStock(k)).map(([, v]) => v))
  .reduce((a, b) => a + b, 0);

console.log(`✅  inventory.json written  (${skuCount} SKUs, ${totalUnits} total units)`);

if (skipped.length) {
  console.log(`\n⚠️  Excel rows ignored — no photo / catalog entry yet  (${skipped.length}):`);
  skipped.forEach(s => console.log(`     ${s}`));
} else {
  console.log('\n✅  Every Excel row has a corresponding catalog entry.');
}

console.log('\nStock summary:');
for (const [sku, stock] of Object.entries(normalized)) {
  const total = Object.entries(stock).filter(([k]) => isStock(k)).reduce((a, [, v]) => a + v, 0);
  const breakdown = Object.entries(stock)
    .filter(([k, v]) => isStock(k) && v > 0)
    .map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${sku.padEnd(8)} ${total > 0 ? breakdown || 'all 0' : 'SOLD OUT'}`);
}
