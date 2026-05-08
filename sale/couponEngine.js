// ── AARK Sale: Coupon Engine ──────────────────────────────────────────────
// Requires: saleConfig.js loaded first (provides SALE_* and SHIPPING_* constants)
// All comparison is UTC-based — SALE_START/SALE_END encode the correct IST offset.

/* eslint-disable no-unused-vars */

// getSaleState() → 'teaser' | 'live' | 'ended'
function getSaleState() {
  const now = Date.now();
  if (now < SALE_START.getTime()) return 'teaser';
  if (now > SALE_END.getTime())   return 'ended';
  return 'live';
}

// validateCoupon(code, cartSubtotal, comboSubtotal) → result object
// comboSubtotal: portion of cartSubtotal from Mother's Day Combo items (defaults 0)
// Returns { valid, discountPercent, comboDiscountPercent, discountAmount, hasCombo, badgeText, shippingCost, finalTotal, state, message }
function validateCoupon(code, cartSubtotal, comboSubtotal) {
  comboSubtotal = comboSubtotal || 0;
  const regularSubtotal = cartSubtotal - comboSubtotal;
  const normalized  = (code || '').trim().toUpperCase();
  const baseShip    = cartSubtotal >= SHIPPING_FREE_AT ? 0 : SHIPPING_FLAT;

  if (normalized !== SALE_COUPON_CODE) {
    return {
      valid: false, discountPercent: 0, discountAmount: 0,
      shippingCost: baseShip, finalTotal: cartSubtotal + baseShip,
      state: 'invalid', message: 'Invalid coupon code',
    };
  }

  const s = getSaleState();

  if (s === 'teaser') {
    return {
      valid: false, discountPercent: 0, discountAmount: 0,
      shippingCost: baseShip, finalTotal: cartSubtotal + baseShip,
      state: 'not_started', message: "Sale hasn't started yet — use MOM26 from May 9",
    };
  }

  if (s === 'ended') {
    return {
      valid: false, discountPercent: 0, discountAmount: 0,
      shippingCost: baseShip, finalTotal: cartSubtotal + baseShip,
      state: 'expired', message: 'This offer has expired',
    };
  }

  // Sale is live — apply tiered discount (20% on Combo, 15% on everything else)
  const comboDisc    = Math.round(comboSubtotal * SALE_COMBO_DISCOUNT_PERCENT / 100);
  const regularDisc  = Math.round(regularSubtotal * SALE_DISCOUNT_PERCENT / 100);
  const discountAmount = comboDisc + regularDisc;
  const hasCombo = comboSubtotal > 0;
  const badgeText = hasCombo
    ? `20% off Combo · 15% off store wide + Free Shipping! 🌸`
    : `15% off store wide + Free Shipping! 🌸`;
  return {
    valid: true,
    discountPercent: SALE_DISCOUNT_PERCENT,
    comboDiscountPercent: SALE_COMBO_DISCOUNT_PERCENT,
    discountAmount,
    hasCombo,
    badgeText,
    shippingCost: 0,
    finalTotal: cartSubtotal - discountAmount,
    state: 'active',
    message: `MOM26 applied — ${badgeText}`,
  };
}

// startCountdown(targetDate, onTick, onExpiry) → interval ID (store to cancel)
// onTick({ days, hours, mins, secs, display }) called every second
// onExpiry() called once when targetDate is reached
function startCountdown(targetDate, onTick, onExpiry) {
  const pad = n => String(n).padStart(2, '0');

  function tick() {
    const ms = targetDate.getTime() - Date.now();
    if (ms <= 0) {
      clearInterval(id);
      onTick({ days: 0, hours: 0, mins: 0, secs: 0, display: '00h 00m 00s' });
      if (onExpiry) onExpiry();
      return;
    }
    const total = Math.floor(ms / 1000);
    const days  = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins  = Math.floor((total % 3600) / 60);
    const secs  = total % 60;
    const display = days > 0
      ? `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`
      : `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
    onTick({ days, hours, mins, secs, display });
  }

  tick();
  const id = setInterval(tick, 1000);
  return id;
}

// getCartShipping(subtotal, couponValid) → shipping cost in ₹
function getCartShipping(subtotal, couponValid) {
  if (couponValid) return 0;
  return subtotal >= SHIPPING_FREE_AT ? 0 : SHIPPING_FLAT;
}
