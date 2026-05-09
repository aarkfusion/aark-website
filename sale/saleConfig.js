// ── AARK Mother's Day Flash Sale — Central Configuration ─────────────────
// Edit ONLY this file to change dates, code, discount, or shipping thresholds.
// All sale components (bar, banner, cart, checkout) read from here.

/* eslint-disable no-unused-vars */

const SALE_COUPON_CODE            = 'MOM26';
const SALE_DISCOUNT_PERCENT       = 15;  // store-wide
const SALE_COMBO_DISCOUNT_PERCENT = 20;  // Mother's Day Combo
const SALE_START            = new Date('2026-05-10T00:00:00+05:30'); // May 10 Mother's Day IST
const SALE_END              = new Date('2026-05-17T23:59:59+05:30'); // May 17 23:59 IST (1 week)
const SHIPPING_FLAT         = 70;    // ₹70 flat when below free-shipping threshold
const SHIPPING_FREE_AT      = 2998;  // cart subtotal ≥ ₹2,998 → free shipping
