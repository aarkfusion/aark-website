/**
 * build-inventory.js
 *
 * Reads inventry.xlsx → writes inventory.json
 *
 * Columns in Excel: Dress Code | (empty) | XS | S | M | L | XL | XXL
 *
 * Usage: node build-inventory.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { read, utils } from 'xlsx';

const EXCEL_FILE  = 'inventry.xlsx';
const OUTPUT_FILE = 'inventory.json';

const SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Preserve admin-set price fields (and any non-adult-size keys, e.g. kids "5-6yr") from the
// existing inventory.json so this script doesn't clobber edits made via the admin page.
const existing = existsSync(OUTPUT_FILE)
  ? JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
  : {};

const wb   = read(readFileSync(EXCEL_FILE));
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { header: 1 });

// Skip header row (index 0)
const inventory = {};
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const sku = (row[0] || '').toString().trim();
  if (!sku) continue;

  const stock = {};
  SIZE_COLS.forEach((size, colOffset) => {
    const qty = Number(row[colOffset + 2]) || 0;
    stock[size] = qty;
  });
  // Carry forward admin-set price for this SKU
  if (existing[sku] && typeof existing[sku].price === 'number') {
    stock.price = existing[sku].price;
  }
  inventory[sku] = stock;
}

// Carry forward SKUs that exist only in the JSON (e.g. kids SKUs with non-adult size keys
// that the Excel doesn't track). These would otherwise be dropped on rebuild.
for (const [sku, row] of Object.entries(existing)) {
  if (!(sku in inventory)) inventory[sku] = row;
}

writeFileSync(OUTPUT_FILE, JSON.stringify(inventory, null, 2));

const isStock = (k) => k !== 'price';
const skuCount = Object.keys(inventory).length;
const totalUnits = Object.values(inventory)
  .flatMap(s => Object.entries(s).filter(([k]) => isStock(k)).map(([, v]) => v))
  .reduce((a, b) => a + b, 0);

console.log(`✅  inventory.json written  (${skuCount} SKUs, ${totalUnits} total units)`);
console.log('\nStock summary:');
for (const [sku, stock] of Object.entries(inventory)) {
  const total = Object.entries(stock)
    .filter(([k]) => isStock(k))
    .reduce((a, [, v]) => a + v, 0);
  const breakdown = Object.entries(stock)
    .filter(([k, v]) => isStock(k) && v > 0)
    .map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${sku.padEnd(8)} ${total > 0 ? breakdown || 'all 0' : 'SOLD OUT'}`);
}
