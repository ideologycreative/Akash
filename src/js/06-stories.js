/* ============================================================
   Ideology — Stories
   Single stories and storyboards live in the same collection:
   a storyboard is a story with frames. The feed links to them
   by id, so a storyboard can be reordered or deleted without
   stranding the posts that reference it.
   ============================================================ */

(function (A) {
  'use strict';


  function toolbar() {
    var bar = A.el('div', { class: 'toolbar' });
    var list = A.curStories();
    var boards = list.filter(function (s) { return s.kind === 'storyboard'; });
    var stats = A.el('div', { class: 'toolbar-stats' }, [
      A.el('span', { class: 'stat' }, [A.el('b', { text: String(list.length - boards.length) }), A.el('span', { text: 'stories' })]),
      A.el('span', { class: 'stat' }, [A.el('b', { text: String(boards.length) }), A.el('span', { text: 'storyboard' })]),
      A.el('span', { class: 'stat' }, [A.el('b', { text: String(A.highlightsIn(A.ui.accountId).length) }), A.el('span', { text: 'in evidenza' })])
    ]);
    bar.appendChild(stats);
    bar.appendChild(A.el('div', { class: 'bar-space' }));
    bar.appendChild(A.el('button', {
      class: 'btn sm', html: A.icon('story', 12) + 'Story',
      onclick: function () { var st = A.addStory('story'); if (st) A.openStoryEditor(st.id, { isNew: true }); }
    }));
    bar.appendChild(A.el('button', {
      class: 'btn primary sm', html: A.icon('grid', 12) + 'Storyboard',
      onclick: function () { var st = A.addStory('storyboard'); if (st) A.openStoryEditor(st.id, { isNew: true }); }
    }));
    return bar;
  }

  function highlights() {
    var wrap = A.el('div');
    wrap.appendChild(A.el('div', { class: 'sec-title', text: 'In evidenza' }));
    var row = A.el('div', { class: 'hl-row' });
    A.highlightsIn(A.ui.accountId).forEach(function (h) {
      var b = A.el('button', { class: 'hl', title: h.title, type: 'button' });
      var ring = A.el('div', { class: 'ring' });
      if (h.coverUrl) ring.appendChild(A.el('img', { src: h.coverUrl, alt: '' }));
      else ring.innerHTML = A.icon('story', 18);
      b.appendChild(ring);
      b.appendChild(A.el('span', { class: 'nm', text: h.title }));
      b.addEventListener('click', function () { editHighlight(h); });
      row.appendChild(b);
    });
    var add = A.el('button', { class: 'hl', type: 'button', title: 'Nuova evidenza' });
    var ring2 = A.el('div', { class: 'ring', style: 'border-style:dashed;' });
    ring2.innerHTML = A.icon('plus', 18);
    add.appendChild(ring2);
    add.appendChild(A.el('span', { class: 'nm', text: 'Nuova' }));
    add.addEventListener('click', function () {
      var h = { id: A.uid('hl'), accountId: A.ui.accountId, title: 'Evidenza', coverUrl: '', storyIds: [] };
      A.S.highlights.push(h);
      A.commit();
      editHighlight(h, true);
    });
    row.appendChild(add);
    wrap.appendChild(row);
    return wrap;
  }

  function editHighlight(h, isNew) {
    var hSnap = A.snap(h), hWasDirty = A.dirty, hSaved = false, hNew = !!isNew;
    var name = A.el('input', { class: 'inp', value: h.title });
    var prev = A.el('div', {
      style: 'width:64px;height:64px;border-radius:50%;overflow:hidden;border:1px solid var(--rule);' +
             'background:var(--paper-2);display:flex;align-items:center;justify-content:center;color:var(--ink-4);'
    });
    function paint() {
      A.clear(prev);
      if (h.coverUrl) prev.appendChild(A.el('img', { src: h.coverUrl, alt: '', style: 'width:100%;height:100%;object-fit:cover;' }));
      else prev.innerHTML = A.icon('story', 18);
    }
    paint();
    A.modal({
      title: 'Evidenza',
      body: [
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Nome' }), name]),
        A.el('div', { style: 'display:flex;align-items:center;gap:12px;' }, [
          prev,
          A.el('div', { style: 'flex:1 1 auto;min-width:0;' }, [
            A.mediaControl(h.coverUrl, function (url) { h.coverUrl = url; paint(); A.commit({ render: false }); },
              function () { h.coverUrl = ''; paint(); A.commit({ render: false }); })
          ])
        ])
      ],
      onClose: function () { if (!hSaved) { A.restore(h, hSnap); if (hNew) A.S.highlights = A.S.highlights.filter(function (x) { return x.id !== h.id; }); A.index(); A.setSaveState(hWasDirty ? 'dirty' : 'saved'); A.render(); } },
      actions: [
        {
          label: 'Elimina', kind: 'danger', run: function () {
            hSaved = true;
            A.S.highlights = A.S.highlights.filter(function (x) { return x.id !== h.id; });
            A.commit(); A.save({ quiet: true });
          }
        },
        { label: 'Annulla' },
        { label: 'Salva', kind: 'primary', run: function () { hSaved = true; h.title = name.value.trim() || 'Evidenza'; A.commit(); A.save({ quiet: true }); } }
      ]
    });
  }

  function grid() {
    var list = A.curStories();
    var wrap = A.el('div');
    wrap.appendChild(A.el('div', { class: 'sec-title', text: 'Stories di ' + A.monthLabel(A.ui.month).toLowerCase() }));
    if (!list.length) {
      wrap.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Ancora nessuna story' }),
        A.el('p', { text: 'Una story singola per i contenuti del giorno, uno storyboard quando serve pianificare la sequenza frame per frame.' })
      ]));
      return wrap;
    }
    var g = A.el('div', { class: 'grid', style: '--cols:5;--gap:10px;' });
    list.forEach(function (st) {
      var card = A.el('div', {
        class: 'card', dataset: { id: st.id }
      });
      var cell = A.el('div', { class: 'cell', style: '--ratio:9/16;', role: 'button', tabindex: '0' });
      if (st.mediaUrl) cell.appendChild(A.el('img', { src: st.mediaUrl, alt: '', loading: 'lazy' }));
      else cell.appendChild(A.el('div', { class: 'ph' }, [
        (function () { var s = A.el('span'); s.innerHTML = A.icon('story', 18); return s; })(), 'Vuota'
      ]));
      if (st.kind === 'storyboard') {
        cell.appendChild(A.el('span', { class: 'cell-badge', html: A.icon('grid', 9) + '<span>' + st.frames.length + '</span>' }));
      }
      if (st.isUgc) {
        cell.appendChild(A.el('span', { class: 'c-bl', html: '<span class="dot" style="background:var(--ugc-girato)"></span>UGC' }));
      }
      if (st.fromPostId) {
        cell.appendChild(A.el('span', { class: 'c-tl', title: 'Collegata a un contenuto del feed', text: 'Dal feed' }));
      }
      if (st.date) cell.appendChild(A.el('span', { class: 'c-br', text: A.dayLabel(st.date) }));
      cell.addEventListener('click', function () { A.openStoryViewer(st); });
      cell.addEventListener('keydown', function (e) { if (e.key === 'Enter') A.openStoryViewer(st); });
      card.appendChild(cell);
      card.appendChild(A.el('div', { class: 'card-body' }, [
        A.el('div', { style: 'font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', text: st.title || 'Senza titolo' })
      ]));
      card.addEventListener('click', function (e) {
        if (e.target.closest('.cell')) return;
        A.openStoryEditor(st.id);
      });
      g.appendChild(card);
    });
    wrap.appendChild(g);
    return wrap;
  }

  /* ── Editor ───────────────────────────────────────────── */

  A.openStoryEditor = function (storyId, opts) {
    opts = opts || {};
    var body = A.el('div', { style: 'display:flex;flex-direction:column;gap:15px;' });
    var snapshot = A.snap(A.get(storyId));
    var wasDirty = A.dirty;
    var closedBySave = false;

    function field(label, control, hint) {
      var f = A.el('div', { class: 'field' }, [A.el('label', { text: label }), control]);
      if (hint) f.appendChild(A.el('div', { class: 'hint', text: hint }));
      return f;
    }

    function redraw() { A.rebuild(build); }

    function build() {
      var st = A.get(storyId);
      if (!st) { A.closeModal(); return; }
      A.clear(body);

      var src = st.fromPostId ? A.get(st.fromPostId) : null;
      if (src) {
        body.appendChild(A.el('div', { class: 'pv-note internal' }, [
          A.el('b', { text: 'Collegata a un contenuto del feed' }),
          A.el('span', { text: 'Visual, titolo e data seguono il post. Per scollegarla, togli la spunta "Pubblica anche nelle Stories" dal contenuto.' })
        ]));
      }

      var title = A.el('input', { class: 'inp', value: st.title || '', placeholder: 'Titolo' });
      title.disabled = !!src;
      title.addEventListener('input', function () { st.title = title.value; A.commit({ render: false }); });
      body.appendChild(field('Titolo', title));

      var dIn = A.el('input', { class: 'inp', type: 'date', value: st.date || '' });
      dIn.disabled = !!src;
      dIn.addEventListener('change', function () { st.date = dIn.value; A.commit(); redraw(); });
      body.appendChild(field('Data', dIn));

      if (st.kind === 'storyboard') {
        var fr = A.el('div', { style: 'display:flex;flex-direction:column;gap:9px;' });
        st.frames.forEach(function (f, i) {
          var row = A.el('div', { class: 'slide-row' });
          var th = A.el('div', { class: 'slide-th' });
          if (f.url) th.appendChild(A.el('img', { src: f.url, alt: '' }));
          else th.textContent = String(i + 1);
          row.appendChild(th);
          var col = A.el('div', { style: 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px;' });
          var note = A.el('input', { class: 'inp', value: f.note || '', placeholder: 'Nota di regia' });
          note.addEventListener('input', function () { f.note = note.value; A.commit({ render: false }); });
          col.appendChild(note);
          col.appendChild(A.mediaControl(f.url, function (u) {
            f.url = u;
            if (i === 0) st.mediaUrl = u;
            A.commit({ render: false }); A.render(); redraw();
          }, function () {
            f.url = '';
            if (i === 0) st.mediaUrl = st.frames[0] ? st.frames[0].url : '';
            A.commit({ render: false }); A.render(); redraw();
          }));
          row.appendChild(col);
          row.appendChild(A.el('button', {
            class: 'btn ghost sm icon', title: 'Rimuovi frame', html: A.icon('trash', 12),
            onclick: function () {
              st.frames = st.frames.filter(function (x) { return x.id !== f.id; });
              st.mediaUrl = st.frames[0] ? st.frames[0].url : '';
              A.commit({ render: false }); A.render(); redraw();
            }
          }));
          fr.appendChild(row);
        });
        fr.appendChild(A.el('button', {
          class: 'btn sm', html: A.icon('plus', 12) + 'Aggiungi frame',
          onclick: function () { st.frames.push({ id: A.uid('fr'), url: '', note: '' }); A.commit({ render: false }); A.render(); redraw(); }
        }));
        body.appendChild(field('Frame (' + st.frames.length + ')', fr));
      } else if (!src) {
        body.appendChild(field('Visual', A.mediaControl(st.mediaUrl,
          function (u) { st.mediaUrl = u; A.commit({ render: false }); A.render(); redraw(); },
          function () { st.mediaUrl = ''; A.commit({ render: false }); A.render(); redraw(); })));
      }

      body.appendChild(field('Origine', A.el('button', {
        type: 'button', class: 'tick', 'aria-pressed': st.isUgc ? 'true' : 'false',
        'data-focus': 'ugc',
        onclick: function () { st.isUgc = !st.isUgc; A.commit({ render: false }); A.render(); redraw(); }
      }, [
        A.el('span', { class: 'box', html: A.icon('check', 11) }),
        A.el('span', {}, [A.el('span', { class: 'tl', text: 'Contenuto UGC' })])
      ])));

      var linked = A.S.posts.filter(function (p) { return (p.storyIds || []).indexOf(st.id) >= 0; });
      if (linked.length) {
        var lw = A.el('div', { style: 'display:flex;flex-direction:column;gap:5px;' });
        linked.forEach(function (p) {
          lw.appendChild(A.el('button', {
            class: 'btn sm', style: 'justify-content:flex-start;width:100%;',
            text: (p.caption || 'Contenuto senza testo').slice(0, 40),
            onclick: function () { A.closeModal(); A.ui.tab = 'feed'; A.render(); A.openPostEditor(p.id); }
          }));
        });
        body.appendChild(field('Collegata a', lw));
      }
    }

    build();

    function cancel() {
      var live = A.get(storyId);
      if (!live) return;
      if (opts.isNew) A.S.stories = A.S.stories.filter(function (x) { return x.id !== storyId; });
      else A.restore(live, snapshot);
      A.index();
      A.setSaveState(wasDirty ? 'dirty' : 'saved');
      A.render();
    }

    A.modal({
      title: (A.get(storyId) || {}).kind === 'storyboard' ? 'Storyboard' : 'Story',
      wide: true,
      body: [body],
      onClose: function () { if (!closedBySave) cancel(); },
      actions: [
        {
          label: 'Elimina', kind: 'danger', keepOpen: true, run: function () {
            A.confirm({
              title: 'Eliminare?', body: 'L\'eliminazione viene scritta subito.',
              ok: 'Elimina', danger: true,
              run: function () { closedBySave = true; A.closeModal(); A.deleteStory(storyId); A.save({ quiet: true }); }
            });
            return false;
          }
        },
        { label: 'Annulla' },
        { label: 'Salva', kind: 'primary', run: function () { closedBySave = true; A.save({ quiet: true }); A.toast('Story salvata'); } }
      ]
    });
  };

  A.views = A.views || {};
  A.views.stories = function (host) {
    A.clear(host);
    if (!A.ui.accountId) {
      host.appendChild(A.el('div', { class: 'empty' }, [A.el('h4', { text: 'Nessun account selezionato' })]));
      return;
    }
    host.appendChild(toolbar());
    var canvas = A.el('div', { class: 'canvas' });
    canvas.appendChild(highlights());
    canvas.appendChild(grid());
    host.appendChild(canvas);
  };
})(window.IDE);
