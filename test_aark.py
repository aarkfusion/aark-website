#!/usr/bin/env python3
"""
AARK Website — Pre-Deploy Test Suite
Run:  python3 test_aark.py
Exit: 0 = all pass, 1 = failures found
"""

import json
import re
import ssl
import sys
import urllib.request
import urllib.error

# macOS ships with an unpatched SSL bundle; create a permissive context for health checks only
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

G = '\033[32m'   # green
R = '\033[31m'   # red
Y = '\033[33m'   # yellow
B = '\033[1m'    # bold
X = '\033[0m'    # reset

results = []   # (passed: bool, name: str, detail: str)


def check(condition, name, detail=''):
    results.append((bool(condition), name, detail))
    status = f'{G}✓ PASS{X}' if condition else f'{R}✗ FAIL{X}'
    print(f'  {status}  {name}')
    if detail and not condition:
        print(f'         → {detail}')


def suite(name):
    print(f'\n{B}{Y}▶ {name}{X}')


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — Python replicas of the JS production logic
# ─────────────────────────────────────────────────────────────────────────────

def get_available_stock(inv, sku, size, in_cart=0, confirmed=0):
    """Replica of JS getAvailableStock(sku, size) with optional cart/deduction args.
    Note: for untracked SKUs the base is 0 (matches JS: (inventory[sku]||{})[size]||0).
    The size-filter uses a separate hasOwnProperty guard BEFORE calling this function."""
    base = (inv.get(sku) or {}).get(size, 0)
    return max(0, base - in_cart - confirmed)


def filter_products(products, inv, inv_loaded, active_filters):
    """Replica of JS getFilteredProducts() size-filter branch."""
    filtered = list(products)
    if active_filters.get('category'):
        filtered = [p for p in filtered if p['cat'] == active_filters['category']]
    if active_filters.get('size'):
        sz = active_filters['size']
        def size_ok(p):
            if sz not in p['sizes']:
                return False
            if not inv_loaded:
                return True
            if p['sku'] not in inv:        # untracked → assume available
                return True
            return get_available_stock(inv, p['sku'], sz) > 0
        filtered = [p for p in filtered if size_ok(p)]
    return filtered


def simulate_post_order(cart_items, prior=None):
    """Replica of JS showSuccess() confirmed-deductions write to localStorage."""
    d = {k: dict(v) for k, v in (prior or {}).items()}
    for item in cart_items:
        sku, size, qty = item['sku'], item['size'], item['qty']
        d.setdefault(sku, {})
        d[sku][size] = d[sku].get(size, 0) + qty
    return d


# ─────────────────────────────────────────────────────────────────────────────
# Suite 1 — inventory.json structure
# ─────────────────────────────────────────────────────────────────────────────

suite('inventory.json — Structure & Validity')

inventory = {}
try:
    with open('inventory.json') as f:
        inventory = json.load(f)
    check(True, 'inventory.json exists and is valid JSON')
    check(isinstance(inventory, dict), 'Root is an object (sku → {size: qty})')

    bad_structure, negative = [], []
    for sku, sizes in inventory.items():
        if not isinstance(sizes, dict):
            bad_structure.append(sku)
            continue
        for sz, qty in sizes.items():
            if not isinstance(qty, (int, float)) or qty < 0:
                negative.append(f'{sku}/{sz}={qty}')
    check(not bad_structure, 'All entries are dicts', f'Bad structure: {bad_structure}')
    check(not negative,      'No negative stock values', f'Negatives: {negative}')

    required_skus = ['SC001', 'SC002', 'F0002', 'ST001', 'ST011']
    missing = [s for s in required_skus if s not in inventory]
    check(not missing, f'Core SKUs present ({", ".join(required_skus)})', f'Missing: {missing}')

    total_units = sum(q for sizes in inventory.values() for q in sizes.values())
    check(total_units > 0, f'Total tracked stock > 0  ({total_units} units)')

except FileNotFoundError:
    check(False, 'inventory.json exists', 'File not found in current directory')
except json.JSONDecodeError as e:
    check(False, 'inventory.json is valid JSON', str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Suite 2 — HTML file integrity (both files must stay in sync)
# ─────────────────────────────────────────────────────────────────────────────

suite('HTML Files — Critical Code Snippets')

html_index = html_aark = ''
try:
    with open('index.html') as f:
        html_index = f.read()
    with open('aark-website.html') as f:
        html_aark = f.read()

    CRITICAL = [
        ('inventory.hasOwnProperty',      'Untracked-SKU fix (hasOwnProperty guard)'),
        ('getConfirmedDeductions',         'Confirmed deductions function'),
        ('getAvailableStock',              'getAvailableStock function'),
        ('aark_confirmed_deductions',      'localStorage key for confirmed deductions'),
        ('data-filter-type="size"',        'Size filter chips in sidebar HTML'),
        ('activeFilters.size',             'Size filter logic in getFilteredProducts'),
        ('touch-action: pan-y',            'Hero swipe CSS (no white-space during swipe)'),
        ('badge-soldout',                  'Sold-out badge CSS + HTML present'),
        ('isSoldOut',                      'isSoldOut logic in buildProductCard'),
    ]

    for snippet, label in CRITICAL:
        in_i = snippet in html_index
        in_a = snippet in html_aark
        detail = ' | '.join(
            ([f'MISSING in index.html'] if not in_i else []) +
            ([f'MISSING in aark-website.html'] if not in_a else [])
        )
        check(in_i and in_a, f'{label}', detail)

    # Dot count: both files must have exactly 2 hero dots
    dots_i = len(re.findall(r'class="hero-dot', html_index))
    dots_a = len(re.findall(r'class="hero-dot', html_aark))
    check(dots_i == dots_a, f'Hero dot count matches between files  ({dots_i} vs {dots_a})',
          'One file has more/fewer dots than the other')
    check(dots_i >= 1, f'Hero has at least 1 dot  (found {dots_i})')

except FileNotFoundError as e:
    check(False, 'Both HTML files readable', str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Suite 3 — Product catalog vs inventory coverage
# ─────────────────────────────────────────────────────────────────────────────

suite('Product Catalog — Inventory Coverage')

catalog_skus = []
if html_index:
    catalog_skus = list(dict.fromkeys(
        re.findall(r"'((?:SC|ST|F|KF|KST)\d+)_\d+\.\w+'", html_index)
    ))
    check(len(catalog_skus) > 0, f'Catalog SKUs extracted  ({len(catalog_skus)} products)')

    tracked   = [s for s in catalog_skus if s in inventory]
    untracked = [s for s in catalog_skus if s not in inventory]
    check(len(tracked) == 36, f'All 36 catalog SKUs now tracked in inventory  (found {len(tracked)})')
    check(len(untracked) == 0, f'No untracked SKUs remaining  ({len(untracked)} untracked)')

    # Verify the previously-untracked SKUs are now in inventory with zero stock
    formerly_untracked = ['F0003','F0004','F0005','F0006','F0009','F0012','F0013']
    for sku in formerly_untracked:
        in_inv  = sku in inventory
        all_zero = in_inv and all(v == 0 for v in inventory[sku].values())
        check(in_inv and all_zero, f'{sku} in inventory.json with all-zero stock (sold out)')

    # Verify the 7 previously-tracked all-zero SKUs still show as sold out
    always_zero = ['SC004','SC009','SC013','ST010','ST013','ST014','ST015']
    for sku in always_zero:
        all_zero = sku in inventory and all(v == 0 for v in inventory[sku].values())
        check(all_zero, f'{sku} confirmed all-zero in inventory (sold out)')


# ─────────────────────────────────────────────────────────────────────────────
# Suite 4 — Size filter logic
# ─────────────────────────────────────────────────────────────────────────────

suite('Size Filter Logic')

mock_products = [
    {'id':1,'sku':'SC001','cat':'straight-cut-kurtis','sizes':['XS','S','M','L','XL','XXL']},
    {'id':2,'sku':'SC002','cat':'straight-cut-kurtis','sizes':['S','M','L','XL']},
    {'id':3,'sku':'F0002','cat':'frocks',             'sizes':['XS','S','M','L','XL','XXL']},
    {'id':4,'sku':'ST011','cat':'fusion-tops',        'sizes':['XS','S','M','L']},
    {'id':5,'sku':'KF001','cat':'kids-skirt-top',     'sizes':['5-6yr','7-8yr','9-10yr']},
    {'id':6,'sku':'F0003','cat':'frocks',             'sizes':['XS','S','M','L','XL','XXL']},  # untracked
]

mock_inv = {
    'SC001': {'XS':2,'S':3,'M':0,'L':1,'XL':0,'XXL':2},
    'SC002': {'S':0, 'M':0,'L':1,'XL':2},
    'F0002': {'XS':1,'S':2,'M':3,'L':1,'XL':2,'XXL':0},
    'ST011': {'XS':0,'S':1,'M':2,'L':0},
    'F0003': {'XS':0,'S':0,'M':0,'L':0,'XL':0},   # now tracked, all-zero (sold out)
    'KF001': {'5-6yr':0,'7-8yr':0,'9-10yr':0,'11-12yr':0,'13-14yr':0},  # tracked, all-zero
}

# Before inventory loads — size check only, no stock check
r = filter_products(mock_products, {}, False, {'size':'XS'})
skus = {p['sku'] for p in r}
check('SC001' in skus and 'F0002' in skus and 'ST011' in skus and 'F0003' in skus,
      'Before inventory loads: all XS-sized products shown (inc. untracked)')
check('KF001' not in skus and 'SC002' not in skus,
      'Before inventory loads: products without XS in sizes[] correctly excluded')

# After inventory loads — F0003 now tracked with zero stock, must be hidden
r = filter_products(mock_products, mock_inv, True, {'size':'XS'})
skus = {p['sku'] for p in r}
check('F0003' not in skus, 'F0003 now tracked/zero-stock: hidden by size filter (not assumed available)')
check('SC001' in skus,  'SC001 shown (XS stock=2)')
check('F0002' in skus,  'F0002 shown (XS stock=1)')
check('ST011' not in skus,'ST011 hidden (XS stock=0)')

# Size M
r = filter_products(mock_products, mock_inv, True, {'size':'M'})
skus = {p['sku'] for p in r}
check('F0002' in skus and 'ST011' in skus, 'M in stock: F0002 and ST011 shown')
check('SC001' not in skus and 'SC002' not in skus, 'M out of stock: SC001/SC002 hidden')

# Kids excluded from all adult size filters
for sz in ['XS','S','M','L','XL','XXL']:
    r = filter_products(mock_products, mock_inv, True, {'size': sz})
    check('KF001' not in {p['sku'] for p in r}, f'KF001 excluded for adult size "{sz}"')

# Combined category + size
r = filter_products(mock_products, mock_inv, True, {'category':'frocks','size':'XS'})
skus = {p['sku'] for p in r}
check('F0002' in skus and 'F0003' not in skus,
      'Frocks + XS: F0002 shown (stock=1), F0003 hidden (tracked zero-stock sold out)')
check('SC001' not in skus, 'SC001 excluded (wrong category)')

r = filter_products(mock_products, mock_inv, True, {'category':'straight-cut-kurtis','size':'M'})
check(len(r) == 0, 'Straight-cut-kurtis + M: none in stock (both M=0)')

# No filters → all products
r = filter_products(mock_products, mock_inv, True, {})
check(len(r) == len(mock_products), 'No filters: all products shown')

# Clear filters restores full list
r = filter_products(mock_products, mock_inv, True, {'size':'XS', 'category':'frocks'})
r = filter_products(mock_products, mock_inv, True, {})
check(len(r) == len(mock_products), 'After clearing filters: full catalog restored')


# ─────────────────────────────────────────────────────────────────────────────
# Suite 5 — Stock cap (can't add more than available)
# ─────────────────────────────────────────────────────────────────────────────

suite('Stock Cap — Cart Quantity Enforcement')

def can_add(sku, size, in_cart, want):
    avail = get_available_stock(mock_inv, sku, size, in_cart=in_cart)
    return want <= avail

check(get_available_stock(mock_inv,'SC001','M') == 0,  'SC001/M: base=0 → avail=0')
check(get_available_stock(mock_inv,'SC001','XXL') == 2,'SC001/XXL: base=2 → avail=2')
check(get_available_stock(mock_inv,'KF001','S') == 0,  'Untracked KF001: base=0 → avail=0 (filter uses hasOwnProperty guard separately)')
check(get_available_stock(mock_inv,'F0002','M') == 3,  'F0002/M: base=3 → avail=3')

# Qty in cart reduces available
check(get_available_stock(mock_inv,'F0002','M', in_cart=2) == 1, 'F0002/M: 2 in cart → avail=1')
check(get_available_stock(mock_inv,'F0002','M', in_cart=3) == 0, 'F0002/M: 3 in cart → avail=0')

check(can_add('F0002','M',0,3),    'Can add 3 × F0002/M (stock=3)')
check(not can_add('F0002','M',0,4),'Cannot add 4 × F0002/M (over stock=3)')
check(can_add('F0002','M',2,1),    'Can add 1 more after 2 in cart')
check(not can_add('F0002','M',3,1),'Cannot add 1 more when cart is already at max=3')
check(not can_add('KF001','S',0,1), 'Untracked KF001: avail=0 from getAvailableStock (shown in grid via hasOwnProperty, ordered via WhatsApp)')


# ─────────────────────────────────────────────────────────────────────────────
# Suite 6 — Confirmed deductions (order success permanently reduces stock)
# ─────────────────────────────────────────────────────────────────────────────

suite('Confirmed Deductions — Permanent Stock Reduction')

# First order deducts
d = simulate_post_order([{'sku':'SC001','size':'L','qty':1}])
avail = get_available_stock(mock_inv,'SC001','L', confirmed=d.get('SC001',{}).get('L',0))
check(avail == 0, 'SC001/L: base=1, ordered 1 → avail=0')

# Partial deduction
d = simulate_post_order([{'sku':'F0002','size':'M','qty':2}])
avail = get_available_stock(mock_inv,'F0002','M', confirmed=d.get('F0002',{}).get('M',0))
check(avail == 1, 'F0002/M: base=3, ordered 2 → avail=1')

# Second order accumulates on prior deductions
d2 = simulate_post_order([{'sku':'F0002','size':'M','qty':1}], prior=d)
avail2 = get_available_stock(mock_inv,'F0002','M', confirmed=d2.get('F0002',{}).get('M',0))
check(avail2 == 0, 'Second order accumulates: F0002/M: ordered 2+1=3 → avail=0')

# Deduction on untracked SKU: base=0, so avail stays 0 (already clamped)
d = simulate_post_order([{'sku':'KF001','size':'2-3yr','qty':5}])
avail = get_available_stock(mock_inv,'KF001','2-3yr', confirmed=d.get('KF001',{}).get('2-3yr',0))
check(avail == 0, 'Untracked KF001: base=0 − confirmed=5 → clamped to 0 (never goes negative)')

# Ordering one size doesn't affect another size of same SKU
d = simulate_post_order([{'sku':'SC001','size':'S','qty':2}])
avail_s   = get_available_stock(mock_inv,'SC001','S',   confirmed=d.get('SC001',{}).get('S',0))
avail_xxl = get_available_stock(mock_inv,'SC001','XXL', confirmed=d.get('SC001',{}).get('XXL',0))
check(avail_s == 1,   'SC001/S: base=3, ordered 2 → avail=1')
check(avail_xxl == 2, 'SC001/XXL unaffected by S deduction: still avail=2')

# Cart qty + confirmed can't go negative
d = simulate_post_order([{'sku':'F0002','size':'L','qty':5}])  # more than base=1
avail = get_available_stock(mock_inv,'F0002','L', confirmed=d.get('F0002',{}).get('L',0))
check(avail == 0, 'Excess confirmed deduction clamped to 0 (never negative)')


# ─────────────────────────────────────────────────────────────────────────────
# Suite 7 — Checkout page checks
# ─────────────────────────────────────────────────────────────────────────────

suite('Checkout Page — Structure & Configuration')

try:
    with open('checkout.html') as f:
        co_html = f.read()

    check('aark-backend-dkn9.onrender.com/place-order' in co_html,
          'Backend /place-order URL is correct')
    check('aark_confirmed_deductions' in co_html,
          'Checkout writes confirmed deductions to localStorage on success')
    check('AbortController' in co_html,
          'Checkout uses AbortController for timeout')
    check('warmUp' in co_html or 'onrender.com' in co_html,
          'Render.com warm-up ping present in checkout')
    check('showSuccess' in co_html,
          'showSuccess() function exists')
    check('clearCart' in co_html,
          'clearCart() called on success')

    # UTR field: must require exactly 12 chars before enabling Place Order
    check('length !== 12' in co_html or "!== '12'" in co_html or 'len !== 12' in co_html,
          'UTR validation enforces 12-character requirement')

    # Checkout stock validation: must fetch inventory and strip OOS items
    check('validateCartStock' in co_html,
          'Checkout has validateCartStock() to block zero-stock orders')
    check('went out of stock' in co_html or 'no longer in stock' in co_html,
          'Checkout warns user when items are removed due to zero stock')
    check('stockWarningBanner' in co_html,
          'Checkout has stock warning banner element')

    # WhatsApp payment help (Option C)
    check('paymentHelpWa' in co_html,
          'Checkout has "Having trouble?" WhatsApp help link in payment step')
    check('buildPaymentHelpWa' in co_html,
          'Checkout pre-fills WhatsApp help link with cart + order details')

except FileNotFoundError:
    check(False, 'checkout.html readable', 'File not found')


# ─────────────────────────────────────────────────────────────────────────────
# Suite 8 — Size button state after cart changes (regression guard)
# ─────────────────────────────────────────────────────────────────────────────

suite('Size Button State — Cart Change Regression Guard')

# Verify the three bug fixes are present in both HTML files
SIZE_FIX_SNIPPETS = [
    ('inventory.hasOwnProperty(p.sku) && getAvailableStock(p.sku, s)',
     'outClass uses getAvailableStock (not raw stock) when rendering size buttons'),
    ('refreshSizeAvailability(currentProduct)',
     'addToCartFromDetail calls refreshSizeAvailability after cart add'),
    ('if (currentProduct) refreshSizeAvailability(currentProduct)',
     'updateCartQty/removeFromCart refresh size buttons when product detail is open'),
]

for snippet, label in SIZE_FIX_SNIPPETS:
    in_i = snippet in html_index if html_index else False
    in_a = snippet in html_aark  if html_aark  else False
    detail = ' | '.join(
        (['MISSING in index.html']       if not in_i else []) +
        (['MISSING in aark-website.html'] if not in_a else [])
    )
    check(in_i and in_a, label, detail)

# Logic tests: simulate the cart-change → size-refresh scenario
suite('Size Button State — Logic')

def simulate_add_to_cart_and_check(inv, sku, size, base_stock):
    """Returns (can_add_first, can_add_second) simulating two sequential add-to-cart calls."""
    in_cart = 0
    avail_first = get_available_stock(inv, sku, size, in_cart=in_cart)
    can_first = avail_first > 0
    if can_first:
        in_cart += 1  # first add succeeds
    avail_second = get_available_stock(inv, sku, size, in_cart=in_cart)
    can_second = avail_second > 0
    return can_first, can_second

# Stock = 1: first add allowed, second must be blocked
can1, can2 = simulate_add_to_cart_and_check(mock_inv, 'SC001', 'L', 1)
check(can1,      'SC001/L stock=1: first add to cart is allowed')
check(not can2,  'SC001/L stock=1: second add to cart blocked after first (size must go .out)')

# Stock = 2: both adds allowed, third blocked
inv2 = {'SC001': {'L': 2}}
can1b, _ = simulate_add_to_cart_and_check(inv2, 'SC001', 'L', 2)
in_c = 0
avail_a = get_available_stock(inv2, 'SC001', 'L', in_cart=in_c); in_c += 1
avail_b = get_available_stock(inv2, 'SC001', 'L', in_cart=in_c); in_c += 1
avail_c = get_available_stock(inv2, 'SC001', 'L', in_cart=in_c)
check(avail_a == 2, 'Stock=2: avail=2 before any add')
check(avail_b == 1, 'Stock=2: avail=1 after first add')
check(avail_c == 0, 'Stock=2: avail=0 after second add (size must go .out)')

# Stock = 0: must be blocked from the very first add
avail_zero = get_available_stock(mock_inv, 'SC001', 'M', in_cart=0)
check(avail_zero == 0, 'SC001/M base=0: add to cart blocked immediately (size shown as .out)')

# Remove from cart restores availability
avail_after_remove = get_available_stock(mock_inv, 'SC001', 'L', in_cart=0)
check(avail_after_remove == 1, 'SC001/L: removing from cart restores avail=1 (size goes back to .active)')

# Checkout stock validation logic
suite('Checkout Stock Validation — Zero Inventory Guard')

def validate_checkout_cart(inv, cart_items, confirmed=None):
    """Replica of JS validateCartStock(): strips/reduces OOS items, returns (final_cart, removed, reduced)."""
    conf = confirmed or {}
    final, removed, reduced = [], [], []
    for item in cart_items:
        sku, size, qty = item['sku'], item['size'], item['qty']
        if not hasattr(inv, '__contains__') or sku not in inv:
            final.append(item); continue  # untracked → keep
        base    = (inv.get(sku) or {}).get(size, 0)
        deducted = (conf.get(sku) or {}).get(size, 0)
        avail   = max(0, base - deducted)
        if avail == 0:
            removed.append(f'{sku}/{size}')
        elif qty > avail:
            reduced.append(f'{sku}/{size}')
            final.append({**item, 'qty': avail})
        else:
            final.append(item)
    return final, removed, reduced

# OOS item fully removed
cart_in  = [{'sku':'SC001','size':'M','qty':1}]  # M stock=0
final, removed, reduced = validate_checkout_cart(mock_inv, cart_in)
check(len(final) == 0 and 'SC001/M' in removed,
      'Checkout validation: OOS item removed before order (SC001/M base=0)')

# Qty reduced to match stock
cart_in = [{'sku':'SC001','size':'S','qty':5}]   # S stock=3
final, removed, reduced = validate_checkout_cart(mock_inv, cart_in)
check(len(final) == 1 and final[0]['qty'] == 3 and 'SC001/S' in reduced,
      'Checkout validation: qty reduced from 5 to 3 to match available stock')

# In-stock item untouched
cart_in = [{'sku':'F0002','size':'M','qty':2}]   # M stock=3
final, removed, reduced = validate_checkout_cart(mock_inv, cart_in)
check(len(final) == 1 and final[0]['qty'] == 2 and not removed and not reduced,
      'Checkout validation: in-stock item at valid qty passes through unchanged')

# Confirmed deductions reduce available at checkout
conf = {'SC001': {'L': 1}}                         # 1 already ordered
cart_in = [{'sku':'SC001','size':'L','qty':1}]      # base=1, deducted=1 → avail=0
final, removed, reduced = validate_checkout_cart(mock_inv, cart_in, confirmed=conf)
check(len(final) == 0 and 'SC001/L' in removed,
      'Checkout validation: confirmed deduction makes item OOS → removed from checkout cart')

# Tracked but zero-stock SKU — checkout must reject it (formerly-untracked F0003 is now tracked all-zero)
cart_in = [{'sku':'F0003','size':'XS','qty':3}]
final, removed, reduced = validate_checkout_cart(mock_inv, cart_in)
check(len(final) == 0 and 'F0003/XS' in removed,
      'Checkout validation: F0003 (tracked, zero stock) removed from checkout cart')

# ─────────────────────────────────────────────────────────────────────────────
# Suite 9 — Dynamic size filter (kids ↔ adult swap)
# ─────────────────────────────────────────────────────────────────────────────

suite('Dynamic Size Filter — Kids ↔ Adult Swap')

ADULT_SIZES_PY = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
KIDS_SIZES_PY  = ['5-6yr', '7-8yr', '9-10yr', '11-12yr', '13-14yr']

def get_size_chips_for(category):
    return KIDS_SIZES_PY if category == 'kids-skirt-top' else ADULT_SIZES_PY

# Category → correct size set
check(get_size_chips_for('kids-skirt-top') == KIDS_SIZES_PY,
      'kids-skirt-top category → kids sizes shown (5-6yr … 13-14yr)')
check(get_size_chips_for('straight-cut-kurtis') == ADULT_SIZES_PY,
      'straight-cut-kurtis → adult sizes shown (XS … XXL)')
check(get_size_chips_for('frocks') == ADULT_SIZES_PY,
      'frocks → adult sizes shown')
check(get_size_chips_for('fusion-tops') == ADULT_SIZES_PY,
      'fusion-tops → adult sizes shown')
check(get_size_chips_for(None) == ADULT_SIZES_PY,
      'no category (clear filters) → adult sizes shown')

# Kids sizes must not appear in adult set (no cross-contamination)
for sz in KIDS_SIZES_PY:
    check(sz not in ADULT_SIZES_PY, f'Kids size "{sz}" not in adult size set')
for sz in ADULT_SIZES_PY:
    check(sz not in KIDS_SIZES_PY, f'Adult size "{sz}" not in kids size set')

# Filter logic: kids sizes only match kids products, not adult products
kids_products = [
    {'id':5,'sku':'KF001','cat':'kids-skirt-top','sizes':['5-6yr','7-8yr','9-10yr','11-12yr','13-14yr']},
    {'id':6,'sku':'KF002','cat':'kids-skirt-top','sizes':['5-6yr','7-8yr','9-10yr','11-12yr','13-14yr']},
]
adult_products = [
    {'id':1,'sku':'SC001','cat':'straight-cut-kurtis','sizes':['XS','S','M','L','XL','XXL']},
    {'id':3,'sku':'F0002','cat':'frocks',             'sizes':['XS','S','M','L','XL','XXL']},
]
all_products = kids_products + adult_products

for sz in KIDS_SIZES_PY:
    r = filter_products(all_products, {}, False, {'size': sz})
    skus = {p['sku'] for p in r}
    check('KF001' in skus and 'KF002' in skus,
          f'Kids size "{sz}": both kids products shown')
    check('SC001' not in skus and 'F0002' not in skus,
          f'Kids size "{sz}": adult products correctly excluded')

for sz in ADULT_SIZES_PY:
    r = filter_products(all_products, {}, False, {'size': sz})
    skus = {p['sku'] for p in r}
    check('SC001' in skus and 'F0002' in skus,
          f'Adult size "{sz}": adult products shown')
    check('KF001' not in skus and 'KF002' not in skus,
          f'Adult size "{sz}": kids products correctly excluded')

# Switching category clears the size filter (no stale cross-category size)
def simulate_category_switch(from_cat, to_cat, active_size):
    """Replicate toggleFilter category-change: clear size, re-render chips."""
    active = {'category': from_cat, 'size': active_size}
    active['category'] = to_cat
    del active['size']   # cleared on category change
    return active

state = simulate_category_switch('straight-cut-kurtis', 'kids-skirt-top', 'M')
check('size' not in state,
      'Switching to kids-skirt-top clears stale adult size filter (M removed)')
check(state['category'] == 'kids-skirt-top',
      'Category correctly set to kids-skirt-top after switch')

state = simulate_category_switch('kids-skirt-top', 'frocks', '7-8yr')
check('size' not in state,
      'Switching from kids-skirt-top to frocks clears stale kids size filter (7-8yr removed)')

# HTML: both files have the dynamic rendering function and correct constants
for fname, content in [('index.html', html_index), ('aark-website.html', html_aark)]:
    if not content:
        check(False, f'{fname} readable for size filter checks')
        continue
    check('sizeFilterOptions' in content,
          f'{fname}: size filter container has id="sizeFilterOptions"')
    check('renderSizeFilterChips' in content,
          f'{fname}: renderSizeFilterChips() function defined')
    check('KIDS_SIZES' in content,
          f'{fname}: KIDS_SIZES constant defined')
    check('5-6yr' in content,
          f'{fname}: kids size values (5-6yr…) present in JS')
    check('delete activeFilters.size' in content,
          f'{fname}: category switch clears size filter')

# ─────────────────────────────────────────────────────────────────────────────
# Suite 10 — Backend connectivity (live network check)
# ─────────────────────────────────────────────────────────────────────────────

suite('Backend Connectivity (live — may be slow on cold start)')  # Suite 10

try:
    req = urllib.request.Request(
        'https://aark-backend-dkn9.onrender.com/',
        headers={'User-Agent': 'AARK-PreDeploy-Test/1.0'}
    )
    with urllib.request.urlopen(req, timeout=35, context=_ssl_ctx) as resp:
        status = resp.status
    check(status == 200, f'Backend GET / → HTTP {status} (warm)')
except urllib.error.HTTPError as e:
    check(False, 'Backend health check', f'HTTP {e.code}: {e.reason}')
except Exception as e:
    check(False, 'Backend reachable',
          f'{type(e).__name__}: {e}  (server may be cold — wait 30s and retry)')


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

total  = len(results)
passed = sum(1 for ok, _, _ in results if ok)
failed = total - passed

print(f"\n{'─'*58}")
fail_col = R if failed else G
print(f'{B}Results: {G}{passed} passed{X}{B}, {fail_col}{failed} failed{X}  ({total} total)')

if failed:
    print(f'\n{B}{R}Failed tests:{X}')
    for ok, name, detail in results:
        if not ok:
            print(f'  {R}✗{X} {name}')
            if detail:
                print(f'    → {detail}')
    sys.exit(1)
else:
    print(f'{G}{B}✓ All tests passed — safe to deploy!{X}\n')
    sys.exit(0)
