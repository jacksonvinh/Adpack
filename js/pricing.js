/* ==========================================================================
   pricing.js  —  the package-builder math. Settings live in content.json
   (section type "builder"). You normally do NOT need to edit this file.

   THE RULE
   - Every unit the customer adds is one "unit" of its service.
   - The most expensive unit is the starter and adds no discount.
   - Every other unit adds its service's "extraDiscount" % to ONE order-wide
     discount. Units are counted from the biggest extraDiscount down, and each
     next unit counts a little more ("momentum"), so the more you add, the
     faster the discount grows.
   - The order-wide discount is capped at "discountCap" (50 by default) and is
     applied to the price of EVERY item in the order.
   ========================================================================== */
(function () {
  'use strict';

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  function services(b) {
    return (b && Array.isArray(b.services) ? b.services : []).filter(function (s) {
      return s && typeof s === 'object' && s.hidden !== true && s.id;
    });
  }
  function clampQty(s, q) {
    q = Math.floor(num(q, 0));
    var max = Math.max(0, Math.floor(num(s.max, 99)));
    return Math.max(0, Math.min(max, q));
  }

  // whole-number discount (%) for a given cart
  function pctFor(b, qty) {
    var cap = Math.max(0, num(b.discountCap, 50));
    var mom = Math.max(0, num(b.momentum, 0.1));
    var skipFirst = b.discountStartsAfterFirstItem !== false;
    var units = [];
    services(b).forEach(function (s) {
      var n = clampQty(s, qty[s.id]);
      for (var i = 0; i < n; i++) units.push({ price: num(s.price, 0), d: Math.max(0, num(s.extraDiscount, 0)) });
    });
    if (!units.length) return 0;
    units.sort(function (a, c) { return (c.price - a.price) || (a.d - c.d); });
    var contributing = skipFirst ? units.slice(1) : units.slice();
    contributing.sort(function (a, c) { return c.d - a.d; });
    var sum = 0;
    contributing.forEach(function (u, k) { sum += u.d * (1 + mom * k); });
    return Math.min(cap, Math.round(sum));
  }

  function unitCents(price, pct) { return Math.round(num(price, 0) * 100 * (1 - pct / 100)); }

  function compute(b, qty) {
    qty = qty || {};
    var pct = pctFor(b, qty);
    var lines = [], units = 0, regular = 0, total = 0;
    services(b).forEach(function (s) {
      var n = clampQty(s, qty[s.id]);
      if (!n) return;
      var reg = Math.round(num(s.price, 0) * 100);
      var fin = unitCents(s.price, pct);
      lines.push({ id: s.id, name: s.name, unit: s.unit || s.name, qty: n, unitRegular: reg, unitFinal: fin, lineRegular: reg * n, lineFinal: fin * n });
      units += n; regular += reg * n; total += fin * n;
    });
    // what would one more of each service give?
    var hints = {};
    services(b).forEach(function (s) {
      var n = clampQty(s, qty[s.id]);
      if (n >= Math.max(0, Math.floor(num(s.max, 99)))) return;
      var q2 = {}; Object.keys(qty).forEach(function (k) { q2[k] = qty[k]; });
      q2[s.id] = n + 1;
      hints[s.id] = { gain: pctFor(b, q2) - pct, newPct: pctFor(b, q2) };
    });
    var milestone = null;
    (Array.isArray(b.milestones) ? b.milestones : []).forEach(function (m) {
      if (m && pct >= num(m.pct, 1e9) && (!milestone || num(m.pct, 0) >= num(milestone.pct, 0))) milestone = m;
    });
    return { pct: pct, cap: Math.max(0, num(b.discountCap, 50)), lines: lines, units: units,
             regularCents: regular, totalCents: total, savedCents: regular - total, hints: hints, milestone: milestone };
  }

  function money(cents, symbol) {
    var s = (Math.abs(cents) / 100).toFixed(2);
    return (cents < 0 ? '-' : '') + (symbol == null ? '$' : symbol) + s;
  }

  // "image:2,description:1"
  function encode(qty, b) {
    var out = [];
    services(b).forEach(function (s) { var n = clampQty(s, qty[s.id]); if (n) out.push(s.id + ':' + n); });
    return out.join(',');
  }
  function decode(str, b) {
    var qty = {};
    String(str || '').split(',').forEach(function (p) {
      var kv = p.split(':');
      if (kv.length === 2) qty[decodeURIComponent(kv[0])] = Math.floor(num(kv[1], 0));
    });
    services(b).forEach(function (s) { if (qty[s.id] !== undefined) qty[s.id] = clampQty(s, qty[s.id]); });
    return qty;
  }

  window.Pricing = { compute: compute, pctFor: pctFor, unitCents: unitCents, money: money, encode: encode, decode: decode, services: services, clampQty: clampQty };
})();
