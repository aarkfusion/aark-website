/**
 * import-inventory.mjs
 *
 * Bulk-import a new batch of SIMPLE products from a separate Excel file plus a
 * folder of SKU-named images. Validates every known data anomaly, then (with
 * --apply) writes all edits consistently across BOTH mirrored HTML files, the
 * catalog images folder, inventry.xlsx, inventory.json (via build-inventory.mjs)
 * and the test_aark.py hard-coded catalog count.
 *
 * SAFE BY DEFAULT: without --apply it is a dry run — it validates, prints the
 * full plan, and writes nothing.
 *
 *   node import-inventory.mjs --excel <new.xlsx> --images <folder>            # dry run
 *   node import-inventory.mjs --excel <new.xlsx> --images <folder> --apply    # execute
 *
 * Flags:
 *   --excel <path>     (required) the new inventory spreadsheet
 *   --images <path>    (required) folder holding SKU-named product photos
 *   --apply            perform the writes (default: dry run)
 *   --fix-case         auto-uppercase/trim SKU cells instead of rejecting them
 *   --replace <skus>   comma-separated SKUs allowed to overwrite existing ones
 *                      (intentional re-shoot / restock, e.g. --replace SC011,ST010)
 *
 * Excel columns required (header row, case-insensitive SKU header):
 *   "SKU" or "Dress Code" | XS | S | M | L | XL | XXL | Price
 *   (size headers are exact-case, matching build-inventory.mjs)
 *
 * Why price is required: images are named by SKU only, but the storefront derives
 * a product's price from its `SKU_PRICE.ext` catalog filename. There is nowhere
 * else to get it, so the sheet must carry a Price (₹) column.
 */

import {
  readFileSync, writeFileSync, existsSync, copyFileSync,
  readdirSync, statSync, mkdirSync,
} from 'fs';
import { join, extname, basename } from 'path';
import { execFileSync } from 'child_process';
import { read, utils, write as xlsxWrite } from 'xlsx';

// ── Constants shared with the rest of the pipeline ─────────────────────────
const SIZE_COLS      = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const EXCEL_FILE     = 'inventry.xlsx';
const CATALOG_DIR    = 'catalog-images';
const HTML_FILES     = ['index.html', 'aark-website.html'];
const CATALOG_SOURCE = 'index.html';
const TEST_FILE      = 'test_aark.py';
const IMAGE_EXTS     = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SKU_RE         = /^[A-Z]{2,}\d+$/;    // canonical: uppercase letters + digits (SC014, KST016)
const SKUISH_RE      = /^[A-Za-z]{2,}\d+$/; // loose: same shape, any case, NO spaces (rejects "Dress Code")
const PRICE_ALIASES  = ['price', 'cost', 'mrp', 'rate', 'selling price'];

// ── Tiny console helpers ───────────────────────────────────────────────────
const c = {
  red:  s => `\x1b[31m${s}\x1b[0m`,
  grn:  s => `\x1b[32m${s}\x1b[0m`,
  yel:  s => `\x1b[33m${s}\x1b[0m`,
  cyn:  s => `\x1b[36m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim:  s => `\x1b[2m${s}\x1b[0m`,
};
const fatals = [];
const warnings = [];
const fatal = m => fatals.push(m);
const warn  = m => warnings.push(m);

// ── Arg parsing ────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { apply: false, fixCase: false, replace: new Set(), only: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply')          out.apply = true;
    else if (a === '--fix-case')  out.fixCase = true;
    else if (a === '--excel')     out.excel = argv[++i];
    else if (a === '--images')    out.images = argv[++i];
    else if (a === '--replace')   (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => out.replace.add(s));
    else if (a === '--only')      (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => out.only.add(s));
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(c.red(`Unknown argument: ${a}`)); process.exit(2); }
  }
  return out;
}

function usage() {
  console.log(`
${c.bold('import-inventory.mjs')} — bulk-import new simple products

  node import-inventory.mjs --excel <new.xlsx> --images <folder>            ${c.dim('# dry run')}
  node import-inventory.mjs --excel <new.xlsx> --images <folder> --apply    ${c.dim('# execute')}

  --fix-case          auto-uppercase/trim SKU cells
  --replace SKU,SKU   allow overwriting existing SKUs (re-shoot / restock)
  --only SKU,SKU      import ONLY these SKUs; all other Excel rows are ignored
`);
}

// ── Normalize logic mirrored from build-inventory.mjs (single source of order)
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
  for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
  return 0;
}

// ── Derive the SKU from an image filename, tolerating '-' OR '_' OR bare ─────
// Real batches name photos "AK001-1.jpg", "SC014_2.png", or "SH001.jpg". The
// storefront requires underscores, so we extract the leading SKU token here and
// rename to the underscore convention on copy.
function skuOfImage(file) {
  const stem = basename(file, extname(file));
  const m = stem.match(/^([A-Za-z]{2,}\d+)/);            // "AK001-1" -> "AK001", "DSC-0011" -> null
  return m ? m[1].toUpperCase() : null;
}

// ── Natural sort for image numbering (SKU-1/SKU_1/SKU_10 → 1,1,10) ──────────
function imageSeq(file, sku) {
  const stem = basename(file, extname(file));
  const tail = stem.slice(sku.length).replace(/^[-_ ]+/, ''); // "-2" -> "2"  ("" for bare SKU.ext)
  const n = parseInt(tail, 10);
  return isNaN(n) ? 0 : n;
}

// ── Recursively collect image files under a folder ─────────────────────────
function walkImages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkImages(full));
    else if (IMAGE_EXTS.has(extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

// ── Parse existing catalog SKUs + series prefixes from index.html ──────────
function readCatalogState() {
  const html = readFileSync(CATALOG_SOURCE, 'utf-8');

  const cf = html.match(/const CATALOG_FILES\s*=\s*\[([\s\S]*?)\];/);
  const catalogSkus = new Set();
  if (cf) {
    const re = /['"]([A-Z]+\d+)_[^'"]+['"]/g;
    let m; while ((m = re.exec(cf[1])) !== null) catalogSkus.add(m[1]);
  }

  const sm = html.match(/const SERIES_META\s*=\s*\{([\s\S]*?)\n\};/);
  const seriesPrefixes = new Set();
  if (sm) {
    const re = /^\s*([A-Z0-9]{2})\s*:\s*\{/gm;
    let m; while ((m = re.exec(sm[1])) !== null) seriesPrefixes.add(m[1]);
  }
  return { catalogSkus, seriesPrefixes };
}

// ── Scaffold text printed when a SKU has an unknown series prefix ──────────
function seriesScaffold(prefix) {
  return `${c.yel('  ' + prefix)}: {
    series: 'The <Name> Series',
    cat: '<category-slug>',
    categoryLabel: '<Category Label>',
    productLabel: '<Noun>',
    fabric: '<Fabric>',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    fitNote: '<one-line fit note>',
  },`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
const args = parseArgs(process.argv.slice(2));
if (args.help || !args.excel || !args.images) { usage(); process.exit(args.help ? 0 : 2); }

console.log(c.bold(`\n📦 import-inventory  ${args.apply ? c.red('[APPLY]') : c.cyn('[dry run]')}\n`));

if (!existsSync(args.excel))  { console.error(c.red(`Excel not found: ${args.excel}`));   process.exit(2); }
if (!existsSync(args.images)) { console.error(c.red(`Images folder not found: ${args.images}`)); process.exit(2); }
if (!existsSync(EXCEL_FILE))  { console.error(c.red(`${EXCEL_FILE} not found in cwd — run from repo root.`)); process.exit(2); }

// ── Phase 1: parse + validate the new Excel ────────────────────────────────
console.log(c.bold('Phase 1 — Excel parse & validation'));

const wb   = read(readFileSync(args.excel));
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });

const header = (rows[0] || []).map(h => (h || '').toString().trim());
const skuIdx = header.findIndex(h => h.toLowerCase() === 'dress code' || h.toLowerCase() === 'sku');
if (skuIdx === -1) fatal('No "SKU" / "Dress Code" column in the new Excel header.');

const sizeIdx = {};
SIZE_COLS.forEach(sz => { const i = header.findIndex(h => h === sz); if (i !== -1) sizeIdx[sz] = i; });
const missingSizes = SIZE_COLS.filter(sz => !(sz in sizeIdx));
if (missingSizes.length) fatal(`Excel is missing size column(s): ${missingSizes.join(', ')} (must be exact-case ${SIZE_COLS.join(' ')}).`);

const priceIdx = header.findIndex(h => PRICE_ALIASES.includes(h.toLowerCase()));
if (priceIdx === -1) fatal(`No price column in the new Excel (looked for: ${PRICE_ALIASES.map(a => a.replace(/\b\w/g, c => c.toUpperCase())).join(' / ')}). Images are named by SKU only, so a per-SKU ₹ price is required.`);

// Bail early if the header itself is broken — row parsing would be meaningless.
if (fatals.length) { report(); process.exit(1); }

const { catalogSkus, seriesPrefixes } = readCatalogState();

const records = [];          // { sku, sizes:{}, price, rowNum }
const seenSku = new Map();   // sku -> first rowNum (duplicate detection)
const caseFixed = [];
const ignoredRows = [];      // non-SKU section/label rows (e.g. "Kids frocks")
const excluded = [];         // valid SKUs skipped by --only whitelist

for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  let rawSku = (row[skuIdx] ?? '').toString();
  if (!rawSku.trim()) continue;                       // blank / trailing row — skip like build-inventory
  const rowNum = i + 1;

  let sku = rawSku.trim();

  // Section / category label rows (e.g. "Dress Code", "Kids frocks", "Co-ord
  // Sets") aren't SKU-shaped — skip them (reported, not fatal) so a sectioned
  // spreadsheet imports cleanly instead of aborting.
  if (!SKUISH_RE.test(sku)) { ignoredRows.push(`row ${rowNum}: "${sku}"`); continue; }

  // SKU-shaped but lowercase → silently dropped downstream. Offer --fix-case.
  if (!SKU_RE.test(sku)) {
    if (args.fixCase) { caseFixed.push([sku, sku.toUpperCase()]); sku = sku.toUpperCase(); }
    else if (!args.only.size || args.only.has(sku.toUpperCase())) { fatal(`Row ${rowNum}: SKU "${sku}" has lowercase letters — it would be dropped downstream. Use --fix-case or fix the cell.`); continue; }
    else { excluded.push(sku); continue; }
  }

  // --only whitelist: skip everything not explicitly requested BEFORE any
  // prefix/collision checks, so unrelated new-series rows never block the run.
  if (args.only.size && !args.only.has(sku)) { excluded.push(sku); continue; }

  if (seenSku.has(sku)) { fatal(`Duplicate SKU "${sku}" in Excel (rows ${seenSku.get(sku)} and ${rowNum}). Would silently last-wins in build-inventory.`); continue; }
  else seenSku.set(sku, rowNum);

  // Sizes
  const sizes = {};
  let total = 0;
  for (const sz of SIZE_COLS) {
    const raw = row[sizeIdx[sz]];
    const n = Number(raw);
    if (raw !== '' && raw != null && isNaN(n)) warn(`Row ${rowNum} (${sku}): size ${sz}="${raw}" is non-numeric — treated as 0.`);
    const qty = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    if (n < 0) warn(`Row ${rowNum} (${sku}): size ${sz}=${raw} is negative — clamped to 0.`);
    sizes[sz] = qty; total += qty;
  }
  if (total === 0) warn(`${sku}: all sizes are 0 — it will import as sold-out / hidden until restocked.`);

  // Price
  const rawPrice = row[priceIdx];
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0 || Math.trunc(price) !== price) {
    fatal(`Row ${rowNum} (${sku}): Price "${rawPrice}" must be a positive whole number of rupees.`);
  }

  // Series prefix — the site-killer guard. buildProduct does SERIES_META[sku.slice(0,2)].
  const prefix = sku.slice(0, 2);
  if (!seriesPrefixes.has(prefix)) {
    fatal(`${sku}: prefix "${prefix}" has no SERIES_META entry — buildProduct would throw at load and blank the whole site. Add a series block first:\n${seriesScaffold(prefix)}\n  ${c.dim('…and add "' + prefix + '" to PREFIX_ORDER (index.html), SERIES_NAMES (admin.html), and the catalog regex in test_aark.py.')}`);
  }

  // Collision with existing catalog / inventory.
  const inInv = existsSync('inventory.json') && JSON.parse(readFileSync('inventory.json', 'utf-8'))[sku];
  if ((catalogSkus.has(sku) || inInv) && !args.replace.has(sku)) {
    fatal(`${sku}: already exists in the catalog/inventory. Pass --replace ${sku} to intentionally overwrite (re-shoot/restock), or use a new SKU.`);
  }

  records.push({ sku, prefix, sizes, price, rowNum });
}

if (caseFixed.length) {
  console.log(c.yel(`  --fix-case applied to ${caseFixed.length} SKU(s):`));
  caseFixed.forEach(([a, b]) => console.log(`    ${a}  →  ${b}`));
}
if (ignoredRows.length) {
  console.log(c.dim(`  Ignored ${ignoredRows.length} non-SKU / section row(s): ${ignoredRows.map(r => r.split('"')[1]).join(', ')}`));
}
if (args.only.size) {
  console.log(c.cyn(`  --only active: importing ${records.length} of ${records.length + excluded.length} SKU(s); ${excluded.length} excluded.`));
}
console.log(`  Parsed ${c.bold(records.length)} SKU row(s) from ${basename(args.excel)}.`);

// ── Phase 2: match images to SKUs ──────────────────────────────────────────
console.log(c.bold('\nPhase 2 — Image ↔ SKU matching'));

const allImages = walkImages(args.images);
const skuSet = new Set(records.map(r => r.sku));
const bySku = new Map();       // sku -> [file, ...]
const orphanImages = [];

for (const file of allImages) {
  const sku = skuOfImage(file);                         // hyphen/underscore/bare tolerant
  if (sku && skuSet.has(sku)) {
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(file);
  } else {
    orphanImages.push(file);
  }
}
for (const [sku, files] of bySku) files.sort((a, b) => imageSeq(a, sku) - imageSeq(b, sku));

const noImage = records.filter(r => !bySku.has(r.sku));
if (noImage.length) fatal(`No image found for SKU(s): ${noImage.map(r => r.sku).join(', ')} (every Excel SKU needs ≥1 photo named <SKU>*.ext).`);

console.log(`  ${allImages.length} image file(s) scanned · ${bySku.size} SKU(s) matched · ${orphanImages.length} unmatched.`);
if (orphanImages.length) {
  console.log(c.dim(`  Unmatched images (ignored — not in Excel; rename them to a SKU to include):`));
  orphanImages.slice(0, 20).forEach(f => console.log(c.dim(`    ${f}`)));
  if (orphanImages.length > 20) console.log(c.dim(`    …and ${orphanImages.length - 20} more`));
}

// ── Report anomalies; abort before planning if any fatal ───────────────────
if (!report()) process.exit(1);

// ── Phase 3: compute the edit plan ─────────────────────────────────────────
console.log(c.bold('\nPhase 3 — Planned edits'));

const plan = records.map(r => {
  const files = bySku.get(r.sku);
  const primaryExt = extname(files[0]).toLowerCase();
  const catalogFile = `${r.sku}_${r.price}${primaryExt}`;          // e.g. SC014_890.jpg
  const copies = [];                                              // { from, to }
  let productImages = null;

  // Always create the physical catalog file from the first image (single-image
  // fallback path + matches repo convention where SKU_PRICE.ext exists on disk).
  copies.push({ from: files[0], to: join(CATALOG_DIR, catalogFile) });

  if (files.length > 1) {
    const numbered = files.map((f, i) => {
      const ext = extname(f).toLowerCase();
      const to = `${CATALOG_DIR}/${r.sku}_${i + 1}${ext}`;
      copies.push({ from: f, to });
      return to;
    });
    productImages = numbered;                                     // PRODUCT_IMAGES[sku] = [...]
  }

  return { ...r, catalogFile, copies, productImages, imageCount: files.length };
});

for (const p of plan) {
  const stock = SIZE_COLS.filter(s => p.sizes[s] > 0).map(s => `${s}:${p.sizes[s]}`).join(' ') || c.dim('all 0');
  const tag = p.imageCount > 1 ? c.cyn(`${p.imageCount} imgs → PRODUCT_IMAGES`) : c.dim('single image');
  console.log(`  ${c.bold(p.sku.padEnd(8))} ₹${String(p.price).padEnd(5)} ${tag}`);
  console.log(`     catalog: ${p.catalogFile}   stock: ${stock}`);
}

const replaceList = [...args.replace].filter(s => skuSet.has(s));
console.log(`\n  → ${plan.length} product(s), ${plan.reduce((n, p) => n + p.copies.length, 0)} image copy op(s)` +
  (replaceList.length ? `, overwriting ${replaceList.join(', ')}` : '') + '.');
console.log(`  → edits mirrored into: ${HTML_FILES.join(', ')}`);
console.log(`  → inventry.xlsx: ${plan.length} new adult row(s), then rebuild inventory.json via build-inventory.mjs`);

// ── Dry run stops here ─────────────────────────────────────────────────────
if (!args.apply) {
  console.log(c.grn(`\n✔ Dry run complete — nothing written. Re-run with ${c.bold('--apply')} to execute.`));
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 4: APPLY
// ═══════════════════════════════════════════════════════════════════════════
console.log(c.bold(c.red('\nPhase 4 — Applying changes')));

// 4a. Copy images
if (!existsSync(CATALOG_DIR)) mkdirSync(CATALOG_DIR, { recursive: true });
let copied = 0;
for (const p of plan) {
  for (const { from, to } of p.copies) {
    if (existsSync(to) && !args.replace.has(p.sku)) { warn(`Skipped existing file (no --replace): ${to}`); continue; }
    copyFileSync(from, to); copied++;
  }
}
console.log(`  Copied ${copied} image file(s) into ${CATALOG_DIR}/`);

// 4b. Edit both HTML files (idempotent per SKU)
for (const htmlFile of HTML_FILES) {
  let html = readFileSync(htmlFile, 'utf-8');

  // CATALOG_FILES — insert lines before the closing "];"
  const cfLines = plan
    .filter(p => !new RegExp(`['"]${p.sku}_[^'"]+['"]`).test(html))   // skip if already present
    .map(p => `  '${p.catalogFile}',`);
  if (cfLines.length) {
    html = html.replace(/(const CATALOG_FILES\s*=\s*\[[\s\S]*?)(\n\];)/,
      (_, body, close) => `${body}\n${cfLines.join('\n')}${close}`);
  }

  // PRODUCT_IMAGES — insert entries before the closing "};" (multi-image only)
  const piLines = plan
    .filter(p => p.productImages)
    .filter(p => !new RegExp(`\\n\\s*${p.sku}\\s*:`).test(html.match(/const PRODUCT_IMAGES\s*=\s*\{[\s\S]*?\n\};/)?.[0] || ''))
    .map(p => `  ${p.sku}: [${p.productImages.map(i => `'${i}'`).join(',')}],`);
  if (piLines.length) {
    html = html.replace(/(const PRODUCT_IMAGES\s*=\s*\{[\s\S]*?)(\n\};)/,
      (_, body, close) => `${body}\n${piLines.join('\n')}${close}`);
  }

  writeFileSync(htmlFile, html);
  console.log(`  ${htmlFile}: +${cfLines.length} CATALOG_FILES, +${piLines.length} PRODUCT_IMAGES`);
}

// Guard: assert the two HTML mirrors received identical catalog additions.
{
  const cf = f => (readFileSync(f, 'utf-8').match(/const CATALOG_FILES\s*=\s*\[([\s\S]*?)\];/) || [, ''])[1];
  const skusOf = body => [...body.matchAll(/['"]([A-Z]+\d+)_[^'"]+['"]/g)].map(m => m[1]).sort().join(',');
  if (skusOf(cf('index.html')) !== skusOf(cf('aark-website.html'))) {
    console.error(c.red('  ✗ index.html and aark-website.html CATALOG_FILES drifted — investigate before committing.'));
    process.exit(1);
  }
  console.log(c.grn('  ✔ Both HTML files carry identical catalog SKUs.'));
}

// 4c. Append rows to inventry.xlsx (adult sizes), rebuild inventory.json
{
  const iwb = read(readFileSync(EXCEL_FILE));
  const iws = iwb.Sheets[iwb.SheetNames[0]];
  const aoa = utils.sheet_to_json(iws, { header: 1, defval: '' });
  const ih = (aoa[0] || []).map(h => (h || '').toString().trim());
  const iSku = ih.findIndex(h => h.toLowerCase() === 'dress code' || h.toLowerCase() === 'sku');
  const iSize = {}; SIZE_COLS.forEach(sz => { iSize[sz] = ih.findIndex(h => h === sz); });

  // Keep header + existing non-empty rows, then append new rows aligned to columns.
  const kept = [aoa[0], ...aoa.slice(1).filter(r => (r[iSku] ?? '').toString().trim())];
  for (const p of plan) {
    // If replacing, drop any pre-existing row for this SKU first.
    const existingRow = kept.findIndex((r, i) => i > 0 && (r[iSku] ?? '').toString().trim() === p.sku);
    if (existingRow !== -1) kept.splice(existingRow, 1);
    const row = new Array(ih.length).fill('');
    row[iSku] = p.sku;
    SIZE_COLS.forEach(sz => { if (iSize[sz] !== -1) row[iSize[sz]] = p.sizes[sz]; });
    kept.push(row);
  }
  const newWs = utils.aoa_to_sheet(kept);
  iwb.Sheets[iwb.SheetNames[0]] = newWs;
  writeFileSync(EXCEL_FILE, xlsxWrite(iwb, { type: 'buffer', bookType: 'xlsx' }));
  console.log(`  Appended ${plan.length} row(s) to ${EXCEL_FILE}`);
}

console.log('  Rebuilding inventory.json via build-inventory.mjs …');
try {
  const out = execFileSync('node', ['build-inventory.mjs'], { encoding: 'utf-8' });
  console.log(out.split('\n').map(l => '    ' + l).join('\n'));
} catch (e) {
  console.error(c.red('  ✗ build-inventory.mjs failed:'));
  console.error((e.stdout || '') + (e.stderr || ''));
  process.exit(1);
}

// 4d. Patch test_aark.py hard-coded catalog count
{
  let tpy = readFileSync(TEST_FILE, 'utf-8');
  const inv = JSON.parse(readFileSync('inventory.json', 'utf-8'));
  const html = readFileSync('index.html', 'utf-8');
  const cat = [...new Set([...html.matchAll(/'([A-Z]+\d+)_\d+\.\w+'/g)].map(m => m[1]))];
  const tracked = cat.filter(s => s in inv).length;

  const before = tpy;
  tpy = tpy.replace(/len\(tracked\) == \d+/, `len(tracked) == ${tracked}`);
  tpy = tpy.replace(/All \d+ catalog SKUs now tracked/, `All ${tracked} catalog SKUs now tracked`);
  if (tpy !== before) { writeFileSync(TEST_FILE, tpy); console.log(`  ${TEST_FILE}: catalog count → ${tracked}`); }
  else console.log(c.yel(`  ${TEST_FILE}: count pattern not found — verify manually (expected ${tracked}).`));
}

if (warnings.length) { console.log(c.yel(`\n⚠ ${warnings.length} warning(s):`)); warnings.forEach(w => console.log('  ' + w)); }

console.log(c.bold('\nGit diff summary:'));
try { console.log(execFileSync('git', ['diff', '--stat'], { encoding: 'utf-8' })); } catch { /* non-fatal */ }

console.log(c.grn(c.bold('✔ Import applied.')) + ' Next: run `node test-filters.mjs` and `python3 test_aark.py`, then review before committing.\n');

// ── Reporting helper: prints anomalies, returns false if any fatal ─────────
function report() {
  if (warnings.length) {
    console.log(c.yel(`\n⚠ ${warnings.length} warning(s):`));
    warnings.forEach(w => console.log('  ' + w));
    warnings.length = 0;
  }
  if (fatals.length) {
    console.log(c.red(`\n✗ ${fatals.length} blocking issue(s) — nothing was written:`));
    fatals.forEach(f => console.log('  ' + c.red('•') + ' ' + f));
    console.log(c.dim('\nResolve the above and re-run.'));
    return false;
  }
  return true;
}
