// ── AARK Sale: Sticky Top Bar ─────────────────────────────────────────────
// Requires: saleConfig.js + couponEngine.js already loaded.
// Self-contained IIFE — safe to call at end of <body>.

(function () {
  'use strict';

  const BAR_H = 40; // px
  const state = getSaleState();
  if (state === 'ended') return; // nothing to show

  // ── Build and insert bar ──────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'saleBar';
  document.body.insertBefore(bar, document.body.firstChild);

  // ── Shift fixed header and body content down by bar height ────────────────
  document.body.style.paddingTop = BAR_H + 'px';

  const mainHeader = document.getElementById('header');            // aark-website.html
  const coHeader   = document.querySelector('.co-header');         // checkout.html
  if (mainHeader) mainHeader.style.top = BAR_H + 'px';
  if (coHeader)   coHeader.style.top   = BAR_H + 'px';

  // Checkout main needs extra top padding (it uses explicit padding, not --header-h)
  const coMain = document.getElementById('checkoutMain');
  if (coMain) {
    const cur = parseInt(getComputedStyle(coMain).paddingTop) || 0;
    coMain.dataset.saleOrigPt = cur;
    coMain.style.paddingTop   = (cur + BAR_H) + 'px';
  }

  // ── Cleanup: remove bar and restore layout ────────────────────────────────
  function tearDown() {
    bar.remove();
    document.body.style.paddingTop = '';
    if (mainHeader) mainHeader.style.top = '';
    if (coHeader)   coHeader.style.top   = '';
    if (coMain && coMain.dataset.saleOrigPt !== undefined) {
      coMain.style.paddingTop = coMain.dataset.saleOrigPt + 'px';
    }
  }

  let timer = null;

  // ── STATE A: Teaser ───────────────────────────────────────────────────────
  function renderTeaser() {
    bar.className = 'bar-teaser';
    bar.innerHTML =
      '🎁 Mother’s Day Sale starts in <span id="barTimer">—</span>' +
      ' — Use code <span class="bar-code">MOM26</span> for 15% off + Free Shipping';

    if (timer) clearInterval(timer);
    timer = startCountdown(
      SALE_START,
      function (t) {
        var el = document.getElementById('barTimer');
        if (el) el.textContent = t.display;
      },
      function () {
        clearInterval(timer);
        renderLive();
      }
    );
  }

  // ── STATE B: Live ─────────────────────────────────────────────────────────
  function renderLive() {
    bar.className = 'bar-live';
    bar.innerHTML =
      '🌸 Mother’s Day Sale LIVE! Use <span class="bar-code">MOM26</span>' +
      ' for 15% off + Free Shipping — Ends in <span id="barTimer">—</span>';

    if (timer) clearInterval(timer);
    timer = startCountdown(
      SALE_END,
      function (t) {
        var el = document.getElementById('barTimer');
        if (el) el.textContent = t.display;
      },
      function () {
        clearInterval(timer);
        tearDown(); // STATE C: remove bar entirely
      }
    );
  }

  if (state === 'teaser') renderTeaser();
  else                    renderLive();

}());
