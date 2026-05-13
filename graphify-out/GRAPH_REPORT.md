# Graph Report - aark_website  (2026-05-12)

## Corpus Check
- 16 files · ~8,226,281 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 183 nodes · 194 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2e5403ce`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `Architecture` - 10 edges
2. `_github_put_inventory()` - 6 edges
3. `AARK Contact Form Setup` - 6 edges
4. `startCountdown()` - 5 edges
5. `place_order()` - 5 edges
6. `_github_get_inventory()` - 5 edges
7. `_deduct_inventory_for_order()` - 5 edges
8. `Deploying AARK Backend to Render` - 5 edges
9. `get_available_stock()` - 4 edges
10. `renderLive()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `renderTeaser()` --calls--> `startCountdown()`  [INFERRED]
  sale/stickyBar.js → sale/couponEngine.js
- `renderLive()` --calls--> `startCountdown()`  [INFERRED]
  sale/stickyBar.js → sale/couponEngine.js
- `renderTeaser()` --calls--> `startCountdown()`  [INFERRED]
  sale/heroBanner.js → sale/couponEngine.js
- `renderLive()` --calls--> `startCountdown()`  [INFERRED]
  sale/heroBanner.js → sale/couponEngine.js

## Communities (15 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (22): allAnchors, allDataHref, badCollHref, badDataHref, badHref, baseTag, collectionEls, collUrl (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (17): af, bar, fakeEl, mockGroups, mockInventory, mockProducts, noEl, r (+9 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (21): admin_get_inventory(), admin_put_inventory(), build_contact_email(), build_customer_email(), build_owner_email(), contact(), _deduct_inventory_for_order(), _github_get_inventory() (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (16): ADULT_ORDER, breakdown, catalogText, cfBlock, inventory, normalized, photographedSkus, rows (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (14): can_add(), filter_products(), get_available_stock(), # NOTE: previously this suite hard-coded a list of "always sold out" SKUs and, Returns (can_add_first, can_add_second) simulating two sequential add-to-cart ca, Replica of JS validateCartStock(): strips/reduces OOS items, returns (final_cart, Replica of JS getAvailableStock(sku, size) with optional cart/deduction args., Replica of JS getFilteredProducts() size-filter branch. (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (14): startCountdown(), onTick(), pad(), renderLive(), renderTeaser(), setBox(), bar, coHeader (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (14): Architecture, Backend (`backend/app.py`), Card-level swatch UX (group cards only), code:bash (# Run the primary test suite (must pass before every push)), code:block2 (CATALOG_FILES[]          → buildProduct() → products[]), code:block3 (inventry.xlsx  →  node build-inventory.mjs  →  inventory.jso), Commands, Inventory and stock (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (8): 1. Create the Google Sheet, 2. Deploy the Apps Script webhook, 3. Add the Web App URL to the website, 4. Activate FormSubmit, AARK Contact Form Setup, code:text (https://docs.google.com/spreadsheets/d/1saOKB_w_IpsScAcw6-na), code:js (sheetsWebhookUrl: 'PASTE_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE), Notes

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (7): After Deploy, code:block1 (curl https://aark-backend.onrender.com), code:block2 (FROM: https://aark-backend.onrender.com/place-order), Deploying AARK Backend to Render, Gmail App Password Setup, Notes, One-Time Setup

## Knowledge Gaps
- **95 isolated node(s):** `mockProducts`, `mockInventory`, `r`, `af`, `soldOutProducts` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `startCountdown()` connect `Community 5` to `Community 11`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `startCountdown()` (e.g. with `renderTeaser()` and `renderLive()`) actually correct?**
  _`startCountdown()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `mockProducts`, `mockInventory`, `r` to the rest of the system?**
  _95 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._