/* ============================================================
   Ideology — the post renderer

   One function decides how a post looks. The feed, the studio
   preview and the client link all call it. There is deliberately
   no second implementation: in the tool this replaces, the same
   card was drawn three times in two files and the three copies
   had already drifted apart (five approval states in one, two
   in another; carousels playable in one, static in the next).
   ============================================================ */

(function (A) {
  'use strict';

  A.ratioFor = function (accountId) {
    var ctx = A.accountCtx(accountId);
    return A.formatOfAccount(ctx ? ctx.account : null).ratio;
  };

  function kindBadge(post) {
    if (post.kind === 'reel') return { icon: 'play', label: 'Reel' };
    if (post.kind === 'carosello') return { icon: 'layers', label: (post.slides || []).length + ' slide' };
    if (post.kind === 'editoriale') return { icon: 'type', label: 'Testo' };
    return { icon: 'image', label: 'Post' };
  }

  /* The visual inside a cell: uploaded media, a generated editorial card,
     or an explicit empty slot. Never a broken <img>. */
  A.mediaFill = function (post) {
    if (post.kind === 'editoriale') {
      var client = A.clientOfAccount(post.accountId);
      var pal = (client && client.palette) || { bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C' };
      var ed = post.editorial || {};
      var box = A.el('div', { class: 'edcard', style: 'background:' + pal.bg + ';color:' + pal.ink + ';' });
      if (ed.eyebrow) box.appendChild(A.el('div', { class: 'eye', text: ed.eyebrow, style: 'color:' + pal.accent }));
      box.appendChild(A.el('div', { class: 'tit', text: ed.title || 'Titolo della card' }));
      box.appendChild(A.el('div', { class: 'rule' }));
      box.appendChild(A.el('div', { class: 'sub', text: ed.sub || '' }));
      return box;
    }
    var url = post.coverUrl || post.mediaUrl ||
      (post.slides && post.slides[0] ? post.slides[0].url : '');
    /* coverUrl wins for every kind: a reel's thumbnail is what the grid,
       the preview and the post view all have to show. */
    if (url) {
      var wrap = A.el('div', { style: 'width:100%;height:100%;' });
      var img = A.el('img', { src: url, alt: '', loading: 'lazy' });
      img.addEventListener('error', function () {
        var host = '';
        try { host = new URL(url, location.href).hostname; } catch (e) { host = ''; }
        A.clear(wrap);
        wrap.appendChild(A.el('div', { class: 'ph' }, [
          (function () { var s = A.el('span'); s.innerHTML = A.icon('link', 18); return s; })(),
          A.el('span', { text: 'Immagine non raggiungibile' }),
          host ? A.el('span', { style: 'opacity:.65;', text: host }) : null
        ]));
      });
      wrap.appendChild(img);
      return wrap;
    }
    return A.el('div', { class: 'ph' }, [
      (function () { var s = A.el('span'); s.innerHTML = A.icon('image', 20); return s; })(),
      'Slot vuoto'
    ]);
  };

  /* A media cell with its overlays. `opts.chrome` picks what the viewer
     is allowed to see: the studio sees state, the client does not see
     internal state names, only an approval ribbon. */
  A.cellNode = function (post, opts) {
    opts = opts || {};
    var cell = A.el('div', {
      class: 'cell',
      style: '--ratio:' + (opts.ratio || A.ratioFor(post.accountId)) + ';',
      role: 'button', tabindex: '0',
      'aria-label': 'Apri contenuto'
    });
    cell.appendChild(A.mediaFill(post));

    /* Four corners, always the same four questions:
       top left  — is it paid or organic
       top right — what kind of content it is
       bottom l. — where it is in the approval flow
       bottom r. — which category it belongs to            */
    if (opts.corners !== false) {
      var nat = A.natureOf(post);
      cell.appendChild(A.el('span', {
        class: 'c-tl ' + nat.cls,
        title: nat.key === 'both' ? 'Contenuto a pagamento, in collaborazione con ' + post.partner : nat.label,
        text: nat.label
      }));

      var kb = kindBadge(post);
      cell.appendChild(A.el('span', {
        class: 'c-tr', html: A.icon(kb.icon, 9) + '<span>' + A.esc(kb.label) + '</span>'
      }));

      if (opts.showState) {
        var st = A.statusOf(post.status);
        cell.appendChild(A.el('button', {
          type: 'button', class: 'c-bl',
          html: '<span class="dot" style="background:' + st.c + '"></span>' + A.esc(st.short) +
                (post.revisions > 0 ? '<span class="rev' + (post.revisions >= 3 ? ' hot' : '') + '">R' + post.revisions + '</span>' : ''),
          title: post.revisions ? post.revisions + ' revisioni richieste · cambia stato' : 'Cambia stato',
          onclick: function (e) { e.stopPropagation(); if (opts.onState) opts.onState(post); }
        }));
      }

      var cat = A.get(post.categoryId);
      if (cat) {
        cell.appendChild(A.el('span', {
          class: 'c-br', title: cat.description || cat.name,
          html: '<span class="dot" style="background:' + cat.color + '"></span>' + A.esc(cat.name)
        }));
      }
    }
    if (opts.onOpen) {
      cell.addEventListener('click', function () { opts.onOpen(post); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onOpen(post); }
      });
    }
    return cell;
  };

  /* The grid shows two lines of caption. Hovering reads the whole thing in
     place and moving away puts it back: no click, no modal, no state. */
  function captionNode(text) {
    var node = A.el('div', { class: 'card-caption', text: text });
    A.captionPeek({ trigger: node, clamp: node, text: text });
    return node;
  }

  /* Full card for the editing grid. */
  A.postCard = function (post, opts) {
    opts = opts || {};
    var client = A.clientOfAccount(post.accountId);
    var card = A.el('div', {
      class: 'card' + (opts.selected ? ' sel' : ''),
      dataset: { st: post.status, id: post.id }
    });

    card.appendChild(A.cellNode(post, {
      showDate: A.ui.show.date,
      showState: true,
      showRevisions: true,
      draggable: true,
      onOpen: opts.onOpen,
      onState: opts.onState
    }));

    var body = A.el('div', { class: 'card-body' });

    if (A.ui.show.date) {
      var when = post.date
        ? A.dayLabel(post.date) + (post.time ? ' · ' + post.time : '')
        : 'Senza data';
      body.appendChild(A.el('div', {
        class: 'card-when' + (post.date ? '' : ' none'),
        html: A.icon('cal', 11) + '<span>' + A.esc(when) + '</span>'
      }));
    }

    if (A.ui.show.caption && post.caption) {
      body.appendChild(captionNode(post.caption));
    }

    if (post.accountId !== A.ui.accountId) {
      var home = A.accountCtx(post.accountId);
      body.appendChild(A.el('div', {
        class: 'card-from',
        html: A.icon('layers', 11) + '<span>Pubblicato anche da ' + A.esc(home ? home.account.platform : 'un altro account') + '</span>'
      }));
    } else if ((post.alsoOn || []).length) {
      var names = post.alsoOn.map(function (id) {
        var c = A.accountCtx(id);
        return c ? c.account.platform : '';
      }).filter(Boolean);
      body.appendChild(A.el('div', {
        class: 'card-from',
        html: A.icon('layers', 11) + '<span>Anche su ' + A.esc(names.join(', ')) + '</span>'
      }));
    }

    if (post.clientNote) {
      body.appendChild(A.el('div', {
        class: 'pv-note', style: 'margin-top:2px;',
        html: '<b>' + A.esc(client ? client.name : 'Cliente') + '</b>' + A.esc(post.clientNote)
      }));
    }

    if (body.childNodes.length) card.appendChild(body);

    if (opts.onSelect) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.cell') || e.target.closest('button')) return;
        opts.onSelect(post);
      });
    }

    return card;
  };

  /* ── Post view ────────────────────────────────────────
     How the content reads when someone actually looks at it:
     the media on the left, everything written about it on the
     right. Same component wherever a post is opened.
  ──────────────────────────────────────────────────────── */

  var PV = { list: [], i: 0, slide: 0 };

  A.openPostView = function (list, startId) {
    PV.list = list.slice();
    PV.i = Math.max(0, PV.list.findIndex(function (p) { return p.id === startId; }));
    PV.slide = 0;
    var host = A.$('#lightbox');
    host.classList.add('on', 'as-post');
    drawPV();
  };

  A.closePostView = function () {
    var host = A.$('#lightbox');
    host.classList.remove('on', 'as-post');
    A.clear(host);
    PV.list = [];
  };

  function pvNav(d) {
    if (PV.list.length < 2) return;
    PV.i = (PV.i + d + PV.list.length) % PV.list.length;
    PV.slide = 0;
    drawPV();
  }
  function pvSlide(d) {
    var p = PV.list[PV.i];
    if (!p || !p.slides || p.slides.length < 2) return;
    PV.slide = (PV.slide + d + p.slides.length) % p.slides.length;
    drawPV();
  }

  function fakeActions() {
    var row = A.el('div', { class: 'pvw-actions', 'aria-hidden': 'true' });
    ['heart', 'bubble', 'send'].forEach(function (k) {
      var paths = {
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/>',
        bubble: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l2-4a8.4 8.4 0 0 1-1-4 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.4z"/>',
        send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'
      };
      var sp = A.el('span');
      sp.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths[k] + '</svg>';
      row.appendChild(sp);
    });
    return row;
  }

  function drawPV() {
    var host = A.$('#lightbox');
    var p = PV.list[PV.i];
    A.clear(host);
    if (!p) return;

    var ctx = A.accountCtx(A.isOn(p, A.ui.accountId) ? A.ui.accountId : p.accountId) || A.accountCtx(p.accountId);
    var acc = ctx ? ctx.account : null;
    var client = ctx ? ctx.client : null;
    var fmt = A.formatOfAccount(acc);

    var shell = A.el('div', { class: 'pvw', role: 'dialog', 'aria-modal': 'true' });

    /* media */
    var media = A.el('div', { class: 'pvw-media' });
    var inner = A.el('div', { class: 'pvw-stage', style: '--ratio:' + fmt.ratio + ';' });
    var isCar = p.kind === 'carosello' && p.slides && p.slides.length > 1;
    if (isCar) {
      var sl = p.slides[PV.slide];
      if (sl && sl.url) inner.appendChild(A.el('img', { src: sl.url, alt: '' }));
      else inner.appendChild(A.el('div', { class: 'pvw-blank', text: 'Slide ' + (PV.slide + 1) + ' senza immagine' }));
    } else {
      var playable = p.kind === 'reel' && p.mediaUrl && /^(data:video|blob:|https?:\/\/.+\.(mp4|webm|mov))/i.test(p.mediaUrl);
      if (playable) {
        inner.appendChild(A.el('video', {
          src: p.mediaUrl, controls: true, playsinline: true,
          poster: p.coverUrl || '', preload: 'metadata',
          style: 'width:100%;height:100%;object-fit:contain;background:#000;'
        }));
      } else {
        var fill = A.mediaFill(p);
        if (p.kind === 'editoriale') {
          var box = A.el('div', { style: 'position:relative;width:100%;height:100%;' });
          box.appendChild(fill);
          inner.appendChild(box);
        } else inner.appendChild(fill);
        if (p.kind === 'reel') inner.appendChild(A.el('span', { class: 'pvw-play', html: A.icon('play', 22) }));
      }
    }
    if (isCar) {
      inner.appendChild(A.el('button', { class: 'pvw-arrow left', html: '‹', 'aria-label': 'Slide precedente', onclick: function () { pvSlide(-1); } }));
      inner.appendChild(A.el('button', { class: 'pvw-arrow right', html: '›', 'aria-label': 'Slide successiva', onclick: function () { pvSlide(1); } }));
      var dots = A.el('div', { class: 'pvw-dots' });
      p.slides.forEach(function (_, i) { dots.appendChild(A.el('i', { class: i === PV.slide ? 'on' : '' })); });
      inner.appendChild(dots);
    }
    media.appendChild(inner);
    media.appendChild(A.el('span', { class: 'pvw-size', text: acc ? acc.platform + ' · ' + fmt.sizeLabel + ' · ' + fmt.w + '×' + fmt.h : '' }));
    shell.appendChild(media);

    /* side */
    var side = A.el('div', { class: 'pvw-side' });

    var head = A.el('div', { class: 'pvw-head' });
    var av = A.el('span', { class: 'pvw-av' });
    if (acc && acc.avatarUrl) av.appendChild(A.el('img', { src: acc.avatarUrl, alt: '' }));
    else av.textContent = A.initials(client ? client.name : '?');
    head.appendChild(av);
    head.appendChild(A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
      A.el('span', { class: 'hn', text: acc ? acc.handle : '' }),
      A.el('span', { class: 'hs', text: (acc ? acc.platform : '') + (p.date ? ' · ' + A.dayLabel(p.date) + (p.time ? ' ' + p.time : '') : ' · senza data') })
    ]));
    head.appendChild(A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Chiudi', html: A.icon('x', 15), onclick: A.closePostView }));
    side.appendChild(head);

    var scroll = A.el('div', { class: 'pvw-scroll' });

    var chips = A.el('div', { class: 'pvw-chips' });
    var nat = A.natureOf(p);
    if (p.paid) chips.appendChild(A.el('span', { class: 'tagpill promo-paid', text: 'Sponsorizzato' }));
    if ((p.partner || '').trim()) chips.appendChild(A.el('span', { class: 'tagpill promo-partner', text: 'Con ' + p.partner }));
    var cat = A.get(p.categoryId);
    if (cat) chips.appendChild(A.el('span', { class: 'tagpill', html: '<span class="dot" style="background:' + cat.color + '"></span>' + A.esc(cat.name) }));
    chips.appendChild(A.el('span', { class: 'tagpill', text: p.kind === 'reel' ? 'Reel' : p.kind === 'carosello' ? 'Carosello · ' + p.slides.length : p.kind === 'editoriale' ? 'Card testuale' : 'Post' }));
    if (chips.childNodes.length) scroll.appendChild(chips);

    if (p.caption) {
      scroll.appendChild(A.el('div', { class: 'pvw-caption' }, [
        A.el('b', { text: acc ? acc.handle + ' ' : '' }),
        A.el('span', { text: p.caption })
      ]));
    } else {
      scroll.appendChild(A.el('div', { class: 'pvw-caption empty', text: 'Nessuna caption scritta.' }));
    }

    if ((p.alsoOn || []).length) {
      var names = p.alsoOn.map(function (id) { var c = A.accountCtx(id); return c ? c.account.platform + ' ' + c.account.handle : ''; }).filter(Boolean);
      scroll.appendChild(A.el('div', { class: 'pvw-note', html: '<b>Pubblicato anche su</b>' + A.esc(names.join(' · ')) }));
    }
    if (p.inStories) scroll.appendChild(A.el('div', { class: 'pvw-note', html: '<b>Stories</b>Questo contenuto esce anche nelle stories.' }));
    if (p.clientNote) scroll.appendChild(A.el('div', { class: 'pv-note', html: '<b>' + A.esc(client ? client.name : 'Cliente') + '</b>' + A.esc(p.clientNote) }));
    if (p.internalNote) scroll.appendChild(A.el('div', { class: 'pv-note internal', html: '<b>Nota interna</b>' + A.esc(p.internalNote) }));

    side.appendChild(scroll);

    var foot = A.el('div', { class: 'pvw-foot' });
    foot.appendChild(fakeActions());
    var st = A.statusOf(p.status);
    foot.appendChild(A.el('div', { class: 'pvw-btns' }, [
      A.el('button', {
        class: 'btn sm', style: 'border-color:' + st.c + ';background:' + st.sub + ';',
        html: '<span style="width:7px;height:7px;border-radius:50%;background:' + st.c + '"></span>' + A.esc(st.label),
        onclick: function () { A.openStatusModal(p); }
      }),
      A.el('div', { class: 'bar-space' }),
      A.el('button', { class: 'btn sm', html: A.icon('pencil', 12) + 'Modifica', onclick: function () { A.closePostView(); A.openPostEditor(p.id); } })
    ]));
    side.appendChild(foot);
    shell.appendChild(side);

    if (PV.list.length > 1) {
      shell.appendChild(A.el('button', { class: 'pvw-step prev', html: '‹', 'aria-label': 'Contenuto precedente', onclick: function () { pvNav(-1); } }));
      shell.appendChild(A.el('button', { class: 'pvw-step next', html: '›', 'aria-label': 'Contenuto successivo', onclick: function () { pvNav(1); } }));
      shell.appendChild(A.el('span', { class: 'pvw-count', text: (PV.i + 1) + ' / ' + PV.list.length }));
    }

    host.appendChild(shell);
    host.onclick = function (e) { if (e.target === host) A.closePostView(); };
  }

  /* Story / storyboard viewer — frames step through in place. */
  A.closeStoryViewer = function () {
    var h = A.$('#lightbox');
    h.classList.remove('on', 'as-post');
    A.clear(h);
  };

  A.openStoryViewer = function (story) {
    var idx = 0;
    var host = A.$('#lightbox');
    host.classList.remove('as-post');
    host.classList.add('on');

    function draw() {
      A.clear(host);
      var frames = story.kind === 'storyboard' && story.frames.length
        ? story.frames : [{ id: 'single', url: story.mediaUrl, note: story.note }];
      var f = frames[idx] || frames[0];
      var frame = A.el('div', { class: 'lb-frame', style: 'width:min(280px,80vw);' });
      frame.appendChild(A.el('button', { class: 'lb-x', html: '&times;', 'aria-label': 'Chiudi', onclick: A.closeStoryViewer }));
      var stage = A.el('div', { class: 'lb-stage', style: '--ratio:9/16;' });
      if (f.url) stage.appendChild(A.el('img', { src: f.url, alt: '' }));
      else stage.appendChild(A.el('div', { style: 'color:#777;font-size:12px;padding:20px;text-align:center;', text: f.note || 'Frame vuoto' }));
      stage.appendChild(A.el('span', { class: 'lb-count', text: (idx + 1) + ' / ' + frames.length }));
      frame.appendChild(stage);
      if (frames.length > 1) {
        frame.appendChild(A.el('button', { class: 'lb-nav lb-prev', html: '‹', 'aria-label': 'Frame precedente', onclick: function () { idx = (idx - 1 + frames.length) % frames.length; draw(); } }));
        frame.appendChild(A.el('button', { class: 'lb-nav lb-next', html: '›', 'aria-label': 'Frame successivo', onclick: function () { idx = (idx + 1) % frames.length; draw(); } }));
      }
      frame.appendChild(A.el('div', { class: 'lb-cap', text: (story.title || '') + (f.note ? ' — ' + f.note : '') }));
      host.appendChild(frame);
    }
    draw();
  };

  document.addEventListener('keydown', function (e) {
    var lb = A.$('#lightbox');
    if (lb && lb.classList.contains('on')) {
      var isPost = lb.classList.contains('as-post');
      if (e.key === 'Escape') { isPost ? A.closePostView() : A.closeStoryViewer(); return; }
      if (!isPost) return;
      var p = PV.list[PV.i];
      var car = p && p.kind === 'carosello' && p.slides && p.slides.length > 1;
      if (e.key === 'ArrowLeft') car ? pvSlide(-1) : pvNav(-1);
      if (e.key === 'ArrowRight') car ? pvSlide(1) : pvNav(1);
      return;
    }
    var bg = A.$('#modal-bg');
    if (bg && bg.classList.contains('on') && e.key === 'Escape') A.closeModal();
  });
})(window.IDE);
