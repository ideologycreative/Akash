/* ============================================================
   Ideology — the client link

   What the client sees when the studio sends them a month.

   It is deliberately not a smaller copy of the studio tool. The
   client has one job — go through the month and say yes, or say
   what to change — so the page is built around that job and has
   no navigation, no settings and nothing to learn. Everything
   still to review is at the top; once the month is handled the
   page says so rather than leaving them guessing.
   ============================================================ */

(function (C, A) {
  'use strict';

  var S = {
    token: '',
    data: null,
    accountId: '',
    month: '',
    only: 'tutti',     // 'tutti' | 'da_rivedere'
    view: []           // the posts currently on screen, for the viewer
  };

  /* ── Reading the data ─────────────────────────────────── */

  function postsFor(accountId, month) {
    return S.data.posts.filter(function (p) {
      return p.accountId === accountId && (!month || p.month === month);
    });
  }

  function shown() {
    var list = postsFor(S.accountId, S.month);
    if (S.only === 'da_rivedere') {
      list = list.filter(function (p) { return C.stateOf(p.status).todo; });
    }
    return list;
  }

  function counts(list) {
    var c = { todo: 0, approvato: 0, in_revisione: 0, pubblicato: 0, tot: list.length };
    list.forEach(function (p) {
      if (C.stateOf(p.status).todo) c.todo++;
      if (c[p.status] !== undefined) c[p.status]++;
    });
    return c;
  }

  async function reload() {
    S.data = await C.load(S.token);
    if (!S.data) return false;
    if (!S.token && S.data.token) S.token = S.data.token;
    if (!S.accountId || !S.data.client.accounts.some(function (a) { return a.id === S.accountId; })) {
      S.accountId = (S.data.client.accounts[0] || {}).id || '';
    }
    if (!S.month || S.data.months.indexOf(S.month) < 0) {
      /* open on the month that needs them, else the latest */
      var best = '';
      S.data.months.forEach(function (m) {
        var has = postsFor(S.accountId, m).some(function (p) { return C.stateOf(p.status).todo; });
        if (has && !best) best = m;
      });
      S.month = best || S.data.months[S.data.months.length - 1] || A.thisMonth();
    }
    return true;
  }

  /* ── Pieces ───────────────────────────────────────────── */

  function media(p, opts) {
    opts = opts || {};
    var acc = account();
    var box = A.el('div', {
      class: 'cl-media' + (opts.contain ? ' contain' : ''),
      style: '--ratio:' + (acc ? acc.ratio : '4/5') + ';'
    });

    if (p.kind === 'editoriale' && p.editorial) {
      var pal = S.data.client.palette;
      var card = A.el('div', { class: 'cl-ed', style: 'background:' + pal.bg + ';color:' + pal.ink + ';' });
      if (p.editorial.eyebrow) card.appendChild(A.el('div', { class: 'eye', style: 'color:' + pal.accent + ';', text: p.editorial.eyebrow }));
      card.appendChild(A.el('div', { class: 'tit', text: p.editorial.title || '' }));
      card.appendChild(A.el('div', { class: 'rule' }));
      card.appendChild(A.el('div', { class: 'sub', text: p.editorial.sub || '' }));
      box.appendChild(card);
    } else {
      var url = p.coverUrl || p.mediaUrl || (p.slides[0] ? p.slides[0].url : '');
      if (url) {
        var img = A.el('img', { src: url, alt: '', loading: 'lazy' });
        img.addEventListener('error', function () {
          img.remove();
          box.appendChild(A.el('div', { class: 'cl-ph', text: 'Immagine non disponibile' }));
        });
        box.appendChild(img);
      } else {
        box.appendChild(A.el('div', { class: 'cl-ph', text: 'In preparazione' }));
      }
    }

    if (p.kind === 'reel') box.appendChild(A.el('span', { class: 'cl-mk', html: A.icon('play', 13) }));
    if (p.kind === 'carosello' && p.slides.length > 1) {
      box.appendChild(A.el('span', { class: 'cl-mk', html: A.icon('layers', 13) + '<i>' + p.slides.length + '</i>' }));
    }
    return box;
  }

  function badges(p) {
    var row = A.el('div', { class: 'cl-badges' });
    if (p.showDate && p.date) row.appendChild(A.el('span', { class: 'cl-chip date', text: A.dayLabel(p.date) }));
    if (p.paid) row.appendChild(A.el('span', { class: 'cl-chip paid', text: 'Sponsorizzato' }));
    if (p.partner) row.appendChild(A.el('span', { class: 'cl-chip partner', text: 'Con ' + p.partner }));
    if (p.category) {
      row.appendChild(A.el('span', {
        class: 'cl-chip',
        html: '<i class="dot" style="background:' + p.category.color + '"></i>' + A.esc(p.category.name)
      }));
    }
    return row;
  }

  function stateTag(p) {
    var st = C.stateOf(p.status);
    return A.el('span', {
      class: 'cl-state',
      style: 'color:' + st.c + ';background:' + st.sub + ';',
      html: '<i class="dot" style="background:' + st.c + '"></i>' + A.esc(st.label)
    });
  }

  /* The two things a client can do, wherever they are standing. */
  function actions(p, onDone) {
    var row = A.el('div', { class: 'cl-actions' });
    var st = C.stateOf(p.status);

    if (p.status === 'approvato') {
      row.appendChild(A.el('span', { class: 'cl-done', html: A.icon('check', 14) + 'Approvato' }));
      row.appendChild(A.el('div', { class: 'cl-grow' }));
      row.appendChild(A.el('button', {
        class: 'cl-btn ghost', text: 'Annulla',
        onclick: function (e) { e.stopPropagation(); act(p, 'annulla', '', onDone); }
      }));
      return row;
    }
    if (p.status === 'pubblicato') {
      row.appendChild(A.el('span', { class: 'cl-done pub', text: 'Pubblicato' }));
      return row;
    }
    if (p.status === 'in_revisione') {
      row.appendChild(A.el('span', { class: 'cl-done rev', html: A.icon('pencil', 13) + 'Modifica chiesta' }));
      row.appendChild(A.el('div', { class: 'cl-grow' }));
      row.appendChild(A.el('button', {
        class: 'cl-btn ghost', text: 'Modifica messaggio',
        onclick: function (e) { e.stopPropagation(); askChange(p, onDone); }
      }));
      return row;
    }

    row.appendChild(A.el('button', {
      class: 'cl-btn primary', html: A.icon('check', 14) + 'Approva',
      onclick: function (e) { e.stopPropagation(); act(p, 'approva', '', onDone); }
    }));
    row.appendChild(A.el('button', {
      class: 'cl-btn', html: A.icon('pencil', 13) + 'Chiedi una modifica',
      onclick: function (e) { e.stopPropagation(); askChange(p, onDone); }
    }));
    return row;
  }

  var sending = false;
  async function act(p, action, note, onDone) {
    if (sending) return;
    sending = true;
    try {
      var res = await C.send(S.token, p.id, action, note);
      if (!res.ok) { A.toast(res.error); return; }
      A.toast(action === 'approva' ? 'Approvato' :
              action === 'revisione' ? 'Richiesta inviata allo studio' : 'Approvazione annullata');
      try { await reload(); } catch (e) { A.toast('Salvato. Aggiorna la pagina per vedere lo stato.'); }
      if (onDone) onDone();
      render();
    } finally {
      sending = false;
    }
  }

  function askChange(p, onDone) {
    var ta = A.el('textarea', {
      class: 'cl-ta', rows: '5',
      placeholder: 'Cosa vorresti cambiare? Più sei preciso, meno giri servono.'
    });
    ta.value = p.clientNote || '';
    A.modal({
      title: 'Chiedi una modifica',
      body: [
        A.el('p', {
          class: 'cl-modal-note',
          text: 'Il messaggio arriva allo studio insieme al contenuto e resta allegato a questo post.'
        }),
        ta
      ],
      actions: [
        { label: 'Annulla' },
        {
          label: 'Invia richiesta', kind: 'primary',
          run: function () {
            if (!ta.value.trim()) { ta.focus(); return false; }
            act(p, 'revisione', ta.value, onDone);
          }
        }
      ]
    });
  }

  /* ── The full view of one content ─────────────────────── */

  var V = { i: 0, slide: 0 };

  function openViewer(list, id) {
    A.closeCaptionPeek();
    S.view = list.slice();
    V.i = Math.max(0, S.view.findIndex(function (p) { return p.id === id; }));
    V.slide = 0;
    A.$('#cl-viewer').classList.add('on');
    document.body.style.overflow = 'hidden';
    drawViewer();
  }
  function closeViewer() {
    A.$('#cl-viewer').classList.remove('on');
    A.clear(A.$('#cl-viewer'));
    document.body.style.overflow = '';
    S.view = [];
  }
  function step(d) {
    if (S.view.length < 2) return;
    V.i = (V.i + d + S.view.length) % S.view.length;
    V.slide = 0;
    drawViewer();
  }

  function drawViewer() {
    var host = A.$('#cl-viewer');
    A.clear(host);
    var p = S.view[V.i];
    if (!p) return closeViewer();
    var acc = account();

    var shell = A.el('div', { class: 'cl-vw', role: 'dialog', 'aria-modal': 'true' });

    var left = A.el('div', { class: 'cl-vw-media' });
    if (p.kind === 'carosello' && p.slides.length > 1) {
      var stage = A.el('div', { class: 'cl-media contain', style: '--ratio:' + acc.ratio + ';' });
      var sl = p.slides[V.slide];
      if (sl && sl.url) stage.appendChild(A.el('img', { src: sl.url, alt: '' }));
      else stage.appendChild(A.el('div', { class: 'cl-ph', text: 'Slide ' + (V.slide + 1) }));
      stage.appendChild(A.el('button', {
        class: 'cl-arrow left', html: '‹', 'aria-label': 'Slide precedente',
        onclick: function () { V.slide = (V.slide - 1 + p.slides.length) % p.slides.length; drawViewer(); }
      }));
      stage.appendChild(A.el('button', {
        class: 'cl-arrow right', html: '›', 'aria-label': 'Slide successiva',
        onclick: function () { V.slide = (V.slide + 1) % p.slides.length; drawViewer(); }
      }));
      var dots = A.el('div', { class: 'cl-dots' });
      p.slides.forEach(function (_, i) { dots.appendChild(A.el('i', { class: i === V.slide ? 'on' : '' })); });
      stage.appendChild(dots);
      left.appendChild(stage);
    } else {
      left.appendChild(media(p, { contain: true }));
    }
    shell.appendChild(left);

    var side = A.el('div', { class: 'cl-vw-side' });

    var head = A.el('div', { class: 'cl-vw-head' });
    var av = A.el('span', { class: 'cl-av' });
    if (acc.avatarUrl) av.appendChild(A.el('img', { src: acc.avatarUrl, alt: '' }));
    else av.textContent = A.initials(S.data.client.name);
    head.appendChild(av);
    head.appendChild(A.el('span', { class: 'cl-vw-who' }, [
      A.el('b', { text: acc.handle || S.data.client.name }),
      A.el('span', { text: acc.platform + (p.showDate && p.date ? ' · ' + A.dayLong(p.date) : '') })
    ]));
    head.appendChild(A.el('button', {
      class: 'cl-x', html: A.icon('x', 16), 'aria-label': 'Chiudi', onclick: closeViewer
    }));
    side.appendChild(head);

    var body = A.el('div', { class: 'cl-vw-body' });
    var tags = badges(p);
    tags.appendChild(stateTag(p));
    body.appendChild(tags);

    if (p.caption) body.appendChild(A.el('div', { class: 'cl-caption', text: p.caption }));
    else body.appendChild(A.el('div', { class: 'cl-caption none', text: 'Nessuna didascalia per questo contenuto.' }));

    if (p.clientNote) {
      body.appendChild(A.el('div', { class: 'cl-note' }, [
        A.el('b', { text: 'La tua richiesta' + (p.clientNoteAt ? ' · ' + new Date(p.clientNoteAt).toLocaleDateString('it-IT') : '') }),
        A.el('span', { text: p.clientNote })
      ]));
    }
    side.appendChild(body);

    side.appendChild(A.el('div', { class: 'cl-vw-foot' }, [actions(p, drawViewer)]));
    shell.appendChild(side);

    if (S.view.length > 1) {
      shell.appendChild(A.el('button', { class: 'cl-step prev', html: '‹', 'aria-label': 'Contenuto precedente', onclick: function () { step(-1); } }));
      shell.appendChild(A.el('button', { class: 'cl-step next', html: '›', 'aria-label': 'Contenuto successivo', onclick: function () { step(1); } }));
      shell.appendChild(A.el('span', { class: 'cl-count', text: (V.i + 1) + ' / ' + S.view.length }));
    }

    host.appendChild(shell);
    host.onclick = function (e) { if (e.target === host) closeViewer(); };
  }

  /* ── Page ─────────────────────────────────────────────── */

  function account() {
    var hit = null;
    S.data.client.accounts.forEach(function (a) { if (a.id === S.accountId) hit = a; });
    return hit || S.data.client.accounts[0] || { ratio: '4/5', handle: '', platform: '' };
  }

  function header() {
    var pal = S.data.client.palette;
    var bar = A.el('header', { class: 'cl-head' });

    var top = A.el('div', { class: 'cl-head-top' }, [
      A.el('span', { class: 'cl-mark', text: 'I' }),
      A.el('div', { class: 'cl-who' }, [
        A.el('h1', { text: S.data.client.name }),
        A.el('p', { text: 'Piano editoriale · ' + A.monthLabel(S.month) })
      ])
    ]);
    if (S.data.demo) {
      top.appendChild(A.el('div', { class: 'cl-grow' }));
      top.appendChild(A.el('span', { class: 'cl-demo', text: 'Esempio' }));
    }
    bar.appendChild(top);
    bar.appendChild(A.el('div', { class: 'cl-accent', style: 'background:' + pal.accent + ';' }));

    var rows = A.el('div', { class: 'cl-head-rows' });

    var accs = S.data.client.accounts.filter(function (a) {
      return S.data.posts.some(function (p) { return p.accountId === a.id; });
    });
    if (accs.length > 1) {
      var at = A.el('div', { class: 'cl-pills' });
      accs.forEach(function (a) {
        at.appendChild(A.el('button', {
          class: 'cl-pill', 'aria-pressed': a.id === S.accountId ? 'true' : 'false',
          text: a.platform,
          onclick: function () { S.accountId = a.id; render(); }
        }));
      });
      rows.appendChild(at);
    }

    if (S.data.months.length > 1) {
      var ms = A.el('select', { class: 'cl-sel', 'aria-label': 'Mese' });
      S.data.months.forEach(function (m) {
        ms.appendChild(A.el('option', { value: m, text: A.monthLabel(m), selected: m === S.month }));
      });
      ms.addEventListener('change', function () { S.month = ms.value; render(); });
      rows.appendChild(ms);
    }

    if (rows.childNodes.length) bar.appendChild(rows);
    return bar;
  }

  function summary(all) {
    var c = counts(all);
    var wrap = A.el('section', { class: 'cl-summary' });

    if (!all.length) return wrap;

    if (c.todo) {
      wrap.appendChild(A.el('div', { class: 'cl-ask' }, [
        A.el('h2', { text: c.todo === 1 ? 'Un contenuto aspetta il tuo ok' : c.todo + ' contenuti aspettano il tuo ok' }),
        A.el('p', { text: 'Approva quelli che vanno bene. Se qualcosa non torna, scrivi cosa cambiare: la richiesta arriva direttamente allo studio.' })
      ]));
    } else {
      wrap.appendChild(A.el('div', { class: 'cl-ask done' }, [
        A.el('h2', { html: A.icon('check', 18) + 'Hai rivisto tutto' }),
        A.el('p', {
          text: c.in_revisione
            ? (c.in_revisione === 1 ? 'Una modifica è in mano allo studio.' : c.in_revisione + ' modifiche sono in mano allo studio.')
            : 'Non manca niente per ' + A.monthLabel(S.month).toLowerCase() + '.'
        })
      ]));
    }

    var strip = A.el('div', { class: 'cl-strip' });
    [['Da rivedere', c.todo, 'var(--st-approvare)'],
     ['Approvati', c.approvato, 'var(--st-approvato)'],
     ['Modifiche chieste', c.in_revisione, 'var(--st-revisione)'],
     ['Pubblicati', c.pubblicato, 'var(--st-pubblicato)']
    ].forEach(function (r) {
      if (!r[1]) return;
      strip.appendChild(A.el('span', { class: 'cl-count-chip' }, [
        A.el('i', { class: 'dot', style: 'background:' + r[2] + ';' }),
        A.el('b', { text: String(r[1]) }),
        A.el('span', { text: r[0] })
      ]));
    });
    if (c.todo && c.tot > c.todo) {
      strip.appendChild(A.el('div', { class: 'cl-grow' }));
      strip.appendChild(A.el('button', {
        class: 'cl-btn ghost sm',
        'aria-pressed': S.only === 'da_rivedere' ? 'true' : 'false',
        text: S.only === 'da_rivedere' ? 'Mostra tutto il mese' : 'Solo da rivedere',
        onclick: function () { S.only = S.only === 'da_rivedere' ? 'tutti' : 'da_rivedere'; render(); }
      }));
    }
    if (strip.childNodes.length) wrap.appendChild(strip);
    return wrap;
  }

  function grid(list) {
    var g = A.el('section', { class: 'cl-grid' });
    list.forEach(function (p) {
      var card = A.el('article', { class: 'cl-card', dataset: { st: p.status, id: p.id } });

      var cell = A.el('div', {
        class: 'cl-cell', role: 'button', tabindex: '0',
        'aria-label': 'Apri il contenuto'
      });
      cell.appendChild(media(p));
      cell.addEventListener('click', function () { openViewer(list, p.id); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(list, p.id); }
      });
      card.appendChild(cell);

      var body = A.el('div', { class: 'cl-body' });
      var tags = badges(p);
      tags.appendChild(stateTag(p));
      body.appendChild(tags);

      var excerpt = null;
      if (p.caption) {
        excerpt = A.el('div', { class: 'cl-excerpt', text: p.caption });
        body.appendChild(excerpt);
      }
      if (p.clientNote) {
        body.appendChild(A.el('div', { class: 'cl-note small' }, [
          A.el('b', { text: 'La tua richiesta' }),
          A.el('span', { text: p.clientNote })
        ]));
      }
      card.appendChild(body);

      /* Hovering the content shows the whole caption. The action row is
         left out on purpose: the caption should not jump up over the
         buttons while someone is reaching for Approva. */
      if (excerpt) {
        A.captionPeek({ trigger: cell, clamp: excerpt, text: p.caption });
        A.captionPeek({ trigger: body, clamp: excerpt, text: p.caption });
      }

      card.appendChild(actions(p, null));
      g.appendChild(card);
    });
    return g;
  }

  function emptyState() {
    return A.el('div', { class: 'cl-empty' }, [
      A.el('h2', { text: S.only === 'da_rivedere' ? 'Niente da rivedere' : 'Ancora niente da vedere' }),
      A.el('p', {
        text: S.only === 'da_rivedere'
          ? 'Hai già risposto a tutto quello che c’era in questo mese.'
          : 'Appena lo studio invia i contenuti di ' + A.monthLabel(S.month).toLowerCase() + ', li trovi qui.'
      }),
      S.only === 'da_rivedere'
        ? A.el('button', { class: 'cl-btn', text: 'Mostra tutto il mese', onclick: function () { S.only = 'tutti'; render(); } })
        : null
    ]);
  }

  function render() {
    var root = A.$('#cl-root');
    A.clear(root);

    if (S.loading || S.failed) {
      root.appendChild(A.el('div', { class: 'cl-gate' }, S.failed ? [
        A.el('h1', { text: 'Non riesco a caricare l\'anteprima' }),
        A.el('p', { text: S.failed }),
        A.el('button', { class: 'cl-btn primary', text: 'Riprova', onclick: C.boot })
      ] : [A.el('p', { text: 'Caricamento…' })]));
      return;
    }

    if (C.misconfigured) {
      root.appendChild(A.el('div', { class: 'cl-gate' }, [
        A.el('h1', { text: 'Pagina da configurare' }),
        A.el('p', { text: 'La chiave in 00-config.js è una chiave segreta: va usata quella pubblica.' })
      ]));
      return;
    }

    if (!S.data) {
      root.appendChild(A.el('div', { class: 'cl-gate' }, [
        A.el('h1', { text: 'Link non valido' }),
        A.el('p', { text: 'Questo link di anteprima non è più attivo. Chiedi allo studio di inviartene uno nuovo.' })
      ]));
      return;
    }

    root.appendChild(header());
    var main = A.el('main', { class: 'cl-main' });
    var all = postsFor(S.accountId, S.month);
    main.appendChild(summary(all));

    var list = shown();
    main.appendChild(list.length ? grid(list) : emptyState());

    main.appendChild(A.el('footer', { class: 'cl-foot' }, [
      A.el('div', { text: 'Anteprima preparata per ' + S.data.client.name }),
      A.el('div', { class: 'sig', text: 'Ideology · ideology.it' })
    ]));
    root.appendChild(main);
  }

  /* ── Boot ─────────────────────────────────────────────── */

  document.addEventListener('keydown', function (e) {
    var v = A.$('#cl-viewer');
    if (v && v.classList.contains('on')) {
      if (e.key === 'Escape') return closeViewer();
      var p = S.view[V.i];
      var car = p && p.kind === 'carosello' && p.slides.length > 1;
      if (e.key === 'ArrowLeft') { car ? (V.slide = (V.slide - 1 + p.slides.length) % p.slides.length, drawViewer()) : step(-1); }
      if (e.key === 'ArrowRight') { car ? (V.slide = (V.slide + 1) % p.slides.length, drawViewer()) : step(1); }
      return;
    }
    var bg = A.$('#modal-bg');
    if (bg && bg.classList.contains('on') && e.key === 'Escape') A.closeModal();
  });

  C.boot = async function () {
    S.token = C.tokenFromUrl();
    S.loading = true; S.failed = '';
    render();
    try {
      await reload();
    } catch (e) {
      S.failed = 'Controlla la connessione e riprova. (' + e.message + ')';
    }
    S.loading = false;
    if (S.data) document.title = S.data.client.name + ' — Anteprima';
    render();
  };

  /* Images come with links that expire after an hour. A page left open
     longer than that refreshes itself when looked at again. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !C.remote || !S.data || S.loading) return;
    if (Date.now() - (S.data.loadedAt || 0) < 45 * 60 * 1000) return;
    reload().then(render, function () {});
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', C.boot);
  else C.boot();
})(window.IDEC, window.IDE);
