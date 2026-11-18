/* ==========================================================================
   checkout.js  â€”  the page customers land on after pressing Checkout.
   Texts: content.json -> "checkout". Prices: recomputed from content.json.

   Flow: customer enters name + email -> the order is emailed to YOU
   (content.json -> checkout.orderForm) -> they pay by PayPal (redirect) or
   bank transfer (details on this page).
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Site, P = window.Pricing, qs = S.qs, isBlank = S.isBlank;

  function orderCode(key) {
    try {
      var saved = JSON.parse(sessionStorage.getItem('orderCode') || 'null');
      if (saved && saved.key === key) return saved.code;
    } catch (e) {}
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    var code = 'AD-' + z(d.getMonth() + 1) + z(d.getDate()) + '-';   // e.g. AD-1117-K7Q2 (month+day, then 4 random characters)
    for (var i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    try { sessionStorage.setItem('orderCode', JSON.stringify({ key: key, code: code })); } catch (e) {}
    return code;
  }

  function copyText(btn, text) {
    function done() { var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = old; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e) {} t.remove(); done();
    }
  }

  S.loadContent().then(function (c) {
    S.applyTheme(c.theme, c.site);
    S.applySite(c.site);
    if (!isBlank(c.checkout && c.checkout.title)) document.title = c.checkout.title;
    S.bind(document.body, c, {});

    var brand = qs('.brand');
    if (!isBlank(c.site && c.site.logo)) { var img = new Image(); img.className = 'brand-logo'; img.alt = 'Logo'; img.src = c.site.logo; brand.appendChild(img); }
    else brand.hidden = true;

    var b = S.builder(), co = c.checkout || {};
    var param = new URLSearchParams(location.search).get('cart');
    var qty = null;
    if (param !== null) qty = P.decode(param, b || {});
    else { try { qty = JSON.parse(sessionStorage.getItem('cart') || 'null'); } catch (e) {} }
    var r = b && qty ? P.compute(b, qty) : { units: 0 };

    if (!b || r.units === 0) { qs('#co-empty').hidden = false; return; }
    qs('#co-full').hidden = false;

    var sym = b.currencySymbol == null ? '$' : b.currencySymbol, cur = b.currency || 'USD';
    var fmt = function (cents) { return P.money(cents, sym); };
    var code = orderCode(P.encode(qty, b));
    qs('#co-order-badge').textContent = (co.orderLabel || 'Order code') + ': ' + code;

    /* ----- order summary ----- */
    var list = qs('#co-lines'), tpl = document.getElementById('tpl-receipt-line');
    r.lines.forEach(function (ln) {
      var li = tpl.content.firstElementChild.cloneNode(true);
      qs('.rc-name', li).textContent = ln.name;
      qs('.rc-qty', li).textContent = 'Ã—' + ln.qty;
      qs('.rc-price', li).textContent = fmt(ln.lineFinal);
      var w = qs('.rc-was', li);
      if (r.pct > 0) w.textContent = fmt(ln.lineRegular); else w.hidden = true;
      list.appendChild(li);
    });
    qs('#co-total').textContent = fmt(r.totalCents);
    if (r.savedCents > 0) {
      qs('#co-row-save').hidden = false;
      qs('#co-save').textContent = fmt(r.savedCents) + ' (' + r.pct + '%)';
    }
    if (r.promoCents > 0) {
      qs('#co-row-promo').hidden = false;
      qs('#co-promo-label').textContent = ((b.promo && b.promo.rowLabel) || 'Flash deal') + ' (-' + r.promo.pct + '%)';
      qs('#co-promo').textContent = '-' + fmt(r.promoCents);
    }
    var amount = (r.totalCents / 100).toFixed(2);

    /* ----- customer details ----- */
    var fName = qs('#f-name'), fEmail = qs('#f-email'), fErr = qs('#f-error'), fHp = qs('#f-hp');
    try {
      var saved = JSON.parse(sessionStorage.getItem('details') || 'null');
      if (saved) { fName.value = saved.name || ''; fEmail.value = saved.email || ''; }
    } catch (e) {}
    function saveDetails() { try { sessionStorage.setItem('details', JSON.stringify({ name: fName.value, email: fEmail.value })); } catch (e) {} }
    fName.addEventListener('input', saveDetails); fEmail.addEventListener('input', saveDetails);
    qs('#co-form').addEventListener('submit', function (e) { e.preventDefault(); });

    function validDetails() {
      var okName = fName.value.trim().length >= 2;
      var okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fEmail.value.trim());
      fName.classList.toggle('invalid', !okName);
      fEmail.classList.toggle('invalid', !okEmail);
      fErr.hidden = okName && okEmail;
      if (!okName) { fErr.textContent = co.errorName || 'Please enter your name.'; fName.focus(); }
      else if (!okEmail) { fErr.textContent = co.errorEmail || 'Please enter a valid email address.'; fEmail.focus(); }
      if (!fErr.hidden) qs('#co-details').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return okName && okEmail;
    }

    /* ----- email the order to the shop owner ----- */
    var of = co.orderForm || {};
    var inboxReady = !isBlank(of.endpoint);
    if (!inboxReady) qs('#inbox-warn').hidden = false;
    function sendOrder(method) {
      if (!inboxReady) return Promise.resolve({ skipped: true });
      if (fHp.value) return Promise.resolve({ skipped: true });          // spam trap
      var itemsText = r.lines.map(function (ln) { return ln.name + ' x' + ln.qty + ' = ' + fmt(ln.lineFinal); }).join('\n');
      var body = {
        subject: String(of.subject || 'New order {order}').replace(/\{order\}/g, code),
        order_code: code, name: fName.value.trim(), email: fEmail.value.trim(), payment_method: method,
        items: itemsText, discount: r.pct + '%' + (r.promoCents > 0 ? ' + flash deal ' + r.promo.pct + '%' : ''), total: fmt(r.totalCents) + ' ' + cur
      };
      if (!isBlank(of.accessKey)) body.access_key = of.accessKey;
      var req = fetch(of.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body), keepalive: true })
        .then(function (res) { return { ok: res.ok }; }, function () { return { ok: false }; });
      var timeout = new Promise(function (res) { setTimeout(function () { res({ ok: false, timeout: true }); }, 4000); });
      return Promise.race([req, timeout]);
    }

    /* ----- PayPal: email the order, then redirect ----- */
    var pp = co.paypal || {};
    if (pp.enabled !== false) {
      qs('#pay-paypal').hidden = false;
      var url = String(pp.linkTemplate || '').replace(/\{amount\}/g, amount).replace(/\{currency\}/g, cur).replace(/\{order\}/g, encodeURIComponent(code));
      var btn = qs('#paypal-btn');
      if (!url || /YOUR_PAYPAL/i.test(url)) {
        btn.removeAttribute('href'); btn.classList.add('is-disabled'); btn.setAttribute('aria-disabled', 'true');
        qs('#paypal-warn').hidden = false;
      } else {
        btn.setAttribute('href', url);
        btn.addEventListener('click', function (e) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
          e.preventDefault();
          if (!validDetails()) return;
          if (btn.classList.contains('is-busy')) return;
          btn.classList.add('is-busy');
          var label = btn.textContent; btn.textContent = 'â€¦';
          // the customer is never blocked from paying, even if the email service is slow or down
          sendOrder('PayPal').then(function () { window.location.href = url; });
          setTimeout(function () { btn.textContent = label; btn.classList.remove('is-busy'); }, 8000);
        });
      }
    }

    /* ----- YouTube video (click to load: fast page, no tracking until played) ----- */
    (function () {
      var v = co.video || {};
      if (v.enabled === false || isBlank(v.url)) return;
      var m = String(v.url).match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
      if (!m) return;
      var id = m[1], box = qs('#co-video'), frame = qs('#video-frame'), play = qs('#video-play'), thumb = qs('#video-thumb');
      thumb.onerror = function () { thumb.remove(); };
      thumb.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
      play.setAttribute('aria-label', v.playLabel || 'Play video');
      play.addEventListener('click', function () {
        var f = document.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
        f.title = v.title || 'Video';
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.classList.add('is-playing');
        frame.textContent = '';
        frame.appendChild(f);
      });
      box.hidden = false;
    })();

    /* ----- Bank transfer: details + "I've made the transfer" ----- */
    var bk = co.bank || {};
    if (bk.enabled !== false) {
      qs('#pay-bank').hidden = false;
      qs('#bank-amount').textContent = fmt(r.totalCents) + ' ' + cur;
      qs('#bank-routing-row').hidden = isBlank(bk.routingNumber);
      qs('#bank-note').textContent = code;
      var qr = qs('#bank-qr');
      if (!isBlank(bk.qrImage)) { var qi = new Image(); qi.src = bk.qrImage; qi.alt = 'Bank QR code'; qi.onload = function () { qr.hidden = false; }; qr.appendChild(qi); }
      document.addEventListener('click', function (e) {
        var cb = e.target.closest('.copy'); if (!cb) return;
        var k = cb.getAttribute('data-copy');
        copyText(cb, k === 'acct' ? String(bk.accountNumber || '') : k === 'amount' ? amount : k === 'routing' ? String(bk.routingNumber || '') : code);
      });
      var confirmBtn = qs('#bank-confirm'), bankErr = qs('#bank-error');
      confirmBtn.addEventListener('click', function () {
        bankErr.hidden = true;
        if (!validDetails()) return;
        confirmBtn.disabled = true;
        var label = confirmBtn.textContent; confirmBtn.textContent = 'â€¦';
        sendOrder('Bank transfer').then(function (res) {
          if (res && res.ok === false) {
            confirmBtn.disabled = false; confirmBtn.textContent = label;
            bankErr.textContent = bk.errorText || 'We could not send your order. Please try again.';
            bankErr.hidden = false;
            return;
          }
          var t = (co.thanks && co.thanks.text) || '';
          qs('#co-thanks-text').textContent = t.replace(/\{order\}/g, code).replace(/\{email\}/g, fEmail.value.trim()).replace(/\{name\}/g, fName.value.trim());
          qs('#co-thanks').hidden = false;
          confirmBtn.textContent = 'âœ“';
          qs('#co-thanks').scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      });
    }
  }).catch(S.showError);
})();
