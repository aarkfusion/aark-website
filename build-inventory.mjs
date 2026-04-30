/**
 * build-inventory.js
 *
 * Reads inventry.xlsx → writes inventory.json
 *
 * Columns in Excel: Dress Code | (empty) | XS | S | M | L | XL | XXL
 *
 * Usage: node build-inventory.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { read, utils } from 'xlsx';

const EXCEL_FILE  = 'inventry.xlsx';
const OUTPUT_FILE = 'inventory.json';

const SIZE_COLS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

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
  inventory[sku] = stock;
}

writeFileSync(OUTPUT_FILE, JSON.stringify(inventory, null, 2));

const skuCount = Object.keys(inventory).length;
const totalUnits = Object.values(inventory)
  .flatMap(s => Object.values(s))
  .reduce((a, b) => a + b, 0);

console.log(`✅  inventory.json written  (${skuCount} SKUs, ${totalUnits} total units)`);
console.log('\nStock summary:');
for (const [sku, stock] of Object.entries(inventory)) {
  const total = Object.values(stock).reduce((a, b) => a + b, 0);
  const breakdown = SIZE_COLS.filter(s => stock[s] > 0)
    .map(s => `${s}:${stock[s]}`).join(' ');
  console.log(`  ${sku.padEnd(8)} ${total > 0 ? breakdown || 'all 0' : 'SOLD OUT'}`);
}
