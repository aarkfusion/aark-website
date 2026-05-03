# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the primary test suite (must pass before every push)
node test-filters.mjs

# Sync inventory from remote before pushing (run before every git push)
python3 .claude/sync-inventory.py

# Rebuild inventory.json from the Excel file (inventry.xlsx)
node build-inventory.mjs

# Playwright-based tests (require a local server running on port 8080)
node test-back.mjs          # backend connectivity
node test-cart-buynow.mjs   # cart + buy-now flows
node test-navigation.mjs    # SPA hash routing / new-tab behaviour
node test-newwindow.mjs     # right-click → open in new tab
node test-links.js          # link integrity
```

**Pre-push protocol (enforced by hook):**
1. `python3 .claude/sync-inventory.py` — fetches remote `inventory.json` and merges sales-driven stock reductions. If it exits non-zero, commit the updated `inventory.json` first.
2. Push runs the full test suite automatically; the hook blocks on any failure.

## Architecture

### Two parallel HTML files

All feature work happens in **both files simultaneously**:

| File | Purpose |
|------|---------|
| `index.html` | Live production site (served at `aarkfusion.com`) |
| `aark-website.html` | Development/preview mirror — kept in sync with `index.html` |

Both files are self-contained single-page apps — all HTML, CSS, and JS in one file each. There is no build step or bundler.

### SPA routing

`showPage(pageId)` swaps `display` between named page `<div>`s (`#page-home`, `#page-shop`, `#page-product`, `#page-collections`, etc.) and pushes to `history`. Back/forward is handled by a `popstate` listener at the bottom of the file.

### Product catalog pipeline

```
CATALOG_FILES[]          → buildProduct() → products[]
SERIES_META{}            ↗
PRODUCT_IMAGES{}         ↗ (multi-photo overrides)
VARIANT_GROUPS{}         ↗ (grouping logic)
```

- **`CATALOG_FILES`** — flat list of `SKU_price.ext` filenames. Each entry creates one product object.
- **`SERIES_META`** — keyed by 2-letter prefix (`SC`, `ST`, `F0`, `KF`). Holds series name, category, sizes, fabric, etc.
- **`PRODUCT_IMAGES`** — optional per-SKU override supplying multiple numbered images (`SKU_1.png`, `SKU_2.png` …). Products without an entry use the catalog filename as their single image.
- **`VARIANT_GROUPS`** — groups multiple SKUs into one product card. The `repSku` is the card shown in the grid; the rest get `isGroupHidden: true` and are filtered out of all grid renders. Each pattern has a `name` and `imgs[]`.
- **`SKU_TO_VARIANT_GROUP`** — reverse map built from `VARIANT_GROUPS` at startup.

### Inventory and stock

`inventory.json` is fetched at page load and merged into `let inventory`. `inventoryLoaded` flips to `true` once the fetch resolves; grids re-render at that point.

`getAvailableStock(sku, size)` = `inventory[sku][size]` minus `getConfirmedDeductions(sku, size)`. Confirmed deductions are permanent reductions stored in `localStorage` under `aark_confirmed_deductions`; they accumulate across sessions as orders are placed.

Products with `allowCart: false` (or no numeric price) route WhatsApp-only — no cart/checkout UI is shown.

### Variant product detail

`openProduct(id)` — for group-rep products, delegates immediately to `openVariantProduct(groupKey, addToHistory, initialSku)`.

`openVariantProduct` builds the full detail page HTML inline. `initialSku` pre-selects which pattern's gallery and size availability is shown first.

`switchVariant(sku, el)` — called from the swatch picker inside the detail page; rebuilds the gallery and refreshes size buttons without a full page re-render.

### Card-level swatch UX (group cards only)

- `buildProductCard` computes `displayPattern` = first in-stock pattern (fallback: first pattern). Card image and `cs-active` swatch reflect this.
- `cardSwatchEnter/Leave` swap the card image and toggle `.card-so-badge` visibility based on `data-sold-out` on each swatch element.
- `cardSwatchClick` sets `cs-active`, then calls `openVariantProduct(..., initialSku)`.
- A group card is only marked "Sold Out" and pushed to the bottom of grids when **all** patterns are out of stock.

### Sale module (`sale/`)

Loaded as separate scripts after the main body. All dates, discount %, and coupon code live exclusively in `sale/saleConfig.js` — edit only that file to change sale parameters.

| File | Role |
|------|------|
| `saleConfig.js` | Central config: `SALE_START`, `SALE_END`, `SALE_COUPON_CODE`, `SALE_DISCOUNT_PERCENT`, shipping thresholds |
| `couponEngine.js` | `getSaleState()` → `'teaser' \| 'live' \| 'ended'`; `startCountdown()` |
| `stickyBar.js` | Sticky top bar with countdown |
| `heroBanner.js` | Hero section banner (teaser → live → hidden) |
| `sale.css` | Styles for all sale UI |

### Backend (`backend/app.py`)

Flask app deployed on Render (`https://aark-backend-dkn9.onrender.com`). Two endpoints:
- `POST /place-order` — validates and emails order details; referenced as `BACKEND_URL` in `index.html` and `checkout.html`.
- `POST /contact` — contact form handler.

`checkout.html` is a separate page (not part of the SPA) that handles the multi-step checkout flow, UTR payment verification, and writes confirmed deductions to `localStorage` on success.

### Inventory management

```
inventry.xlsx  →  node build-inventory.mjs  →  inventory.json  →  committed to git  →  served statically
```

`inventory.json` is the **only** source of stock truth at runtime. It maps `SKU → { size: qty }`. To update stock: edit the Excel file, run `build-inventory.mjs`, commit `inventory.json`.

The `sync-inventory.py` pre-push hook ensures local `inventory.json` always reflects any sales-driven reductions that happened on the remote since the last pull.
