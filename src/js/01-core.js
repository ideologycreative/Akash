/* ============================================================
   Ideology — core
   One id generator for the whole app. Nassa's bug was every
   call site rolling its own `'a_'+Date.now()`, which collides
   inside a single millisecond. This is the only one.
   ============================================================ */

window.IDE = window.IDE || {};

(function (A) {
  'use strict';

  var counter = 0;

  A.uid = function (prefix) {
    counter = (counter + 1) % 4096;
    return (prefix || 'x') + '_' +
      Date.now().toString(36) + '_' +
      counter.toString(36) + Math.random().toString(36).slice(2, 7);
  };

  /* ── DOM ──────────────────────────────────────────────── */

  A.el = function (tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'style') n.style.cssText = v;
        else if (k === 'dataset') { for (var d in v) n.dataset[d] = v[d]; }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };

  A.$ = function (sel, root) { return (root || document).querySelector(sel); };
  A.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  A.clear = function (n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; };
  A.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ── Icons (inline, no network) ───────────────────────── */

  var P = {
    play:    '<polygon points="5 3 19 12 5 21 5 3"/>',
    image:   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    layers:  '<rect x="2" y="6" width="14" height="14" rx="2"/><path d="M22 6h-2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2"/>',
    type:    '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    left:    '<polyline points="15 18 9 12 15 6"/>',
    right:   '<polyline points="9 18 15 12 9 6"/>',
    check:   '<polyline points="20 6 9 17 4 12"/>',
    pencil:  '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash:   '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
    eye:     '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    link:    '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    cal:     '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    users:   '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/>',
    story:   '<rect x="7" y="2" width="10" height="20" rx="2.5"/>',
    grid:    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    down:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    up:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    moon:    '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    info:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    send:    '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    x:       '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
    filter:  '<polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3"/>'
  };

  A.icon = function (name, size) {
    var s = size || 14;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  };
  A.iconEl = function (name, size) {
    var span = document.createElement('span');
    span.style.cssText = 'display:inline-flex;align-items:center;';
    span.innerHTML = A.icon(name, size);
    return span;
  };

  /* ── Toasts ───────────────────────────────────────────── */

  A.toast = function (msg, opts) {
    opts = opts || {};
    var host = A.$('#toasts');
    if (!host) return;
    var t = A.el('div', { class: 'toast' }, [msg]);
    if (opts.undo) {
      t.appendChild(A.el('button', {
        type: 'button', text: 'Annulla',
        onclick: function () { t.remove(); opts.undo(); }
      }));
    }
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity 180ms, transform 180ms';
      t.style.opacity = '0'; t.style.transform = 'translateY(6px)';
      setTimeout(function () { t.remove(); }, 200);
    }, opts.undo ? 6000 : 2600);
  };

  /* ── Modal ────────────────────────────────────────────── */

  var modalCloser = null;

  A.modal = function (cfg) {
    var bg = A.$('#modal-bg');
    A.clear(bg);
    var box = A.el('div', { class: 'modal' + (cfg.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
    var hd = A.el('div', { class: 'modal-hd' }, [
      A.el('h3', { text: cfg.title || '' }),
      A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Chiudi', html: A.icon('x', 14), onclick: A.closeModal })
    ]);
    var bd = A.el('div', { class: 'modal-bd' });
    (cfg.body || []).forEach(function (n) { if (n) bd.appendChild(n); });
    box.appendChild(hd); box.appendChild(bd);
    if (cfg.actions && cfg.actions.length) {
      var ft = A.el('div', { class: 'modal-ft' });
      cfg.actions.forEach(function (a) {
        ft.appendChild(A.el('button', {
          class: 'btn ' + (a.kind || ''), text: a.label,
          onclick: function () {
            if (a.run) { if (a.run() === false) return; }
            if (a.keepOpen !== true) A.closeModal();
          }
        }));
      });
      box.appendChild(ft);
    }
    bg.appendChild(box);
    bg.classList.add('on');
    bg.onclick = function (e) { if (e.target === bg) A.closeModal(); };
    A.closeCaptionPeek();
    modalCloser = cfg.onClose || null;
    setTimeout(function () {
      var f = box.querySelector('input,textarea,select,button.primary');
      if (f) f.focus();
    }, 40);
  };

  A.closeModal = function () {
    var bg = A.$('#modal-bg');
    if (!bg) return;
    bg.classList.remove('on');
    A.clear(bg);
    if (modalCloser) { var c = modalCloser; modalCloser = null; c(); }
  };

  /* A dialog that redraws itself after every tick must not throw the reader
     back to the top. Rebuild through this: it restores the scroll offset and
     puts the keyboard focus back on the control that was just used, matched
     by its data-focus key rather than by position. */
  A.rebuild = function (build) {
    var box = A.$('#modal-bg .modal');
    var top = box ? box.scrollTop : 0;
    var act = document.activeElement;
    var key = (act && act.getAttribute) ? act.getAttribute('data-focus') : null;

    build();

    var fresh = A.$('#modal-bg .modal');
    if (!fresh) return;
    fresh.scrollTop = top;
    if (!key) return;
    var again = fresh.querySelector('[data-focus="' + key + '"]');
    if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
  };

  /* A panel hung off a button: it closes when you click away, press Escape
     or scroll the page under it, and it never traps focus the way a modal
     does — it is a menu, not a decision. */
  var popHost = null, popOff = null;

  A.closePopover = function () {
    if (!popHost) return;
    popHost.remove();
    popHost = null;
    if (popOff) { popOff(); popOff = null; }
  };

  A.popover = function (anchor, build, opts) {
    opts = opts || {};
    var wasOpen = popHost && popHost.dataset.owner === (anchor.dataset.popId || '');
    A.closePopover();
    if (wasOpen) return;

    if (!anchor.dataset.popId) anchor.dataset.popId = A.uid('pop');
    popHost = A.el('div', { class: 'popover', dataset: { owner: anchor.dataset.popId } });
    build(popHost, A.closePopover);
    document.body.appendChild(popHost);

    function place() {
      if (!popHost) return;
      var r = anchor.getBoundingClientRect();
      var w = popHost.offsetWidth, h = popHost.offsetHeight;
      var left = opts.align === 'left' ? r.left : r.right - w;
      left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
      var top = r.bottom + 6;
      if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 6);
      popHost.style.left = left + 'px';
      popHost.style.top = top + 'px';
    }
    place();

    function away(e) { if (popHost && !popHost.contains(e.target) && !anchor.contains(e.target)) A.closePopover(); }
    function esc(e) { if (e.key === 'Escape') A.closePopover(); }
    setTimeout(function () { document.addEventListener('mousedown', away); }, 0);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', A.closePopover, true);
    popOff = function () {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', A.closePopover, true);
    };
    return popHost;
  };

  /* A clamped caption reads in full on hover and closes when the
     pointer leaves. No click, no dialog, nothing that can be left
     open — and nothing at all on a touch screen, where there is no
     hover and tapping the content opens it properly instead.

     `trigger` is what the pointer enters, `clamp` is the cut-off
     text: they are the same element in the studio grid, and
     different on the client card, where hovering anywhere on the
     content shows the caption that belongs to it. */
  var capPop = null;

  A.closeCaptionPeek = function () {
    if (!capPop) return;
    capPop.remove();
    capPop = null;
  };

  A.captionPeek = function (opts) {
    var trigger = opts.trigger, clamp = opts.clamp, text = opts.text || '';
    if (!trigger || !clamp || !text) return;

    trigger.addEventListener('mouseenter', function () {
      A.closeCaptionPeek();
      /* nothing is hidden, so there is nothing to reveal */
      if (clamp.scrollHeight <= clamp.clientHeight + 2) return;

      var r = clamp.getBoundingClientRect();
      capPop = A.el('div', { class: 'cap-pop', text: text });
      document.body.appendChild(capPop);

      var w = Math.max(r.width, 260);
      capPop.style.width = w + 'px';
      capPop.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px';

      var h = capPop.offsetHeight;
      var top = r.top - 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      capPop.style.top = top + 'px';
    });
    trigger.addEventListener('mouseleave', A.closeCaptionPeek);
  };

  window.addEventListener('scroll', function () { A.closeCaptionPeek(); }, true);

  A.confirm = function (cfg) {
    A.modal({
      title: cfg.title,
      body: [A.el('p', { style: 'margin:0;font-size:13px;line-height:1.6;color:var(--ink-2);', text: cfg.body || '' })],
      actions: [
        { label: 'Annulla' },
        { label: cfg.ok || 'Conferma', kind: cfg.danger ? 'danger' : 'primary', run: cfg.run }
      ]
    });
  };

  /* ── Misc ─────────────────────────────────────────────── */

  A.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  A.initials = function (s) {
    return String(s || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0] || ''; }).join('').toUpperCase() || '?';
  };

  A.fmtNum = function (n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  };

  A.copy = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return Promise.resolve(ok);
  };

  /* Save a generated file. Uses the claude.ai downloads capability when the
     page runs as a published artifact, and a plain anchor otherwise, so the
     same build works hosted and offline. */
  A.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    function anchor() {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (d) {
        if (!d) return anchor();
        d.save({ filename: filename, data: blob }).catch(anchor);
      }).catch(anchor);
    } else {
      anchor();
    }
  };
})(window.IDE);
