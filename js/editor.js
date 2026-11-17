/* ==========================================================================
   editor.js  —  the visual editor. Only loads at  index.html?edit=1
   (start-editor opens that address for you). It edits content.json.
   Do NOT upload this file to your web host.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.Site, qs = S.qs, qsa = S.qsa;
  var E = window.Editor = {};

  var history = [], hi = -1, dirty = false, serverOk = false, preview = false;
  var currentEl = null, savedRange = null, hideTimer = null;
  var FONTS = ['Inter', 'Space Grotesk', 'Poppins', 'Montserrat', 'DM Sans', 'Rubik', 'Lora', 'Playfair Display', 'Bebas Neue', 'Anton', 'Fredoka', 'Pacifico'];
  var ELECTRIC = { background: '#F4F6FC', surface: '#FFFFFF', text: '#17213A', mutedText: '#55607A', accent: '#5267F5', accentText: '#3F52E0', accentSoft: '#A9B8FF', navy: '#17213A', pop: '#FFE45C' };

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function uid() { return Math.random().toString(36).slice(2, 7); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- section types you can add ---------- */
  var TYPES = {
    text: { label: 'Text block', make: function () { return { type: 'text', name: 'Text block', enabled: true, eyebrow: 'New section', title: 'Your headline', items: ['Write something here.'] }; } },
    steps: { label: 'Steps', make: function () { return { type: 'steps', name: 'Steps', enabled: true, eyebrow: 'How it works', title: 'Three easy steps.', items: [{ title: 'Step one', text: 'Describe it.' }, { title: 'Step two', text: 'Describe it.' }, { title: 'Step three', text: 'Describe it.' }] }; } },
    checklist: { label: 'Checklist / benefits', make: function () { return { type: 'checklist', name: 'Benefits', enabled: true, eyebrow: 'Why us', title: 'Good reasons.', items: [{ title: 'Reason one.', text: 'Explain it.' }, { title: 'Reason two.', text: 'Explain it.' }] }; } },
    gallery: { label: 'Image gallery', make: function () { return { type: 'gallery', name: 'Gallery', enabled: true, eyebrow: 'Gallery', title: 'Our work.', intro: '', items: [{ image: '', caption: '', alt: '', placeholder: 'Image 1' }, { image: '', caption: '', alt: '', placeholder: 'Image 2' }, { image: '', caption: '', alt: '', placeholder: 'Image 3' }, { image: '', caption: '', alt: '', placeholder: 'Image 4' }] }; } },
    transformations: { label: 'Before/after sliders', make: function () { return { type: 'transformations', name: 'Before/after sliders', enabled: true, title: 'Drag to compare.', subtitle: '', items: [{ before: { image: '', alt: 'Before', placeholder: 'Before photo' }, after: { image: '', alt: 'After', placeholder: 'After image' }, caption: 'Example' }] }; } },
    testimonials: { label: 'Testimonials', make: function () { return { type: 'testimonials', name: 'Testimonials', enabled: true, eyebrow: 'Testimonials', title: 'What people say.', items: [{ quote: 'Write the customer\'s words here.', name: 'Customer name', role: 'Shop name', avatar: '', rating: 5 }] }; } },
    faq: { label: 'Questions (FAQ)', make: function () { return { type: 'faq', name: 'Questions', enabled: true, eyebrow: 'FAQ', title: 'Questions, answered.', items: [{ q: 'New question?', a: 'Your answer.' }] }; } },
    banner: { label: 'Big call-to-action banner', make: function () { return { type: 'banner', name: 'Banner', enabled: true, title: 'Ready to start?', text: 'Say it in one line.', buttonLabel: 'Get started', buttonLink: '#pricing' }; } },
    headline: { label: 'Big headline', make: function () { return { type: 'headline', name: 'Headline', enabled: true, eyebrow: 'Small label', title: 'Your <mark>big headline</mark>', subtitle: 'A supporting line.', buttonLabel: 'Button', buttonLink: '#pricing' }; } },
    marquee: { label: 'Moving ticker strip', make: function () { return { type: 'marquee', name: 'Ticker', enabled: true, items: ['First phrase', 'Second phrase', 'Third phrase'] }; } },
    hero: { label: 'Before/after hero slider', make: function () { return { type: 'hero', name: 'Hero slider', enabled: true, before: { image: '', alt: 'Before', placeholder: 'Before photo' }, after: { image: '', alt: 'After', placeholder: 'After image' }, beforeLabel: 'Before', afterLabel: 'After', startPosition: 50, sticker: 'Drag me!' }; } }
  };

  /* ---------- history / dirty / status ---------- */
  function snap() { return JSON.stringify(S.content); }
  function commit() {
    var s = snap();
    if (history[hi] === s) return;
    history = history.slice(0, hi + 1); history.push(s);
    if (history.length > 60) history.shift();
    hi = history.length - 1;
    markDirty();
  }
  function markDirty() { dirty = true; setStatus('Unsaved changes'); }
  function setStatus(t, bad) { var s = qs('#ed-status'); if (s) { s.textContent = t; s.classList.toggle('bad', !!bad); } }
  function toast(t) {
    var n = el('div', 'ed-toast', ''); n.textContent = t; n.setAttribute('data-editor-ui', '');
    document.body.appendChild(n); setTimeout(function () { n.remove(); }, 3600);
  }
  function restore(s) { S.content = JSON.parse(s); S.render(); renderSettings(); markDirty(); }
  function undo() { if (hi > 0) { hi--; restore(history[hi]); } }
  function redo() { if (hi < history.length - 1) { hi++; restore(history[hi]); } }
  function rerender() { commit(); S.render(); }

  /* ---------- server ---------- */
  function headers(extra) { var h = { 'X-Editor': '1' }; Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; }); return h; }
  function ping() {
    return fetch('/__admin/ping', { headers: headers() }).then(function (r) { return r.json(); })
      .then(function (j) { serverOk = !!(j && j.ok); }).catch(function () { serverOk = false; })
      .then(function () { setStatus(serverOk ? 'Ready' : 'Offline mode: Save will download content.json'); });
  }
  function save() {
    if (!serverOk) {
      var blob = new Blob([JSON.stringify(S.content, null, 2) + '\n'], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'content.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast('content.json downloaded. Replace the file in your website folder with it.');
      return;
    }
    setStatus('Saving…');
    fetch('/__admin/save', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(S.content, null, 2) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) throw new Error(x.j.error || 'Save failed');
        dirty = false; setStatus('Saved at ' + new Date().toLocaleTimeString());
      })
      .catch(function (e) { setStatus('Save failed: ' + e.message, true); });
  }
  function upload(file) {
    if (!serverOk) { toast('Uploading images needs the editor server. Run start-editor.'); return Promise.resolve(null); }
    return fetch('/__admin/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: headers({ 'Content-Type': 'application/octet-stream' }), body: file })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (!x.ok || !x.j.ok) throw new Error(x.j.error || 'Upload failed'); return x.j.path; })
      .catch(function (e) { toast(e.message); return null; });
  }
  function pickFiles(multiple) {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
      inp.addEventListener('change', function () { resolve(Array.prototype.slice.call(inp.files)); });
      inp.click();
    });
  }
  function setImage(loc, path) {
    var v = loc.obj[loc.key];
    if (v && typeof v === 'object' && !Array.isArray(v)) v.image = path; else loc.obj[loc.key] = path;
  }

  /* ---------- text editing ---------- */
  function serialize(node) {
    var c = node.cloneNode(true);
    qsa('[data-editor-ui]', c).forEach(function (n) { n.remove(); });
    var html = c.innerHTML.replace(/(<br\s*\/?>\s*)+$/i, '');
    var plain = c.textContent.replace(/ /g, ' ');
    if (plain.trim() === '') return '';
    var clean = S.sanitize(html);
    if (/[<&]/.test(plain)) return clean;
    if (!/<[a-z]/i.test(clean)) return plain.replace(/\s+$/, '');
    return clean;
  }
  function onInput(e) {
    var n = e.currentTarget || e;
    if (!n._m) return;
    n._m.obj[n._m.key] = serialize(n);
    n._changed = true;
    markDirty();
  }
  function bindText(n) {
    if (n._edBound) return;
    n._edBound = true;
    n.spellcheck = false;
    n.addEventListener('focus', function () { clearTimeout(hideTimer); currentEl = n; showFormat(n); });
    n.addEventListener('input', onInput);
    n.addEventListener('blur', function () {
      if (n._changed) { n._changed = false; commit(); }
      hideTimer = setTimeout(function () {
        var a = document.activeElement;
        if (!a || !qs('#ed-fmt').contains(a)) hideFormat();
      }, 200);
    });
    n.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
      else if (e.key === 'Escape') n.blur();
    });
    n.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
  }

  /* ---------- format toolbar ---------- */
  function buildFormat() {
    var f = el('div', '', '');
    f.id = 'ed-fmt'; f.setAttribute('data-editor-ui', ''); f.hidden = true;
    var fontOpts = '<option value="">Font…</option>' + FONTS.map(function (n) { return '<option>' + n + '</option>'; }).join('');
    f.innerHTML =
      '<button type="button" data-c="bold" title="Bold"><b>B</b></button>' +
      '<button type="button" data-c="italic" title="Italic"><i>I</i></button>' +
      '<button type="button" data-c="underline" title="Underline"><u>U</u></button>' +
      '<button type="button" data-c="mark" title="Yellow highlight">Highlight</button>' +
      '<label class="ed-color" title="Text color">Color <input type="color" id="ed-color" value="#17213A"></label>' +
      '<select id="ed-font" title="Font">' + fontOpts + '</select>' +
      '<select id="ed-size" title="Size"><option value="">Size…</option><option value="3">Small</option><option value="4">Normal</option><option value="5">Large</option><option value="6">X-Large</option><option value="7">Huge</option></select>' +
      '<button type="button" data-c="clear" title="Remove formatting">Clear</button>' +
      '<label class="ed-link" id="ed-linkwrap">Link <input type="text" id="ed-link" placeholder="https://… or #pricing"></label>';
    document.body.appendChild(f);
    f.addEventListener('mousedown', function (e) { if (!/INPUT|SELECT/.test(e.target.tagName)) e.preventDefault(); });
    f.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]'); if (!b) return;
      var c = b.getAttribute('data-c');
      if (c === 'bold' || c === 'italic' || c === 'underline') withSel(function () { document.execCommand(c); });
      else if (c === 'mark') withSel(toggleMark);
      else if (c === 'clear') withSel(clearFormat);
    });
    qs('#ed-color').addEventListener('input', function (e) { var v = e.target.value; withSel(function () { document.execCommand('foreColor', false, v); }); });
    qs('#ed-font').addEventListener('change', function (e) {
      var name = e.target.value; if (!name) return;
      ensureFont(name);
      withSel(function () { document.execCommand('fontName', false, name); });
      e.target.value = '';
    });
    qs('#ed-size').addEventListener('change', function (e) {
      var v = e.target.value; if (!v) return;
      withSel(function () { document.execCommand('fontSize', false, v); });
      e.target.value = '';
    });
    var link = qs('#ed-link');
    link.addEventListener('input', function () {
      if (!currentEl || !currentEl._href) return;
      currentEl._href.obj[currentEl._href.key] = link.value;
      if (link.value) currentEl.setAttribute('href', link.value); else currentEl.removeAttribute('href');
      markDirty();
    });
    link.addEventListener('change', commit);
    link.addEventListener('blur', function () { hideTimer = setTimeout(function () { var a = document.activeElement; if (!a || !f.contains(a)) hideFormat(); }, 200); });
  }
  function showFormat(n) {
    var f = qs('#ed-fmt'); if (!f || preview) return;
    f.hidden = false;
    var wrap = qs('#ed-linkwrap'); wrap.hidden = !n._href;
    if (n._href) qs('#ed-link').value = n._href.obj[n._href.key] || '';
    var r = n.getBoundingClientRect();
    var top = r.top + window.scrollY - f.offsetHeight - 8;
    if (r.top < 110) top = r.bottom + window.scrollY + 8;
    var left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - f.offsetWidth - 8));
    f.style.top = top + 'px'; f.style.left = left + 'px';
  }
  function hideFormat() { var f = qs('#ed-fmt'); if (f) f.hidden = true; }
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (currentEl && sel.rangeCount && currentEl.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
  });
  function withSel(fn) {
    if (!currentEl) return;
    currentEl.focus();
    var sel = window.getSelection();
    if (savedRange && currentEl.contains(savedRange.commonAncestorContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
    if (sel.isCollapsed || !currentEl.contains(sel.anchorNode)) {   // nothing selected: format the whole text
      var r = document.createRange(); r.selectNodeContents(currentEl); sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand('styleWithCSS', false, true);
    fn();
    onInput({ currentTarget: currentEl });
  }
  function toggleMark() {
    var sel = window.getSelection(), node = sel.anchorNode;
    var m = node && (node.nodeType === 1 ? node : node.parentElement);
    m = m && m.closest('mark');
    if (m && currentEl.contains(m)) { while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m); m.remove(); return; }
    var d = document.createElement('div'); d.appendChild(sel.getRangeAt(0).cloneContents());
    document.execCommand('insertHTML', false, '<mark>' + d.innerHTML + '</mark>');
  }
  function clearFormat() {
    document.execCommand('removeFormat');
    qsa('mark', currentEl).forEach(function (m) { while (m.firstChild) m.parentNode.insertBefore(m.firstChild, m); m.remove(); });
    qsa('[style]', currentEl).forEach(function (n) { if (!n.closest('[data-editor-ui]')) n.removeAttribute('style'); });
  }
  function ensureFont(name) {
    var site = S.content.site || (S.content.site = {});
    site.extraFonts = site.extraFonts || [];
    if (site.extraFonts.indexOf(name) < 0) site.extraFonts.push(name);
    S.applyTheme(S.content.theme, S.content.site);
  }

  /* ---------- attach editing controls after every render ---------- */
  function attach() {
    qsa('.ed-text').forEach(function (n) {
      if (!n._m) return;
      bindText(n);
      n.contentEditable = preview ? 'false' : 'true';
    });
    qsa('.ed-img').forEach(function (n) {
      if (n._edBound) return;
      n._edBound = true;
      n.addEventListener('click', function (e) {
        if (preview) return;
        e.preventDefault(); e.stopPropagation();
        var loc = n._img; if (!loc) return;
        pickFiles(false).then(function (files) {
          if (!files.length) return;
          return upload(files[0]).then(function (p) { if (p) { setImage(loc, p); rerender(); } });
        });
      });
    });
    var brand = qs('.brand');
    if (brand && !brand._edBound) {
      brand._edBound = true;
      brand.addEventListener('click', function (e) {
        if (preview) return;
        e.preventDefault();
        pickFiles(false).then(function (files) {
          if (!files.length) return;
          return upload(files[0]).then(function (p) { if (p) { (S.content.site = S.content.site || {}).logo = p; rerender(); renderSettings(); } });
        });
      });
    }
    qsa('[data-num]').forEach(function (n) {
      if (!n._m || n._edBound) return;
      n._edBound = true;
      n.addEventListener('change', function () {
        var v = parseFloat(n.value);
        n._m.obj[n._m.key] = isNaN(v) ? '' : v;
        if (n.getAttribute('data-live') === 'builder') { S.updateBuilders(); commit(); } else rerender();
      });
    });
    qsa('.ed-item').forEach(addItemBar);
    qsa('.ed-list').forEach(addAddButton);
    qsa('.ed-sec').forEach(addSectionBar);
    qsa('.faq-a').forEach(function (a) { a.hidden = false; });
  }

  function addItemBar(item) {
    if (!item._item || qs(':scope > .ed-item-bar', item)) return;
    var isObj = item._item.arr[item._item.index] && typeof item._item.arr[item._item.index] === 'object';
    var bar = el('div', 'ed-item-bar',
      '<button data-i="left" title="Move earlier">&#9664;</button><button data-i="right" title="Move later">&#9654;</button>' +
      '<button data-i="dup" title="Duplicate">&#10064;</button>' + (isObj ? '<button data-i="hide" title="Hide / show">&#9681;</button>' : '') +
      '<button data-i="del" title="Delete">&#10005;</button>');
    bar.setAttribute('data-editor-ui', ''); bar.contentEditable = 'false';
    bar.addEventListener('mousedown', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.stopPropagation(); e.preventDefault();
      itemAction(item._item, b.getAttribute('data-i'));
    });
    item.appendChild(bar);
  }
  function uniqueIds(o) {
    if (o && typeof o === 'object' && !Array.isArray(o) && typeof o.id === 'string') o.id = o.id.replace(/-[a-z0-9]{5}$/, '') + '-' + uid();
    return o;
  }
  function itemAction(it, act) {
    var arr = it.arr, i = it.index, tmp;
    if (act === 'left' && i > 0) { tmp = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = tmp; }
    else if (act === 'right' && i < arr.length - 1) { tmp = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = tmp; }
    else if (act === 'dup') arr.splice(i + 1, 0, uniqueIds(clone(arr[i])));
    else if (act === 'hide') { if (arr[i].hidden) delete arr[i].hidden; else arr[i].hidden = true; }
    else if (act === 'del') { arr.splice(i, 1); }
    else return;
    rerender();
  }
  function addAddButton(list) {
    if (list._addBtn || !list._list) return;
    var label = list.getAttribute('data-add-label') || 'item';
    var isImages = !!list._list.tpl.content.querySelector('[data-img="."]');
    var b = el('button', 'ed-add', isImages ? '+ Add ' + label + 's' : '+ Add ' + label);
    b.type = 'button'; b.setAttribute('data-editor-ui', '');
    b.addEventListener('click', function () {
      var tpl = list._list.tpl, arr = list._list.arr;
      var def = null;
      try { def = JSON.parse(tpl.getAttribute('data-default') || 'null'); } catch (e) { def = null; }
      if (def === null) def = arr.length ? clone(arr[arr.length - 1]) : '';
      if (isImages) {
        pickFiles(true).then(function (files) {
          if (!files.length) return;
          return files.reduce(function (p, f) {
            return p.then(function () { return upload(f).then(function (path) { if (path) { var n = clone(def); n.image = path; n.alt = n.alt || ''; arr.push(n); } }); });
          }, Promise.resolve()).then(rerender);
        });
        return;
      }
      arr.push(uniqueIds(clone(def)));
      rerender();
    });
    list.after(b);
    list._addBtn = b;
  }

  function addSectionBar(sec) {
    if (!sec._sec || qs(':scope > .ed-sec-bar', sec)) return;
    var s = sec._sec.arr[sec._sec.index];
    var bar = el('div', 'ed-sec-bar',
      '<span class="ed-sec-name"></span>' +
      '<button data-s="up" title="Move section up">&uarr;</button><button data-s="down" title="Move section down">&darr;</button>' +
      '<button data-s="hide" title="Show / hide section">' + (s.enabled === false ? 'Show' : 'Hide') + '</button>' +
      '<button data-s="dup" title="Duplicate section">Copy</button><button data-s="add" title="Add a section below">+ Below</button>' +
      '<button data-s="del" title="Delete section">Delete</button>');
    qs('.ed-sec-name', bar).textContent = (s.name || s.type) + (s.enabled === false ? ' (hidden)' : '');
    bar.setAttribute('data-editor-ui', ''); bar.contentEditable = 'false';
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      sectionAction(sec._sec, b.getAttribute('data-s'), b);
    });
    sec.insertBefore(bar, sec.firstChild);
  }
  function sectionAction(it, act, btn) {
    var arr = it.arr, i = it.index, t;
    if (act === 'up' && i > 0) { t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; }
    else if (act === 'down' && i < arr.length - 1) { t = arr[i + 1]; arr[i + 1] = arr[i]; arr[i] = t; }
    else if (act === 'hide') arr[i].enabled = arr[i].enabled === false;
    else if (act === 'dup') { var c = clone(arr[i]); c.name = (c.name || c.type) + ' copy'; delete c.id; arr.splice(i + 1, 0, c); }
    else if (act === 'del') { if (!window.confirm('Delete the section "' + (arr[i].name || arr[i].type) + '"?')) return; arr.splice(i, 1); }
    else if (act === 'add') { openSectionMenu(btn, i + 1); return; }
    else return;
    rerender();
  }
  function openSectionMenu(anchor, index) {
    closeMenu();
    var m = el('div', 'ed-menu'); m.id = 'ed-menu'; m.setAttribute('data-editor-ui', '');
    var h = el('div', 'ed-menu-title', 'Add a section'); m.appendChild(h);
    Object.keys(TYPES).forEach(function (k) {
      var b = el('button', '', ''); b.type = 'button'; b.textContent = TYPES[k].label;
      b.addEventListener('click', function () {
        closeMenu();
        var arr = S.content.sections;
        arr.splice(Math.min(index, arr.length), 0, TYPES[k].make());
        rerender();
        var added = qsa('.ed-sec')[Math.min(index, arr.length - 1)];
        if (added) added.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.top = Math.max(60, Math.min(r.bottom + window.scrollY + 6, window.scrollY + window.innerHeight - m.offsetHeight - 10)) + 'px';
    m.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - m.offsetWidth - 8)) + 'px';
    setTimeout(function () { document.addEventListener('click', closeMenu, { once: true }); }, 0);
  }
  function closeMenu() { var m = qs('#ed-menu'); if (m) m.remove(); }

  /* ---------- top bar ---------- */
  function buildBar() {
    var bar = el('div', '', '');
    bar.id = 'ed-bar'; bar.setAttribute('data-editor-ui', '');
    bar.innerHTML =
      '<strong class="ed-brand">Editing</strong>' +
      '<button type="button" data-a="undo">Undo</button><button type="button" data-a="redo">Redo</button>' +
      '<button type="button" data-a="addsec">+ Add section</button>' +
      '<button type="button" data-a="settings">Settings</button>' +
      '<label class="ed-prev"><input type="checkbox" id="ed-preview"> Preview</label>' +
      '<span id="ed-status">Starting…</span>' +
      '<button type="button" class="ed-save" data-a="save">Save</button>';
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'undo') undo(); else if (a === 'redo') redo(); else if (a === 'save') save();
      else if (a === 'addsec') { e.stopPropagation(); openSectionMenu(b, S.content.sections.length); }
      else if (a === 'settings') document.body.classList.toggle('ed-settings-open');
    });
    qs('#ed-preview').addEventListener('change', function (e) { setPreview(e.target.checked); });
  }
  function setPreview(on) {
    preview = on;
    document.body.classList.toggle('ed-preview', on);
    qsa('.ed-text').forEach(function (n) { n.contentEditable = on ? 'false' : 'true'; });
    if (on) { hideFormat(); document.body.classList.remove('ed-settings-open'); }
  }

  /* ---------- settings drawer ---------- */
  function get(o, p) { return p.split('.').reduce(function (c, k) { return c == null ? undefined : c[k]; }, o); }
  function setp(o, p, v) {
    var ks = p.split('.'), c = o;
    for (var i = 0; i < ks.length - 1; i++) { if (c[ks[i]] == null || typeof c[ks[i]] !== 'object') c[ks[i]] = {}; c = c[ks[i]]; }
    c[ks[ks.length - 1]] = v;
  }
  // field({label, type, obj(), path, live(), options, min, max, step, hint})
  function field(o) {
    var wrap = el('label', 'ed-field'), lab = el('span', 'ed-field-label'); lab.textContent = o.label; wrap.appendChild(lab);
    var input, cur = get(o.obj(), o.path);
    if (o.type === 'select') {
      input = el('select'); o.options.forEach(function (op) { var x = el('option'); x.value = op[0]; x.textContent = op[1]; input.appendChild(x); });
      input.value = o.read ? o.read(cur) : String(cur == null ? '' : cur);
    } else if (o.type === 'textarea') { input = el('textarea'); input.rows = 3; input.value = cur == null ? '' : cur; }
    else if (o.type === 'checkbox') { input = el('input'); input.type = 'checkbox'; input.checked = !!cur; wrap.classList.add('inline'); }
    else {
      input = el('input'); input.type = o.type || 'text'; input.value = cur == null ? '' : cur;
      if (o.min != null) input.min = o.min; if (o.max != null) input.max = o.max; if (o.step != null) input.step = o.step;
    }
    wrap.appendChild(input);
    function write() {
      var v = o.type === 'checkbox' ? input.checked : (o.type === 'number' || o.type === 'range') ? (input.value === '' ? '' : parseFloat(input.value)) : input.value;
      setp(o.obj(), o.path, o.write ? o.write(v) : v);
      if (o.live) o.live();
      markDirty();
    }
    input.addEventListener(o.type === 'color' || o.type === 'range' ? 'input' : 'change', write);
    input.addEventListener('change', commit);
    if (o.hint) { var h = el('span', 'ed-hint'); h.textContent = o.hint; wrap.appendChild(h); }
    return wrap;
  }
  function group(title, open) {
    var d = el('details', 'ed-group'); if (open) d.open = true;
    var s = el('summary'); s.textContent = title; d.appendChild(s);
    return d;
  }
  function imgField(label, obj, path, after) {
    var wrap = el('div', 'ed-field'); var lab = el('span', 'ed-field-label'); lab.textContent = label; wrap.appendChild(lab);
    var row = el('div', 'ed-row'), name = el('span', 'ed-hint'); name.textContent = get(obj(), path) || '(none)';
    var up = el('button', '', 'Upload…'); up.type = 'button';
    var rm = el('button', '', 'Remove'); rm.type = 'button';
    up.addEventListener('click', function () { pickFiles(false).then(function (fs) { if (!fs.length) return; return upload(fs[0]).then(function (p) { if (p) { setp(obj(), path, p); commit(); after && after(); renderSettings(); } }); }); });
    rm.addEventListener('click', function () { setp(obj(), path, ''); commit(); after && after(); renderSettings(); });
    row.appendChild(up); row.appendChild(rm); wrap.appendChild(row); wrap.appendChild(name);
    return wrap;
  }
  function fontName(v) { var m = /^\s*['"]?([^'",]+)/.exec(v || ''); return m ? m[1].trim() : ''; }

  function renderSettings() {
    var d = qs('#ed-drawer'); if (!d) return;
    d.textContent = '';
    var c = S.content;
    c.theme = c.theme || {}; c.theme.colors = c.theme.colors || {}; c.theme.fonts = c.theme.fonts || {}; c.theme.shape = c.theme.shape || {};
    var theme = function () { return S.content.theme; };
    var applyT = function () { S.applyTheme(S.content.theme, S.content.site); };
    var head = el('div', 'ed-drawer-head'); head.innerHTML = '<strong>Settings</strong>'; var x = el('button', '', 'Close'); x.type = 'button';
    x.addEventListener('click', function () { document.body.classList.remove('ed-settings-open'); }); head.appendChild(x); d.appendChild(head);

    // colors
    var g = group('Colors', true);
    [['accent', 'Main blue (buttons)'], ['accentText', 'Blue for small text'], ['accentSoft', 'Soft blue (secondary)'], ['navy', 'Navy (outlines, dark sections)'], ['pop', 'Pop yellow (stickers)'],
     ['background', 'Page background'], ['surface', 'White sections and cards'], ['text', 'Text color'], ['mutedText', 'Soft text color']].forEach(function (p) {
      g.appendChild(field({ label: p[1], type: 'color', obj: theme, path: 'colors.' + p[0], live: applyT }));
    });
    var reset = el('button', 'ed-wide', 'Reset to Electric Studio'); reset.type = 'button';
    reset.addEventListener('click', function () { Object.keys(ELECTRIC).forEach(function (k) { S.content.theme.colors[k] = ELECTRIC[k]; }); applyT(); commit(); renderSettings(); });
    g.appendChild(reset); d.appendChild(g);

    // fonts
    g = group('Fonts and shape');
    var fontOpts = FONTS.map(function (n) { return [n, n]; });
    var cur = fontName(c.theme.fonts.heading); if (cur && FONTS.indexOf(cur) < 0) fontOpts.unshift([cur, cur]);
    var curB = fontName(c.theme.fonts.body); var bodyOpts = FONTS.map(function (n) { return [n, n]; }); if (curB && FONTS.indexOf(curB) < 0) bodyOpts.unshift([curB, curB]);
    g.appendChild(field({ label: 'Heading font', type: 'select', options: fontOpts, obj: theme, path: 'fonts.heading', read: fontName, write: function (v) { ensureFont(v); return "'" + v + "', system-ui, sans-serif"; }, live: applyT }));
    g.appendChild(field({ label: 'Body font', type: 'select', options: bodyOpts, obj: theme, path: 'fonts.body', read: fontName, write: function (v) { ensureFont(v); return "'" + v + "', system-ui, sans-serif"; }, live: applyT }));
    g.appendChild(field({ label: 'Text size', type: 'select', options: [['15px', 'Small'], ['16px', 'Normal'], ['17px', 'Large'], ['18px', 'Extra large']], obj: theme, path: 'fonts.baseSize', live: applyT }));
    g.appendChild(field({ label: 'Heading weight', type: 'select', options: [['500', 'Light'], ['600', 'Medium'], ['700', 'Bold']], obj: theme, path: 'fonts.headingWeight', live: applyT }));
    g.appendChild(field({ label: 'Button shape', type: 'select', options: [['999px', 'Pill'], ['14px', 'Rounded'], ['4px', 'Square']], obj: theme, path: 'shape.buttonRadius', live: applyT }));
    g.appendChild(field({ label: 'Card corner roundness', type: 'select', options: [['4px', 'Sharp'], ['12px', 'Soft'], ['20px', 'Round'], ['32px', 'Very round']], obj: theme, path: 'shape.cardRadius', live: applyT, write: function (v) { S.content.theme.shape.tileRadius = v; return v; } }));
    d.appendChild(g);

    // site
    g = group('Website');
    var siteO = function () { S.content.site = S.content.site || {}; return S.content.site; };
    g.appendChild(field({ label: 'Browser tab title', obj: siteO, path: 'title', live: function () { S.applySite(S.content.site); } }));
    g.appendChild(field({ label: 'Search description', type: 'textarea', obj: siteO, path: 'description', live: function () { S.applySite(S.content.site); } }));
    g.appendChild(imgField('Logo (shown top-left)', siteO, 'logo', function () { S.render(); }));
    d.appendChild(g);

    // calculator
    var b = S.builder();
    if (b) {
      g = group('Prices and discounts');
      var bo = function () { return S.builder(); }, liveB = function () { S.updateBuilders(); };
      g.appendChild(field({ label: 'Currency symbol', obj: bo, path: 'currencySymbol', live: liveB }));
      g.appendChild(field({ label: 'Currency code (for PayPal)', obj: bo, path: 'currency', live: liveB, hint: 'Use USD for US customers.' }));
      g.appendChild(field({ label: 'Maximum discount (%)', type: 'number', min: 0, max: 100, step: 1, obj: bo, path: 'discountCap', live: liveB }));
      g.appendChild(field({ label: 'Momentum (0 = flat)', type: 'number', min: 0, max: 1, step: 0.01, obj: bo, path: 'momentum', live: liveB, hint: 'Higher = discount grows faster as customers add more.' }));
      g.appendChild(field({ label: 'First item adds no discount', type: 'checkbox', obj: bo, path: 'discountStartsAfterFirstItem', live: liveB }));
      var h = el('p', 'ed-hint', 'Prices and per-service discount % are edited directly on the page, inside each service row.'); g.appendChild(h);
      var mt = el('div', 'ed-field'); var ml = el('span', 'ed-field-label'); ml.textContent = 'Cheers at each discount level'; mt.appendChild(ml);
      (b.milestones = b.milestones || []).forEach(function (m, i) {
        var row = el('div', 'ed-row');
        var p = el('input'); p.type = 'number'; p.value = m.pct; p.min = 0; p.max = 100; p.style.width = '64px';
        var t = el('input'); t.type = 'text'; t.value = m.text || '';
        var rm = el('button', '', '✕'); rm.type = 'button';
        p.addEventListener('change', function () { m.pct = parseFloat(p.value) || 0; liveB(); commit(); });
        t.addEventListener('change', function () { m.text = t.value; liveB(); commit(); });
        rm.addEventListener('click', function () { b.milestones.splice(i, 1); liveB(); commit(); renderSettings(); });
        row.appendChild(p); row.appendChild(t); row.appendChild(rm); mt.appendChild(row);
      });
      var am = el('button', '', '+ Add a cheer'); am.type = 'button';
      am.addEventListener('click', function () { b.milestones.push({ pct: 10, text: 'Nice!' }); commit(); renderSettings(); });
      mt.appendChild(am); g.appendChild(mt);
      d.appendChild(g);
    }

    // payment
    g = group('Checkout and payment');
    var co = function () { S.content.checkout = S.content.checkout || {}; return S.content.checkout; };
    g.appendChild(field({ label: 'Checkout page title', obj: co, path: 'title' }));
    g.appendChild(field({ label: 'Checkout page intro', obj: co, path: 'subtitle' }));
    g.appendChild(field({ label: 'Order inbox: form address', obj: co, path: 'orderForm.endpoint', hint: 'Where each order is emailed to you. Formspree: https://formspree.io/f/xxxx  |  Web3Forms: https://api.web3forms.com/submit' }));
    g.appendChild(field({ label: 'Order inbox: access key (Web3Forms only)', obj: co, path: 'orderForm.accessKey' }));
    g.appendChild(field({ label: 'Order email subject', obj: co, path: 'orderForm.subject', hint: '{order} becomes the order code.' }));
    g.appendChild(field({ label: 'Offer PayPal', type: 'checkbox', obj: co, path: 'paypal.enabled' }));
    g.appendChild(field({ label: 'PayPal title', obj: co, path: 'paypal.title' }));
    g.appendChild(field({ label: 'PayPal button text', obj: co, path: 'paypal.buttonLabel' }));
    g.appendChild(field({ label: 'PayPal link', obj: co, path: 'paypal.linkTemplate', hint: 'Use https://www.paypal.me/YOURNAME/{amount}{currency}  ({amount} and {currency} fill in automatically).' }));
    g.appendChild(field({ label: 'Offer bank transfer', type: 'checkbox', obj: co, path: 'bank.enabled' }));
    g.appendChild(field({ label: 'Bank name', obj: co, path: 'bank.bankName' }));
    g.appendChild(field({ label: 'Account holder', obj: co, path: 'bank.accountName' }));
    g.appendChild(field({ label: 'Account number', obj: co, path: 'bank.accountNumber' }));
    g.appendChild(field({ label: 'Routing number (optional)', obj: co, path: 'bank.routingNumber', hint: 'US bank routing number for ACH / wire. Leave empty to hide it.' }));
    g.appendChild(imgField('Bank QR code image', co, 'bank.qrImage'));
    g.appendChild(field({ label: 'Bank button text', obj: co, path: 'bank.confirmLabel' }));
    g.appendChild(field({ label: 'Thank-you message (bank)', type: 'textarea', obj: co, path: 'thanks.text', hint: '{order}, {email} and {name} are filled in.' }));
    g.appendChild(field({ label: 'After-payment message', type: 'textarea', obj: co, path: 'after.text' }));
    d.appendChild(g);

    var tip = el('p', 'ed-hint ed-tip', 'Tip: click any text on the page to edit it. Select words to make them bold, change color or font. Hover a block to move, copy or delete it. Press Save when you are done.');
    d.appendChild(tip);
  }

  /* ---------- go ---------- */
  E.init = function () {
    var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'css/editor.css';
    document.head.appendChild(css);
    document.body.classList.add('editing');
    buildBar(); buildFormat();
    var drawer = el('div', '', ''); drawer.id = 'ed-drawer'; drawer.setAttribute('data-editor-ui', ''); document.body.appendChild(drawer);
    renderSettings();
    history = [snap()]; hi = 0; dirty = false;
    S.afterRender.push(attach);
    attach();
    ping();
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.target.closest('#ed-bar')) return;
      if (preview && (a.getAttribute('href') || '').charAt(0) === '#') return;
      e.preventDefault();
    }, true);
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
  };
})();
