/* ==========================================================================
   core.js  â€”  the page engine shared by every page.
   It reads content.json and fills the layout templates in the HTML.
   You normally do NOT need to edit this file.
   ========================================================================== */
(function () {
  'use strict';

  var Site = window.Site = {
    content: null,
    EDIT: /[?&]edit=1/.test(location.search),   // visual editor mode
    afterRender: []
  };

  /* ---------- helpers ---------- */
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function collect(root, sel) {
    var out = [];
    if (root.matches && root.matches(sel)) out.push(root);
    return out.concat(qsa(sel, root));
  }
  function isBlank(v) { return v === undefined || v === null || (typeof v === 'string' && v.trim() === ''); }
  function kebab(s) { return s.replace(/([A-Z])/g, function (m) { return '-' + m.toLowerCase(); }); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  Site.builder = function () {
    var c = Site.content;
    return c && Array.isArray(c.sections) ? c.sections.find(function (s) { return s && s.type === 'builder'; }) : null;
  };

  function resolve(scope, path) {
    if (isBlank(path)) return undefined;
    if (path === '.') return scope;
    if (path === '$services') { var b = Site.builder(); return b && Array.isArray(b.services) ? b.services : []; }
    var cur = scope, keys = String(path).split('.');
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }
  // where in the data does this path live? (used by the visual editor)
  function locate(scope, path, ctx) {
    if (path === '.') return ctx && ctx.array ? { obj: ctx.array, key: ctx.index } : null;
    var keys = String(path).split('.'), cur = scope;
    for (var i = 0; i < keys.length - 1; i++) {
      if (cur === null || typeof cur !== 'object') return null;
      if (cur[keys[i]] === undefined || cur[keys[i]] === null) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    return cur && typeof cur === 'object' ? { obj: cur, key: keys[keys.length - 1] } : null;
  }
  function visibleItems(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(function (it) { return !isBlank(it) && !(it && typeof it === 'object' && it.hidden === true); });
  }

  /* ---------- safe rich text (bold, italic, colors, fonts) ---------- */
  var ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, SPAN: 1, MARK: 1, A: 1 };
  var DROP_TAGS = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1, TEMPLATE: 1, SVG: 1, NOSCRIPT: 1 };
  var ALLOWED_STYLE = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration'];
  function cleanStyle(css) {
    return css.split(';').map(function (d) {
      var i = d.indexOf(':'); if (i < 0) return '';
      var p = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
      if (ALLOWED_STYLE.indexOf(p) < 0) return '';
      if (!/^[\w\s#%.,'"()\-]+$/.test(v) || /url\(|expression/i.test(v)) return '';
      return p + ': ' + v;
    }).filter(Boolean).join('; ');
  }
  function cleanNode(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
      if (ch.nodeType === 3) return;
      if (ch.nodeType !== 1) { ch.remove(); return; }
      if (DROP_TAGS[ch.tagName]) { ch.remove(); return; }
      if (!ALLOWED_TAGS[ch.tagName]) {
        cleanNode(ch);
        while (ch.firstChild) node.insertBefore(ch.firstChild, ch);
        ch.remove();
        return;
      }
      Array.prototype.slice.call(ch.attributes).forEach(function (a) {
        var n = a.name.toLowerCase();
        if (n === 'style') {
          var s = cleanStyle(a.value);
          if (s) ch.setAttribute('style', s); else ch.removeAttribute('style');
        } else if (n === 'href' && ch.tagName === 'A' && /^(https?:|mailto:|tel:|#|\/|[\w.\-]+\.html)/i.test(a.value.trim())) {
          // keep
        } else { ch.removeAttribute(a.name); }
      });
      if (ch.tagName === 'A') ch.setAttribute('rel', 'noopener');
      cleanNode(ch);
    });
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
    cleanNode(doc.body);
    return doc.body.innerHTML;
  }
  function setRich(el, v) {
    var s = String(v);
    if (!Site.EDIT) s = s.replace(/\{year\}/g, new Date().getFullYear());
    if (/[<&]/.test(s)) el.innerHTML = sanitize(s); else el.textContent = s;
  }

  /* ---------- theme ---------- */
  var fontLinks = {};
  function fontLink(id, href) {
    if (fontLinks[id]) { if (fontLinks[id].getAttribute('href') !== href) fontLinks[id].setAttribute('href', href); return; }
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
    fontLinks[id] = l;
  }
  Site.googleFontUrl = function (name) {
    return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap';
  };
  Site.applyTheme = function (theme, site) {
    theme = theme || {};
    var root = document.documentElement.style;
    var colors = theme.colors || {};
    Object.keys(colors).forEach(function (k) {
      if (k.charAt(0) === '_' || isBlank(colors[k])) return;
      root.setProperty('--c-' + kebab(k), colors[k]);
    });
    var f = theme.fonts || {};
    if (!isBlank(f.heading)) root.setProperty('--font-heading', f.heading);
    if (!isBlank(f.body)) root.setProperty('--font-body', f.body);
    if (!isBlank(f.baseSize)) root.setProperty('--base-size', f.baseSize);
    if (!isBlank(f.headingWeight)) root.setProperty('--heading-weight', f.headingWeight);
    if (!isBlank(f.googleFontsUrl)) fontLink('main', f.googleFontsUrl);
    ((site && site.extraFonts) || []).forEach(function (n) { if (!isBlank(n)) fontLink('x-' + n, Site.googleFontUrl(n)); });
    var s = theme.shape || {};
    if (!isBlank(s.cardRadius)) root.setProperty('--radius-card', s.cardRadius);
    if (!isBlank(s.tileRadius)) root.setProperty('--radius-tile', s.tileRadius);
    if (!isBlank(s.buttonRadius)) root.setProperty('--radius-button', s.buttonRadius);
    if (!isBlank(s.pageWidth)) root.setProperty('--page-width', s.pageWidth);
    Site.phColors = Array.isArray(theme.placeholderColors) ? theme.placeholderColors.filter(function (c) { return !isBlank(c); }) : [];
  };
  Site.phColors = [];

  /* ---------- images & placeholders ---------- */
  function makePlaceholder(o) {
    var ph = document.createElement('div');
    ph.className = 'ph';
    var t = document.createElement('span');
    t.textContent = !isBlank(o.placeholder) ? o.placeholder : 'Your image goes here';
    ph.appendChild(t);
    var s = document.createElement('small');
    s.textContent = Site.EDIT ? 'Click to upload an image' : (!isBlank(o.image) ? 'Add file: ' + o.image : '');
    if (s.textContent) ph.appendChild(s);
    return ph;
  }
  function renderMedia(el, val) {
    var o = typeof val === 'string' ? { image: val } : (val && typeof val === 'object' ? val : {});
    el.textContent = '';
    el.classList.add('media');
    function showPlaceholder() { el.textContent = ''; el.appendChild(makePlaceholder(o)); }
    if (isBlank(o.image)) { showPlaceholder(); return; }
    var img = new Image();
    img.alt = !isBlank(o.alt) ? o.alt : (!isBlank(o.caption) ? o.caption : '');
    img.decoding = 'async';
    img.draggable = false;
    img.onerror = showPlaceholder;
    img.src = o.image;
    el.appendChild(img);
  }

  /* ---------- before/after slider ---------- */
  function initCompare(el, cfg) {
    var tpl = document.getElementById('tpl-compare');
    el.textContent = '';
    el.appendChild(tpl.content.cloneNode(true));
    bind(el, cfg, {}, true);
    var start = Number(cfg.startPosition);
    if (isNaN(start)) start = 50;
    start = Math.max(0, Math.min(100, start));
    var range = el.querySelector('.cmp-range');
    range.value = start;
    range.setAttribute('aria-label', !isBlank(cfg.handleLabel) ? cfg.handleLabel : 'Drag to compare before and after');
    el.style.setProperty('--pos', start + '%');
    range.addEventListener('input', function () { el.style.setProperty('--pos', range.value + '%'); });
  }

  /* ---------- automatic column layout ---------- */
  var layoutBoxes = [], ro = null, scheduled = false;
  function layoutGrid(el) {
    var items = Array.prototype.slice.call(el.children).filter(function (c) { return c.tagName !== 'TEMPLATE' && !c.hasAttribute('data-editor-ui'); });
    var n = items.length;
    if (!n) return;
    var mode = el.getAttribute('data-layout');
    var min = Number(el.getAttribute('data-min')) || 200;
    var max = Number(el.getAttribute('data-max')) || 4;
    var gap = parseFloat(getComputedStyle(el).columnGap) || 16;
    var w = el.clientWidth || (el.parentElement ? el.parentElement.clientWidth : 0) || 800;
    var fit = Math.max(1, Math.min(Math.floor((w + gap) / (min + gap)), max, n));
    var cols = fit, missing = 0;
    if (fit >= 2) {
      var best = null;
      for (var c = fit; c >= 2; c--) {
        var m = (c - (n % c)) % c;
        if (best === null || m < best.m) best = { c: c, m: m };
      }
      cols = best.c; missing = best.m;
    }
    el.style.setProperty('--cols', cols);
    items.forEach(function (it) { it.style.gridColumn = ''; });
    if (mode === 'span' && missing > 0) items[n - 1].style.gridColumn = 'span ' + (missing + 1);
  }
  Site.relayout = function () {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; layoutBoxes.forEach(layoutGrid); });
  };
  Site.resetLayout = function () {
    layoutBoxes = [];
    if (ro) ro.disconnect();
    ro = window.ResizeObserver ? new ResizeObserver(Site.relayout) : null;
  };
  Site.resetLayout();
  function registerLayout(el) {
    if (layoutBoxes.indexOf(el) === -1) { layoutBoxes.push(el); if (ro) ro.observe(el); }
    layoutGrid(el);
  }

  /* ---------- lists: one data entry = one copy of the <template> ---------- */
  function renderList(container, scope, ctx) {
    var tpl = container.querySelector(':scope > template');
    if (!tpl) return;
    Array.prototype.slice.call(container.children).forEach(function (c) { if (c !== tpl) c.remove(); });
    var path = container.getAttribute('data-list');
    var readonly = (ctx && ctx.readonly) || container.hasAttribute('data-readonly');
    var arr = resolve(scope, path);
    if (Site.EDIT && !readonly) {
      var loc = locate(scope, path, ctx);
      if (loc) {
        if (!Array.isArray(loc.obj[loc.key])) loc.obj[loc.key] = [];
        arr = loc.obj[loc.key];
        container._list = { arr: arr, tpl: tpl };
        container.classList.add('ed-list');
      }
    }
    if (!Array.isArray(arr)) arr = [];
    var shown = 0;
    arr.forEach(function (item, i) {
      if (item === null || item === undefined) return;
      var hiddenItem = item && typeof item === 'object' && item.hidden === true;
      if (!Site.EDIT && (isBlank(item) || hiddenItem)) return;
      var el = tpl.content.firstElementChild.cloneNode(true);
      if (container.hasAttribute('data-ph-cycle') && Site.phColors.length) {
        el.style.setProperty('--ph-bg', Site.phColors[shown % Site.phColors.length]);
      }
      var c2 = { array: arr, index: i, readonly: readonly };
      bind(el, item, c2);
      if (Site.EDIT && !readonly) { el._item = { arr: arr, index: i }; el.classList.add('ed-item'); }
      if (Site.EDIT && hiddenItem) el.classList.add('ed-dim');
      container.appendChild(el);
      shown++;
    });
    if (container.hasAttribute('data-layout')) registerLayout(container);
  }

  /* ---------- binding: fills elements from data ---------- */
  function bind(root, scope, ctx, isCompare) {
    ctx = ctx || {};
    var edit = Site.EDIT && !ctx.readonly;

    collect(root, '[data-show-if]').forEach(function (el) {
      var v = resolve(scope, el.getAttribute('data-show-if'));
      el.hidden = Array.isArray(v) ? visibleItems(v).length === 0 : isBlank(v);
    });

    collect(root, '[data-text]').forEach(function (el) {
      var path = el.getAttribute('data-text');
      var v = resolve(scope, path);
      var fmt = el.getAttribute('data-format');
      if (fmt === 'stars') {
        var r = Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
        v = r ? new Array(r + 1).join('\u2605') : '';
        el.hidden = !v; el.textContent = v;
        return;
      }
      if (edit) {
        el._m = locate(scope, path, ctx);
        if (el._m) {
          el.classList.add('ed-text');
          el.setAttribute('data-ph', el.getAttribute('data-ph') || 'Click to type');
        }
      }
      if (isBlank(v) && el.hasAttribute('data-fallback')) v = el.getAttribute('data-fallback');
      if (isBlank(v) || typeof v === 'object') { el.textContent = ''; el.hidden = !(edit && el._m); }
      else { setRich(el, v); el.hidden = false; }
    });

    collect(root, '[data-href]').forEach(function (el) {
      var path = el.getAttribute('data-href');
      var v = resolve(scope, path);
      if (isBlank(v)) el.removeAttribute('href'); else el.setAttribute('href', String(v));
      if (edit) el._href = locate(scope, path, ctx);
    });

    collect(root, '[data-attr]').forEach(function (el) {
      var parts = el.getAttribute('data-attr').split(':');
      var v = resolve(scope, parts[1]);
      if (!isBlank(v)) el.setAttribute(parts[0], String(v));
    });

    collect(root, '[data-num]').forEach(function (el) {
      var path = el.getAttribute('data-num');
      var v = resolve(scope, path);
      el.value = isBlank(v) ? '' : v;
      if (edit) el._m = locate(scope, path, ctx);
    });

    collect(root, '[data-index]').forEach(function (el) { el.textContent = pad2((ctx.index || 0) + 1); });

    collect(root, '[data-img]').forEach(function (el) {
      var path = el.getAttribute('data-img');
      renderMedia(el, resolve(scope, path));
      if (edit) { el._img = locate(scope, path, ctx); if (el._img) el.classList.add('ed-img'); }
    });

    if (!isCompare) {
      collect(root, '[data-compare]').forEach(function (el) {
        var cfg = resolve(scope, el.getAttribute('data-compare'));
        initCompare(el, cfg && typeof cfg === 'object' ? cfg : {});
      });
      // the list of lists is collected once, before any item is built
      collect(root, '[data-list]').forEach(function (el) { renderList(el, scope, ctx); });
    }
  }

  /* ---------- loading ---------- */
  Site.loadContent = function () {
    return fetch('content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (c) {
        if (!Array.isArray(c.sections)) c.sections = [];
        Site.content = c;
        return c;
      });
  };
  Site.showError = function (err) {
    var box = document.getElementById('load-error');
    if (!box) { alert('Could not load content.json'); return; }
    var onFile = location.protocol === 'file:';
    box.hidden = false;
    box.innerHTML = '<p><strong>The page could not load content.json.</strong></p>';
    var p = document.createElement('p');
    if (onFile) {
      p.innerHTML = 'Browsers block this when the page is opened by double-clicking the file. Run <code>start-editor</code> (see <code>README.txt</code>) or upload the folder to your web host.';
    } else {
      p.textContent = 'Check that content.json is next to index.html and is valid JSON (a missing comma or quote is the usual cause). Details: ' + (err && err.message ? err.message : err);
    }
    box.appendChild(p);
  };
  Site.loadScript = function (src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  };
  Site.applySite = function (site) {
    site = site || {};
    if (!isBlank(site.title)) document.title = site.title;
    var meta = qs('meta[name="description"]');
    if (meta && !isBlank(site.description)) meta.setAttribute('content', site.description);
    if (!isBlank(site.favicon)) {
      var ic = qs('link[rel="icon"]');
      if (!ic) { ic = document.createElement('link'); ic.rel = 'icon'; document.head.appendChild(ic); }
      ic.href = site.favicon;
    }
  };

  Site.bind = bind; Site.renderList = renderList; Site.resolve = resolve; Site.locate = locate;
  Site.sanitize = sanitize; Site.setRich = setRich; Site.isBlank = isBlank; Site.visibleItems = visibleItems;
  Site.qs = qs; Site.qsa = qsa; Site.initCompare = initCompare; Site.renderMedia = renderMedia;
})();
