// ── AARK Sale: Sticky Top Bar ─────────────────────────────────────────────
// Requires: saleConfig.js + couponEngine.js already loaded.
// Self-contained IIFE — safe to call at end of <body>.

(function () {
  'use strict';

  const state = getSaleState();
  if (state === 'ended') return; // nothing to show

  // ── Build and insert bar ──────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'saleBar';
  bar.style.cursor = 'pointer';
  bar.addEventListener('click', function () {
    if (typeof openComboPage === 'function') openComboPage();
  });
  document.body.insertBefore(bar, document.body.firstChild);

  const mainHeader = document.getElementById('header');
  const coHeader   = document.querySelector('.co-header');
  const coMain     = document.getElementById('checkoutMain');

  // Save checkout main's original padding before we touch it
  if (coMain) {
    coMain.dataset.saleOrigPt = parseInt(getComputedStyle(coMain).paddingTop) || 0;
  }

  // ── Apply offsets based on actual rendered bar height ─────────────────────
  // Called via rAF after innerHTML is set so the browser has laid out the bar.
  function applyBarOffset() {
    var h = bar.offsetHeight || 40;
    document.body.style.paddingTop = h + 'px';
    if (mainHeader) mainHeader.style.top = h + 'px';
    if (coHeader)   coHeader.style.top   = h + 'px';
    if (coMain && coMain.dataset.saleOrigPt !== undefined) {
      coMain.style.paddingTop = (parseInt(coMain.dataset.saleOrigPt) + h) + 'px';
    }
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
    requestAnimationFrame(applyBarOffset);

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
    requestAnimationFrame(applyBarOffset);

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
