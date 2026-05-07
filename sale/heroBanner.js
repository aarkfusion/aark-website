// ── AARK Sale: Homepage Hero Banner ───────────────────────────────────────
// Requires: saleConfig.js + couponEngine.js already loaded.
// Targets <div id="mdayBanner"> which must exist inside #page-home.

(function () {
  'use strict';

  var banner = document.getElementById('mdayBanner');
  if (!banner) return;

  var state = getSaleState();
  if (state === 'ended') return; // Section stays hidden

  var timer = null;

  // Update digit boxes by ID (setBox is a no-op if element doesn't exist)
  function setBox(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function onTick(t) {
    setBox('mdD', pad(t.days));
    setBox('mdH', pad(t.hours));
    setBox('mdM', pad(t.mins));
    setBox('mdS', pad(t.secs));
  }

  // ── STATE A: Teaser ───────────────────────────────────────────────────────
  function renderTeaser() {
    banner.className = 'banner-teaser';
    banner.innerHTML =
      '<div class="mday-pill">Coming Soon</div>' +
      '<h2 class="mday-headline">Mother\'s Day Sale</h2>' +
      '<p class="mday-sub">Use code <span class="sub-code">MOM26</span> — 15% off everything + Free Shipping</p>' +
      '<p class="mday-combo-link">✦ <em>Woven as One</em> — a matching fabric set for your whole family</p>' +
      '<div class="mday-countdown">' +
        '<div class="mday-box"><div class="mday-digit" id="mdD">--</div><div class="mday-label">Days</div></div>' +
        '<div class="mday-sep">:</div>' +
        '<div class="mday-box"><div class="mday-digit" id="mdH">--</div><div class="mday-label">Hours</div></div>' +
        '<div class="mday-sep">:</div>' +
        '<div class="mday-box"><div class="mday-digit" id="mdM">--</div><div class="mday-label">Mins</div></div>' +
        '<div class="mday-sep">:</div>' +
        '<div class="mday-box"><div class="mday-digit" id="mdS">--</div><div class="mday-label">Secs</div></div>' +
      '</div>';

    if (timer) clearInterval(timer);
    timer = startCountdown(SALE_START, onTick, function () {
      clearInterval(timer);
      state = 'live';
      renderLive();
    });
  }

  // ── STATE B: Live ─────────────────────────────────────────────────────────
  function renderLive() {
    banner.className = 'banner-live';
    banner.innerHTML =
      '<div class="mday-pill">Limited Time Only</div>' +
      '<h2 class="mday-headline">🌸 Mother\'s Day Sale is LIVE!</h2>' +
      '<p class="mday-sub">Use code <span class="sub-code">MOM26</span> at checkout — 15% off + Free Shipping</p>' +
      '<p class="mday-combo-link">✦ <em>Woven as One</em> — a matching fabric set for your whole family</p>' +
      '<div class="mday-countdown">' +
        '<div class="mday-box"><div class="mday-digit" id="mdH">--</div><div class="mday-label">Hours</div></div>' +
        '<div class="mday-sep">:</div>' +
        '<div class="mday-box"><div class="mday-digit" id="mdM">--</div><div class="mday-label">Mins</div></div>' +
        '<div class="mday-sep">:</div>' +
        '<div class="mday-box"><div class="mday-digit" id="mdS">--</div><div class="mday-label">Secs</div></div>' +
      '</div>';

    if (timer) clearInterval(timer);
    timer = startCountdown(SALE_END, onTick, function () {
      clearInterval(timer);
      banner.style.display = 'none'; // STATE C: hide entirely
    });
  }

  if (state === 'teaser') renderTeaser();
  else                    renderLive();

}());
