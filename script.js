/* ==========================================================================
   script.js  —  home page: builds the sections, runs the package builder
   (prices, discounts, confetti). You normally do NOT need to edit this file.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Site, P = window.Pricing;
  var qs = S.qs, qsa = S.qsa, isBlank = S.isBlank;
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- cart (remembered while the tab is open) ---------- */
  var cart = {};
  try { cart = JSON.parse(sessionStorage.getItem('cart') || '{}') || {}; } catch (e) { cart = {}; }
  function saveCart() { try { sessionStorage.setItem('cart', JSON.stringify(cart)); } catch (e) {} }
  S.cart = cart;

  /* ---------- brand / logo ---------- */
  function renderBrand(site) {
    var a = qs('.brand');
    a.textContent = '';
    var has = !isBlank(site && site.logo);
    a.hidden = !has && !S.EDIT;
    if (has) {
      var img = new Image();
      img.className = 'brand-logo'; img.alt = 'Logo'; img.draggable = false;
      img.onerror = function () { img.remove(); addPh(); };
      img.src = site.logo;
      a.appendChild(img);
    } else if (S.EDIT) addPh();
    function addPh() {
      var ph = document.createElement('span');
      ph.className = 'brand-ph'; ph.textContent = 'Click to add your logo';
      a.appendChild(ph);
    }
  }

  /* ---------- confetti ---------- */
  function burst(x, y, count) {
    if (reduceMotion || S.EDIT) return;
    var cv = qs('#confetti'); if (!cv) return;
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    var ctx = cv.getContext('2d');
    var cs = getComputedStyle(document.documentElement);
    var colors = ['--c-accent', '--c-accent-soft', '--c-pop', '--c-navy', '--c-surface'].map(function (v) { return cs.getPropertyValue(v).trim() || '#5267F5'; });
    var parts = [];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5, r: 4 + Math.random() * 6, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 });
    }
    var raf = null;
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      var alive = false;
      parts.forEach(function (p) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
        if (p.life <= 0) return;
        alive = true;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.strokeStyle = '#17213A'; ctx.lineWidth = 1; ctx.strokeRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      });
      if (alive) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ---------- count-up numbers ---------- */
  function tween(el, toCents, fmt) {
    var from = Number(el._cents); if (isNaN(from)) from = toCents;
    el._cents = toCents;
    if (reduceMotion || S.EDIT || from === toCents) { el.textContent = fmt(toCents); return; }
    var t0 = performance.now(), dur = 450;
    cancelAnimationFrame(el._raf);
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (toCents - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- package builder ---------- */
  var prevPct = 0, stickyObserver = null, builderVisible = false, activeBuilder = null;

  function initBuilder(root, b) {
    stopPromo();
    (b.services || []).forEach(function (s) {
      if (s && s.id && cart[s.id] === undefined) cart[s.id] = Math.max(0, Number(s.startQty) || 0);
    });
    root._b = b;
    activeBuilder = root;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        var row = btn.closest('.svc'); if (!row) return;
        var s = P.services(b).find(function (x) { return String(x.id) === row.dataset.sid; });
        if (!s) return;
        var delta = btn.getAttribute('data-act') === 'inc' ? 1 : -1;
        cart[s.id] = P.clampQty(s, (Number(cart[s.id]) || 0) + delta);
        saveCart();
        update(b, root, { fromEl: btn });
        return;
      }
      var co = e.target.closest('.b-checkout');
      if (co && co.classList.contains('is-disabled')) e.preventDefault();
    });
    root.addEventListener('change', function (e) { if (e.target.matches('[data-live="builder"]')) update(b, root, { silent: true }); });
    prevPct = P.compute(b, cart).pct;
    update(b, root, { silent: true });
    if ('IntersectionObserver' in window) {
      if (stickyObserver) stickyObserver.disconnect();
      var grid = qs('.builder-grid', root) || root;
      stickyObserver = new IntersectionObserver(function (en) { builderVisible = en[0].isIntersecting; updateSticky(); }, { threshold: 0.05 });
      stickyObserver.observe(grid);
    }
  }
  S.updateBuilders = function () { if (activeBuilder && activeBuilder.isConnected) update(activeBuilder._b, activeBuilder, { silent: true }); };

  var last = { r: null, b: null };
  function update(b, root, opts) {
    opts = opts || {};
    var r = P.compute(b, cart), sym = b.currencySymbol == null ? '$' : b.currencySymbol, L = b.labels || {};
    var fmt = function (c) { return P.money(c, sym); };
    last = { r: r, b: b };

    // service rows
    qsa('.svc', root).forEach(function (row) {
      var s = P.services(b).find(function (x) { return String(x.id) === row.dataset.sid; });
      if (!s) return;
      var q = P.clampQty(s, cart[s.id]);
      qs('.svc-qty', row).textContent = q;
      row.classList.toggle('is-active', q > 0);
      var now = qs('.svc-now', row), was = qs('.svc-was', row), tag = qs('.svc-tag', row);
      now.textContent = fmt(P.unitCents(s.price, r.pct));
      was.textContent = fmt(Math.round(Number(s.price) * 100 || 0));
      was.hidden = r.pct <= 0;
      if (tag) tag.textContent = (L.extraTag || '+{pct}% off').replace('{pct}', Number(s.extraDiscount) || 0);
      qs('[data-act="dec"]', row).disabled = q <= 0;
      qs('[data-act="inc"]', row).disabled = q >= Math.max(0, Math.floor(Number(s.max) || 99));
    });

    // receipt
    var list = qs('.receipt', root);
    list.textContent = '';
    var tpl = document.getElementById('tpl-receipt-line');
    r.lines.forEach(function (ln) {
      var li = tpl.content.firstElementChild.cloneNode(true);
      qs('.rc-name', li).textContent = ln.name;
      qs('.rc-qty', li).textContent = '\u00d7' + ln.qty;
      qs('.rc-price', li).textContent = fmt(ln.lineFinal);
      var w = qs('.rc-was', li);
      if (r.pct > 0) w.textContent = fmt(ln.lineRegular); else w.hidden = true;
      list.appendChild(li);
    });
    qs('.receipt-empty', root).hidden = r.units > 0;
    qs('.receipt-empty', root).textContent = L.emptyText || '';

    // totals
    tween(qs('.t-regular', root), r.regularCents, fmt);
    tween(qs('.t-save', root), r.savedCents, fmt);
    tween(qs('.t-total', root), r.totalCents, fmt);
    qs('.row-regular', root).hidden = r.savedCents <= 0 && r.promoCents <= 0;
    qs('.row-save', root).hidden = r.savedCents <= 0;
    var pr = qs('.row-promo', root);
    pr.hidden = r.promoCents <= 0;
    if (r.promoCents > 0) {
      qs('.t-promo-label', pr).textContent = ((b.promo && b.promo.rowLabel) || 'Flash deal') + ' (-' + r.promo.pct + '%)';
      tween(qs('.t-promo', pr), -r.promoCents, fmt);
    }
    renderPromo(b, root, r.promo);

    // sticker + meter
    var st = qs('.pct-sticker', root);
    qs('.pct-num', st).textContent = '-' + r.pct + '%';
    st.hidden = r.pct <= 0;
    if (!opts.silent && r.pct !== prevPct) { st.classList.remove('bump'); void st.offsetWidth; st.classList.add('bump'); }
    qs('.meter-fill', root).style.width = (r.cap ? Math.min(100, r.pct / r.cap * 100) : 0) + '%';
    qs('.meter-max', root).textContent = r.cap + '%';

    // messages
    var msg = qs('.meter-msg', root), hint = qs('.meter-hint', root);
    if (r.units === 0) { msg.textContent = ''; hint.textContent = ''; }
    else {
      msg.textContent = r.milestone ? r.milestone.text : '';
      if (r.pct >= r.cap && r.cap > 0) hint.textContent = L.maxHint || '';
      else {
        var best = null;
        P.services(b).forEach(function (s) {
          var h = r.hints[s.id];
          if (h && h.gain > 0 && (!best || h.gain > best.gain)) best = { s: s, gain: h.gain };
        });
        hint.textContent = best ? (L.nextHint || '').replace('{service}', best.s.unit || best.s.name).replace('{gain}', best.gain) : '';
      }
    }

    // checkout link
    var co = qs('.b-checkout', root);
    co.setAttribute('href', (b.checkoutLink || 'checkout.html') + '?cart=' + encodeURIComponent(P.encode(cart, b)));
    co.classList.toggle('is-disabled', r.units === 0);
    co.setAttribute('aria-disabled', r.units === 0 ? 'true' : 'false');

    // celebrate
    if (!opts.silent && r.pct > prevPct) {
      var box = (opts.fromEl || qs('.pct-sticker', root)).getBoundingClientRect();
      var crossed = Math.floor(r.pct / 10) > Math.floor(prevPct / 10) || (r.pct >= r.cap && prevPct < r.cap);
      burst(box.left + box.width / 2, box.top + box.height / 2, crossed ? 140 : 36);
    }
    prevPct = r.pct;
    updateSticky();
  }

  /* ---------- flash deal strip + countdown ----------
     One timer, only while the strip is on screen AND the tab is visible, and it only
     writes the numbers that changed. Costs almost nothing. */
  var promoTimer = null, promoSeen = true, promoIO = null, promoCtx = null, cdLast = {};
  function stopPromo() {
    if (promoTimer) { clearInterval(promoTimer); promoTimer = null; }
    if (promoIO) { promoIO.disconnect(); promoIO = null; }
    promoCtx = null; cdLast = {}; promoSeen = true;
  }
  function setCd(root, sel, v) { if (cdLast[sel] !== v) { cdLast[sel] = v; qs(sel, root).textContent = v; } }
  function drawClock(root, ms, secs) {
    var t = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    setCd(root, '.cd-dd b', z(d)); setCd(root, '.cd-h', z(h)); setCd(root, '.cd-m', z(m)); setCd(root, '.cd-s', z(s));
    qs('.cd-dd', root).hidden = d <= 0;
    qs('.cd-ss', root).hidden = !secs;
  }
  function promoTick() {
    var c = promoCtx; if (!c || !c.root.isConnected) return stopPromo();
    var st = P.promoState(c.b);
    if (!st.active) { stopPromo(); update(c.b, c.root, { silent: true }); return; }   // deal just ended: prices and strip update
    drawClock(c.root, st.msLeft, st.showSeconds);
  }
  function syncPromoTimer() {
    var run = promoCtx && promoCtx.timed && promoSeen && !document.hidden;
    if (run && !promoTimer) { promoTick(); if (promoCtx) promoTimer = setInterval(promoTick, promoCtx.secs ? 1000 : 20000); }
    else if (!run && promoTimer) { clearInterval(promoTimer); promoTimer = null; }
  }
  document.addEventListener('visibilitychange', syncPromoTimer);

  function renderPromo(b, root, st) {
    var box = qs('.promo', root); if (!box) return;
    var edit = !!S.EDIT, on = st.active, show = on || st.expired || edit;
    box.hidden = !show;
    box.classList.toggle('is-off', !on);
    box.classList.toggle('is-ended', !on && !edit);
    if (!show) { stopPromo(); return; }
    qs('.promo-pct b', box).textContent = '+' + st.pct + '%';
    var clock = qs('.promo-clock', box), slots = qs('.promo-slots', box), ended = qs('.promo-ended', box);
    clock.hidden = !st.usesTime || (!on && !edit);
    slots.hidden = !st.usesSlots || (!on && !edit);
    ended.hidden = !st.expired;
    if (st.usesTime) drawClock(box, on ? st.msLeft : 0, st.showSeconds);
    if (st.usesSlots) {
      qs('.promo-left', box).textContent = st.slotsLeft;
      var f = st.slotsTotal ? Math.max(0, Math.min(100, st.slotsLeft / st.slotsTotal * 100)) : 0;
      qs('.promo-bar-fill', box).style.width = f + '%';
      slots.classList.toggle('low', f <= 25);
    }
    // timer bookkeeping
    cdLast = {};
    promoCtx = { b: b, root: root, timed: on && st.usesTime && !edit, secs: st.showSeconds };
    if (promoCtx.timed && 'IntersectionObserver' in window) {
      if (promoIO) promoIO.disconnect();
      promoIO = new IntersectionObserver(function (en) { promoSeen = en[0].isIntersecting; syncPromoTimer(); }, { threshold: 0 });
      promoIO.observe(box);
    } else if (promoCtx.timed) promoSeen = true;
    if (st.usesTime && on && edit) drawClock(box, st.msLeft, st.showSeconds);
    syncPromoTimer();
  }

  function updateSticky() {
    var bar = qs('#sticky-bar'); if (!bar || !last.r) return;
    var r = last.r, b = last.b, sym = b.currencySymbol == null ? '$' : b.currencySymbol;
    qs('#sticky-total').textContent = P.money(r.totalCents, sym);
    var sv = qs('#sticky-save');
    sv.textContent = r.effPct > 0 ? '-' + r.effPct + '%' : '';
    sv.hidden = r.effPct <= 0;
    var a = qs('#sticky-btn');
    a.textContent = (b.labels && b.labels.checkoutLabel) || 'Checkout';
    a.setAttribute('href', (b.checkoutLink || 'checkout.html') + '?cart=' + encodeURIComponent(P.encode(cart, b)));
    bar.classList.toggle('show', r.units > 0 && !builderVisible && !S.EDIT);
  }

  /* ---------- moving ticker ---------- */
  function setupMarquee(root) {
    var track = qs('.marquee-track', root);
    if (!track || S.EDIT) return;
    var kids = Array.prototype.slice.call(track.children).filter(function (c) { return c.tagName !== 'TEMPLATE'; });
    if (!kids.length) return;
    var itemsW = track.scrollWidth || 1, cw = root.clientWidth || window.innerWidth;
    var repeats = Math.max(1, Math.ceil(cw / itemsW));
    // first half = the items repeated until it is wider than the screen; second half = identical copy (seamless loop)
    var half = kids.slice();
    for (var r = 1; r < repeats; r++) kids.forEach(function (k) { var c = k.cloneNode(true); track.appendChild(c); half.push(c); });
    half.forEach(function (k) { var c = k.cloneNode(true); c.setAttribute('aria-hidden', 'true'); track.appendChild(c); });
  }

  /* ---------- sections ---------- */
  function renderSections(content) {
    var main = qs('#sections');
    main.textContent = '';
    S.resetLayout();
    (content.sections || []).forEach(function (sec, i) {
      if (!sec || typeof sec !== 'object') return;
      var hiddenSec = sec.enabled === false;
      if (hiddenSec && !S.EDIT) return;
      var tpl = document.getElementById('sec-' + sec.type);
      if (!tpl) return;
      var el = tpl.content.firstElementChild.cloneNode(true);
      var req = el.getAttribute('data-requires');
      if (req && !S.EDIT && S.visibleItems(sec[req]).length === 0) return;
      if (!isBlank(sec.id)) el.id = sec.id;
      el.setAttribute('data-sec-index', i);
      if (S.EDIT) { el._sec = { arr: content.sections, index: i }; el.classList.add('ed-sec'); }
      if (hiddenSec) el.classList.add('ed-dim', 'ed-hidden-sec');
      S.bind(el, sec, {});
      main.appendChild(el);
      if (sec.type === 'builder') initBuilder(el, sec);
      if (sec.type === 'marquee') setupMarquee(el);
    });
    if (S.EDIT) qsa('.faq-a').forEach(function (a) { a.hidden = false; });
  }

  S.render = function () {
    var c = S.content, y = window.scrollY;
    S.applyTheme(c.theme, c.site);
    S.applySite(c.site);
    S.bind(qs('#nav'), c, {});
    S.bind(qs('#footer'), c, {});
    renderBrand(c.site);
    renderSections(c);
    S.relayout();
    S.afterRender.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    window.scrollTo(0, y);
  };

  /* ---------- FAQ accordion ---------- */
  function toggleFaq(q) {
    var open = q.getAttribute('aria-expanded') === 'true';
    q.setAttribute('aria-expanded', open ? 'false' : 'true');
    q.parentElement.querySelector('.faq-a').hidden = open;
  }
  function editingNow() { return S.EDIT && !document.body.classList.contains('ed-preview'); }
  document.addEventListener('click', function (e) {
    if (editingNow()) return;
    var q = e.target.closest('.faq-q'); if (q) toggleFaq(q);
  });
  document.addEventListener('keydown', function (e) {
    if (editingNow()) return;
    var q = e.target.closest && e.target.closest('.faq-q');
    if (q && q === e.target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleFaq(q); }
  });

  /* ---------- start ---------- */
  var editorReady = S.EDIT
    ? Promise.all([S.loadScript('js/editor.js')]).catch(function () { S.EDIT = false; })
    : Promise.resolve();
  Promise.all([S.loadContent(), editorReady]).then(function () {
    S.render();
    window.addEventListener('resize', S.relayout);
    if (S.EDIT && window.Editor) window.Editor.init();
    else if (location.hash) { var t = qs(location.hash); if (t) t.scrollIntoView(); }
  }).catch(S.showError);
})();
