/* ============================================================
   Ideology — Feed

   Composing the month. The grid is ordered by publication date
   and everything is edited in one centred dialog, so the grid
   behind it never shifts under the cursor while you work.
   ============================================================ */

(function (A) {
  'use strict';

  /* ── Shared media control: upload a file or paste a link ── */

  A.mediaControl = function (current, onSet, onClear, opts) {
    opts = opts || {};
    var wrap = A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' });

    var row = A.el('div', { style: 'display:flex;gap:7px;align-items:center;flex-wrap:wrap;' });
    var file = A.el('input', { type: 'file', accept: opts.accept || 'image/*', style: 'display:none' });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var read = opts.read || A.readImage;
      read(f).then(onSet).catch(function (e) { A.toast(e.message); });
      file.value = '';
    });
    row.appendChild(A.el('button', {
      class: 'btn sm', html: A.icon('up', 12) + (current ? (opts.replaceLabel || 'Sostituisci file') : (opts.uploadLabel || 'Carica file')),
      onclick: function () { file.click(); }
    }));
    row.appendChild(file);
    if (current && onClear) {
      row.appendChild(A.el('button', { class: 'btn ghost sm icon', title: 'Svuota', html: A.icon('trash', 12), onclick: onClear }));
    }
    wrap.appendChild(row);

    var linkRow = A.el('div', { style: 'display:flex;gap:6px;' });
    var inp = A.el('input', {
      class: 'inp', type: 'url', placeholder: opts.linkPlaceholder || 'oppure incolla un link all\'immagine',
      value: current && /^https?:/.test(current) ? current : ''
    });
    function apply() {
      var v = inp.value.trim();
      if (!v) return;
      if (!/^https?:\/\//i.test(v)) { A.toast('Il link deve iniziare con http:// o https://'); return; }
      onSet(opts.read === A.readVideo ? { name: '', sizeBytes: 0, poster: '', dataUrl: v } : v);
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    linkRow.appendChild(inp);
    linkRow.appendChild(A.el('button', { class: 'btn sm', html: A.icon('link', 12) + 'Usa', onclick: apply }));
    wrap.appendChild(linkRow);

    return wrap;
  };

  /* ── Status dialog ────────────────────────────────────── */

  A.openStatusModal = function (post, actor) {
    var chosen = post.status;
    var pills = A.el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
    function paint() {
      A.clear(pills);
      A.STATUS.forEach(function (st) {
        var on = chosen === st.key;
        pills.appendChild(A.el('button', {
          type: 'button',
          style: 'display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:7px;text-align:left;' +
                 'border:1px solid ' + (on ? st.c : 'var(--rule)') + ';background:' + (on ? st.sub : 'transparent') + ';' +
                 'font-size:13px;font-weight:600;color:var(--ink);',
          html: '<span style="width:8px;height:8px;border-radius:50%;background:' + st.c + '"></span>' + A.esc(st.label),
          onclick: function () { chosen = st.key; paint(); }
        }));
      });
    }
    paint();
    var noteBox = A.el('textarea', { class: 'ta', rows: '3', placeholder: 'Nota sul passaggio di stato (facoltativa)' });

    A.modal({
      title: 'Stato del contenuto',
      body: [pills, A.el('div', { class: 'field' }, [A.el('label', { text: 'Nota' }), noteBox])],
      actions: [
        { label: 'Annulla' },
        {
          label: 'Applica e salva', kind: 'primary',
          run: function () {
            A.setStatus(post.id, chosen, actor || 'studio', noteBox.value.trim());
            A.save({ quiet: true });
          }
        }
      ]
    });
  };

  /* ── The editor ───────────────────────────────────────── */

  function field(label, control, hint) {
    var f = A.el('div', { class: 'field' }, [A.el('label', { text: label }), control]);
    if (hint) f.appendChild(A.el('div', { class: 'hint', text: hint }));
    return f;
  }

  function tickRow(label, desc, on, onToggle, key) {
    var btn = A.el('button', {
      type: 'button', class: 'tick', 'aria-pressed': on ? 'true' : 'false',
      'data-focus': key || null,
      onclick: function () { onToggle(!on); }
    }, [
      A.el('span', { class: 'box', html: A.icon('check', 11) }),
      A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
        A.el('span', { class: 'tl', text: label }),
        desc ? A.el('span', { class: 'td', text: desc }) : null
      ])
    ]);
    return btn;
  }

  A.openPostEditor = function (postId, opts) {
    opts = opts || {};
    var post = A.get(postId);
    if (!post) return;
    var client = A.clientOfAccount(post.accountId);
    /* The dialog writes straight through, so the grid behind it updates as
       you type, and keeps a snapshot so Annulla can put everything back —
       including a post that was created only to be cancelled. */
    var snapshot = A.snap(post);
    var wasDirty = A.dirty;
    var closedBySave = false;
    var body = A.el('div', { style: 'display:flex;flex-direction:column;gap:16px;' });

    function redraw() { A.rebuild(build); }

    function build() {
      post = A.get(postId);
      if (!post) { A.closeModal(); return; }
      A.clear(body);

      /* type */
      var seg = A.el('div', { class: 'segment' });
      A.KINDS.forEach(function (k) {
        seg.appendChild(A.el('button', {
          type: 'button', 'aria-pressed': post.kind === k.key ? 'true' : 'false', text: k.label,
          'data-focus': 'kind-' + k.key,
          onclick: function () {
            var patch = { kind: k.key };
            if (k.key === 'carosello' && (!post.slides || !post.slides.length)) {
              patch.slides = [{ id: A.uid('sl'), url: post.mediaUrl || '', caption: '' },
                              { id: A.uid('sl'), url: '', caption: '' }];
            }
            A.updatePost(post.id, patch, { render: false });
            A.render(); redraw();
          }
        }));
      });
      body.appendChild(field('Tipo', seg));

      /* media */
      if (post.kind === 'editoriale') {
        var ed = post.editorial || (post.editorial = { eyebrow: '', title: '', sub: '' });
        var eye = A.el('input', { class: 'inp', value: ed.eyebrow || '', placeholder: 'Occhiello' });
        eye.addEventListener('input', function () { ed.eyebrow = eye.value; A.commit({ render: false }); });
        var tit = A.el('textarea', { class: 'ta', rows: '2', placeholder: 'Titolo della card' });
        tit.value = ed.title || '';
        tit.addEventListener('input', function () { ed.title = tit.value; A.commit({ render: false }); });
        var sub = A.el('textarea', { class: 'ta', rows: '2', placeholder: 'Sottotitolo' });
        sub.value = ed.sub || '';
        sub.addEventListener('input', function () { ed.sub = sub.value; A.commit({ render: false }); });
        body.appendChild(field('Card testuale',
          A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' }, [eye, tit, sub]),
          'Disegnata con i colori del brand del cliente. Nessun file da caricare.'));
      } else if (post.kind === 'carosello') {
        var slWrap = A.el('div', { style: 'display:flex;flex-direction:column;gap:9px;' });
        (post.slides || []).forEach(function (sl, i) {
          var box = A.el('div', { class: 'slide-row' });
          var th = A.el('div', { class: 'slide-th' });
          if (sl.url) {
            var im = A.el('img', { src: sl.url, alt: '' });
            im.addEventListener('error', function () { im.remove(); th.textContent = '!'; });
            th.appendChild(im);
          } else th.textContent = String(i + 1);
          box.appendChild(th);
          box.appendChild(A.el('div', { style: 'flex:1 1 auto;min-width:0;' }, [
            A.mediaControl(sl.url, function (u) {
              sl.url = u;
              if (i === 0) post.mediaUrl = u;
              A.updatePost(post.id, {}, { render: false }); A.render(); redraw();
            }, function () {
              sl.url = '';
              if (i === 0) post.mediaUrl = post.slides[0] ? post.slides[0].url : '';
              A.updatePost(post.id, {}, { render: false }); A.render(); redraw();
            })
          ]));
          box.appendChild(A.el('button', {
            class: 'btn ghost sm icon', title: 'Rimuovi slide', html: A.icon('trash', 12),
            onclick: function () {
              post.slides = post.slides.filter(function (x) { return x.id !== sl.id; });
              post.mediaUrl = post.slides[0] ? post.slides[0].url : '';
              A.updatePost(post.id, {}, { render: false }); A.render(); redraw();
            }
          }));
          slWrap.appendChild(box);
        });
        slWrap.appendChild(A.el('button', {
          class: 'btn sm', html: A.icon('plus', 12) + 'Aggiungi slide',
          onclick: function () {
            post.slides.push({ id: A.uid('sl'), url: '', caption: '' });
            A.updatePost(post.id, {}, { render: false }); A.render(); redraw();
          }
        }));
        body.appendChild(field('Slide (' + (post.slides || []).length + ')', slWrap));
      } else if (post.kind === 'reel') {
        /* A reel is judged in the grid by its cover, so the cover is its own
           field. The video is kept beside it for whoever has to produce it. */
        var coverPrev = A.el('div', { class: 'thumb-prev' });
        if (post.coverUrl) {
          var ci = A.el('img', { src: post.coverUrl, alt: '' });
          ci.addEventListener('error', function () { ci.remove(); coverPrev.textContent = '!'; });
          coverPrev.appendChild(ci);
        } else coverPrev.innerHTML = A.icon('image', 16);
        body.appendChild(field('Copertina del reel',
          A.el('div', { style: 'display:flex;gap:11px;align-items:flex-start;' }, [
            coverPrev,
            A.el('div', { style: 'flex:1 1 auto;min-width:0;' }, [
              A.mediaControl(post.coverUrl, function (u) {
                A.updatePost(post.id, { coverUrl: u }, { render: false }); A.render(); redraw();
              }, function () {
                A.updatePost(post.id, { coverUrl: '' }, { render: false }); A.render(); redraw();
              })
            ])
          ]),
          'È questa che si vede nella griglia e nell\'anteprima.'));

        var vidWrap = A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' });
        if (post.videoName || (post.mediaUrl || '').indexOf('data:video') === 0) {
          vidWrap.appendChild(A.el('div', { class: 'filechip' }, [
            (function () { var i = A.el('span'); i.innerHTML = A.icon('play', 11); return i; })(),
            A.el('span', { style: 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;', text: post.videoName || 'Video caricato' }),
            A.el('span', { style: 'color:var(--ink-3);font-weight:600;', text: (post.mediaUrl || '').indexOf('data:video') === 0 ? 'nel documento' : 'solo riferimento' })
          ]));
        }
        vidWrap.appendChild(A.mediaControl(post.mediaUrl, function (res) {
          /* the poster frame becomes the cover when there is not one yet */
          var patch = { videoName: res.name || '', mediaUrl: res.dataUrl || '' };
          if (!post.coverUrl && res.poster) patch.coverUrl = res.poster;
          A.updatePost(post.id, patch, { render: false });
          if (!res.dataUrl) {
            A.toast('Video troppo pesante (' + A.humanSize(res.sizeBytes) + '): tengo la copertina, aggiungi il link al file');
          }
          A.render(); redraw();
        }, function () {
          A.updatePost(post.id, { mediaUrl: '', videoName: '' }, { render: false });
          A.render(); redraw();
        }, {
          accept: 'video/*', read: A.readVideo,
          uploadLabel: 'Carica video', replaceLabel: 'Sostituisci video',
          linkPlaceholder: 'oppure incolla un link al video (Frame.io, Drive, WeTransfer…)'
        }));
        body.appendChild(field('Video', vidWrap,
          'Dal file carico anche un fotogramma come copertina. I video sopra ' + A.humanSize(A.VIDEO_INLINE_MAX) + ' restano un riferimento: in griglia conta la copertina.'));
      } else {
        body.appendChild(field('Immagine',
          A.mediaControl(post.mediaUrl, function (u) {
            A.updatePost(post.id, { mediaUrl: u, coverUrl: '' }, { render: false });
            A.render(); redraw();
          }, function () {
            A.updatePost(post.id, { mediaUrl: '', coverUrl: '' }, { render: false });
            A.render(); redraw();
          }),
          'I file caricati vengono ridimensionati e salvati nel documento. I link restano link.'));
      }

      /* when */
      var dIn = A.el('input', { class: 'inp', type: 'date', value: post.date || '' });
      var tIn = A.el('input', { class: 'inp', type: 'time', value: post.time || '' });
      dIn.addEventListener('change', function () {
        A.updatePost(post.id, { date: dIn.value }, { render: false });
        A.render(); redraw();
      });
      tIn.addEventListener('change', function () { A.updatePost(post.id, { time: tIn.value }, { render: false }); A.render(); });
      body.appendChild(field('Pubblicazione', A.el('div', { class: 'row' }, [
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Data' }), dIn]),
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Ora' }), tIn])
      ]), 'In griglia compare solo la data. L\'ora serve a ordinare due contenuti dello stesso giorno.'));

      /* caption */
      var capMax = A.formatOfAccount(A.curAccount()).platform.captionMax;
      var cap = A.el('textarea', { class: 'ta', rows: '7', placeholder: 'Scrivi la caption…' });
      cap.value = post.caption || '';
      var counter = A.el('div', { class: 'counter' });
      function countUp() {
        var n = cap.value.length;
        counter.textContent = n + ' / ' + capMax.toLocaleString('it-IT') + ' caratteri';
        counter.classList.toggle('over', n > capMax);
      }
      cap.addEventListener('input', function () {
        post.caption = cap.value;
        countUp();
        if (post.inStories) A.syncMirror(post.id);
        A.commit({ render: false });
        repaintCard(post);
      });
      countUp();
      body.appendChild(field('Caption', A.el('div', { style: 'display:flex;flex-direction:column;gap:4px;' }, [cap, counter])));

      /* classification */
      var cats = A.categoriesOf(client.id);
      var sel = A.el('select', { class: 'sel' });
      sel.appendChild(A.el('option', { value: '', text: 'Nessuna categoria' }));
      cats.forEach(function (c) {
        sel.appendChild(A.el('option', { value: c.id, text: c.name, selected: post.categoryId === c.id }));
      });
      sel.addEventListener('change', function () { A.updatePost(post.id, { categoryId: sel.value }, { render: false }); A.render(); });
      body.appendChild(field('Categoria', sel,
        cats.length ? null : 'Nessuna categoria definita per ' + client.name + '. Le trovi nella scheda cliente.'));

      /* nature: paid and partnership are independent, and can both be true */
      var isPartner = !!(post.partner || '').trim() || post._partnerOpen;
      var natWrap = A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' }, [
        tickRow('Sponsorizzato', 'Contenuto messo a budget.', post.paid,
          function (v) { A.updatePost(post.id, { paid: v }, { render: false }); A.render(); redraw(); }, 'paid'),
        tickRow('In collaborazione', 'Contenuto fatto insieme a qualcun altro.', isPartner,
          function (v) {
            post._partnerOpen = v;
            A.updatePost(post.id, { partner: v ? post.partner : '' }, { render: false });
            A.render(); redraw();
          }, 'partner')
      ]);
      if (isPartner) {
        var pin = A.el('input', { class: 'inp', value: post.partner || '', placeholder: 'Con chi: brand, creator, ente…' });
        pin.addEventListener('input', function () { post.partner = pin.value; A.commit({ render: false }); });
        pin.addEventListener('change', function () { A.render(); });
        natWrap.appendChild(pin);
      }
      body.appendChild(field('Natura del contenuto', natWrap,
        'Si combinano: una collaborazione può anche essere sponsorizzata. Compare nell\'angolo in alto a sinistra.'));

      /* cross-posting to the client's other accounts */
      var sibs = A.siblingAccounts(post.accountId);
      if (sibs.length) {
        var cross = A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' });
        sibs.forEach(function (a) {
          var on = (post.alsoOn || []).indexOf(a.id) >= 0;
          var f2 = A.formatOfAccount(a);
          cross.appendChild(tickRow(
            a.platform + ' · ' + a.handle,
            f2.sizeLabel + ' · ' + f2.w + '×' + f2.h + ' · max ' + f2.platform.captionMax.toLocaleString('it-IT') + ' caratteri',
            on,
            function (v) {
              var ids = (post.alsoOn || []).slice();
              var i = ids.indexOf(a.id);
              if (v && i < 0) ids.push(a.id);
              if (!v && i >= 0) ids.splice(i, 1);
              A.updatePost(post.id, { alsoOn: ids }, { render: false });
              A.render(); redraw();
            }, 'also-' + a.id));
        });
        body.appendChild(field('Pubblica anche su', cross,
          'Lo stesso contenuto compare nel feed di quegli account. Resta un record solo: la caption corretta una volta è corretta ovunque.'));
      }

      /* ticks */
      var ticks = A.el('div', { style: 'display:flex;flex-direction:column;gap:7px;' }, [
        tickRow('Pubblica anche nelle Stories', 'Crea e tiene allineata una story collegata a questo contenuto.',
          post.inStories, function (v) { A.setInStories(post.id, v); redraw(); }, 'stories'),
        tickRow('Mostra la data in griglia', null,
          post.showDate, function (v) { A.updatePost(post.id, { showDate: v }, { render: false }); A.render(); redraw(); }, 'showdate')
      ]);
      body.appendChild(field('Opzioni', ticks));

      /* status, notes, history */
      var st = A.statusOf(post.status);
      body.appendChild(field('Stato', A.el('button', {
        type: 'button', class: 'btn',
        style: 'width:100%;justify-content:flex-start;border-color:' + st.c + ';background:' + st.sub + ';',
        html: '<span style="width:8px;height:8px;border-radius:50%;background:' + st.c + '"></span>' + A.esc(st.label),
        onclick: function () { A.openStatusModal(post); }
      }), post.revisions ? post.revisions + (post.revisions === 1 ? ' revisione richiesta dal cliente' : ' revisioni richieste dal cliente') : null));

      var note = A.el('textarea', { class: 'ta', rows: '3', placeholder: 'Visibile solo allo studio' });
      note.value = post.internalNote || '';
      note.addEventListener('input', function () { post.internalNote = note.value; A.commit({ render: false }); });
      body.appendChild(field('Nota interna', note));

      if (post.clientNote) {
        body.appendChild(A.el('div', {
          class: 'pv-note',
          html: '<b>' + A.esc(client.name) + (post.clientNoteAt ? ' · ' + new Date(post.clientNoteAt).toLocaleDateString('it-IT') : '') + '</b>' + A.esc(post.clientNote)
        }));
      }

      if (post.history && post.history.length) {
        var hist = A.el('div', { style: 'display:flex;flex-direction:column;gap:6px;' });
        post.history.slice().reverse().forEach(function (h) {
          var to = A.statusOf(h.to);
          hist.appendChild(A.el('div', { style: 'display:flex;gap:8px;font-size:11.5px;color:var(--ink-2);line-height:1.45;' }, [
            A.el('span', { style: 'width:7px;height:7px;border-radius:50%;background:' + to.c + ';margin-top:5px;flex:0 0 auto;' }),
            A.el('span', {}, [
              A.el('b', { text: to.label }),
              ' · ' + (h.by === 'cliente' ? 'cliente' : 'studio') + ' · ' + new Date(h.at).toLocaleDateString('it-IT'),
              h.note ? A.el('div', { style: 'color:var(--ink-3);', text: h.note }) : null
            ])
          ]));
        });
        body.appendChild(field('Storico', hist));
      }
    }

    build();

    function cancel() {
      var live = A.get(postId);
      if (!live) return;
      if (opts.isNew) {
        A.S.posts = A.S.posts.filter(function (p) { return p.id !== postId; });
        var mirror = A.mirrorOf(postId);
        if (mirror) A.S.stories = A.S.stories.filter(function (x) { return x.id !== mirror.id; });
      } else {
        A.restore(live, snapshot);
        A.syncMirror(postId);
      }
      A.index();
      A.setSaveState(wasDirty ? 'dirty' : 'saved');
      A.render();
    }

    A.modal({
      title: opts.isNew ? 'Nuovo contenuto' : 'Contenuto',
      wide: true,
      body: [body],
      onClose: function () { if (!closedBySave) cancel(); },
      actions: [
        {
          label: 'Elimina', kind: 'danger', keepOpen: true, run: function () {
            A.confirm({
              title: 'Eliminare il contenuto?',
              body: 'L\'eliminazione viene scritta subito. Puoi annullarla dal messaggio in basso.',
              ok: 'Elimina', danger: true,
              run: function () { closedBySave = true; A.closeModal(); A.deletePost(postId); A.save({ quiet: true }); }
            });
            return false;
          }
        },
        { label: 'Anteprima', keepOpen: true, run: function () { A.openPostView(A.visiblePosts(), postId); } },
        { label: 'Annulla', run: function () { closedBySave = false; } },
        {
          label: 'Salva', kind: 'primary', run: function () {
            closedBySave = true;
            delete A.get(postId)._partnerOpen;
            A.save({ quiet: true });
            A.toast(opts.isNew ? 'Contenuto creato' : 'Contenuto salvato');
          }
        }
      ]
    });
  };

  /* ── Toolbar ──────────────────────────────────────────── */

  /* ── Filter panel ─────────────────────────────────────
     The filters used to sit in the toolbar as a wall of chips that
     wrapped onto a second row and pushed the grid down. They live
     behind one button now: the button says how many are on, so the
     state is never hidden, and the grid starts higher up.
  ──────────────────────────────────────────────────────── */

  function filterPanel(host, close) {
    var posts = A.curPosts();
    var client = A.curClient();
    var f = A.ui.filters;

    function section(title) {
      host.appendChild(A.el('div', { class: 'pop-sec', text: title }));
    }

    function option(cfg) {
      var row = A.el('button', {
        type: 'button', class: 'pop-opt', 'aria-pressed': cfg.on ? 'true' : 'false',
        disabled: cfg.n === 0 && !cfg.on ? true : null,
        onclick: function () { cfg.toggle(); A.render(); A.popover(A.$('#filter-btn'), filterPanel); }
      }, [
        A.el('span', { class: 'box', html: A.icon('check', 11) }),
        cfg.color ? A.el('span', { class: 'dot', style: 'background:' + cfg.color + ';' }) : null,
        A.el('span', { class: 'nm', text: cfg.label }),
        A.el('span', { class: 'n', text: String(cfg.n) })
      ]);
      host.appendChild(row);
    }

    section('Stato');
    A.STATUS.forEach(function (st) {
      option({
        label: st.label, color: st.c,
        n: posts.filter(function (p) { return p.status === st.key; }).length,
        on: (f.status || []).indexOf(st.key) >= 0,
        toggle: function () { A.toggleFilter('status', st.key); }
      });
    });

    section('Natura');
    option({
      label: 'Sponsorizzati',
      n: posts.filter(function (p) { return p.paid; }).length,
      on: f.paid, toggle: function () { f.paid = !f.paid; }
    });
    option({
      label: 'In collaborazione',
      n: posts.filter(function (p) { return (p.partner || '').trim(); }).length,
      on: f.partner, toggle: function () { f.partner = !f.partner; }
    });

    var cats = A.categoriesOf(client.id);
    if (cats.length) {
      section('Categoria');
      cats.forEach(function (c) {
        option({
          label: c.name, color: c.color,
          n: posts.filter(function (p) { return p.categoryId === c.id; }).length,
          on: (f.categoryId || []).indexOf(c.id) >= 0,
          toggle: function () { A.toggleFilter('categoryId', c.id); }
        });
      });
    }

    var n = A.filterCount();
    host.appendChild(A.el('div', { class: 'pop-foot' }, [
      A.el('span', { class: 'hint', text: n ? A.visiblePosts().length + ' di ' + posts.length + ' visibili' : 'Nessun filtro attivo' }),
      A.el('div', { class: 'bar-space' }),
      n ? A.el('button', {
        class: 'btn ghost sm', text: 'Azzera',
        onclick: function () { A.ui.filters = A.emptyFilters(); close(); A.render(); }
      }) : null
    ]));
  }

  /* ── Toolbar ──────────────────────────────────────────── */

  function toolbar() {
    var bar = A.el('div', { class: 'toolbar' });
    var posts = A.curPosts();
    var acc = A.curAccount();
    var client = A.curClient();
    if (!acc || !client) return bar;

    var counts = { foto: 0, reel: 0, carosello: 0, editoriale: 0 };
    posts.forEach(function (p) { counts[p.kind] = (counts[p.kind] || 0) + 1; });

    var stats = A.el('div', { class: 'toolbar-stats' });
    [['post', posts.length], ['reel', counts.reel], ['caroselli', counts.carosello], ['card', counts.editoriale]]
      .forEach(function (s) {
        stats.appendChild(A.el('span', { class: 'stat' }, [A.el('b', { text: String(s[1]) }), A.el('span', { text: s[0] })]));
      });
    bar.appendChild(stats);

    /* the format is a fact about the account, not a filter — it stays out
       in the open because it tells you how the grid is cropping */
    var fmt = A.formatOfAccount(acc);
    bar.appendChild(A.el('span', { class: 'bar-sep' }));
    bar.appendChild(A.el('button', {
      type: 'button', class: 'fmt-note', title: 'Formato impostato sull\'account — modificalo in Clienti',
      html: '<span class="dot" style="background:' + fmt.platform.color + '"></span>' +
            A.esc(acc.platform) + ' · ' + A.esc(fmt.sizeLabel) + ' · ' + fmt.w + '×' + fmt.h,
      onclick: function () { A.goClient(A.ui.clientId); }
    }));

    bar.appendChild(A.el('div', { class: 'bar-space' }));

    var active = A.filterCount();
    var fbtn = A.el('button', {
      type: 'button', id: 'filter-btn',
      class: 'btn sm' + (active ? ' on' : ''),
      html: A.icon('filter', 13) + 'Filtri' + (active ? '<span class="count">' + active + '</span>' : ''),
      onclick: function () { A.popover(fbtn, filterPanel); }
    });
    bar.appendChild(fbtn);

    [['date', 'Data'], ['caption', 'Testo']].forEach(function (t) {
      bar.appendChild(A.el('button', {
        type: 'button', class: 'toggle hide-sm', 'aria-pressed': A.ui.show[t[0]] ? 'true' : 'false',
        html: '<span class="led"></span>' + t[1],
        onclick: function () { A.ui.show[t[0]] = !A.ui.show[t[0]]; A.render(); }
      }));
    });

    bar.appendChild(A.el('button', {
      type: 'button', class: 'btn primary sm', html: A.icon('plus', 13) + 'Aggiungi', onclick: openAddMenu
    }));
    return bar;
  }

  function openAddMenu() {
    var grid = A.el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;' });
    A.KINDS.forEach(function (k) {
      grid.appendChild(A.el('button', {
        type: 'button',
        style: 'display:flex;flex-direction:column;align-items:flex-start;gap:7px;padding:14px;border:1px solid var(--rule);' +
               'border-radius:9px;background:var(--panel-2);text-align:left;font-size:13px;font-weight:600;color:var(--ink);',
        html: A.icon(k.icon, 17) + '<span>' + k.label + '</span>',
        onclick: function () {
          A.closeModal();
          var extra = {};
          if (k.key === 'carosello') {
            extra.slides = [{ id: A.uid('sl'), url: '', caption: '' }, { id: A.uid('sl'), url: '', caption: '' }];
          }
          if (k.key === 'editoriale') extra.editorial = { eyebrow: '', title: 'Scrivi il titolo', sub: '' };
          var p = A.addPost(k.key, extra);
          if (p) A.openPostEditor(p.id, { isNew: true });
        }
      }));
    });
    A.modal({ title: 'Nuovo contenuto', body: [grid] });
  }

  /* ── Grid ─────────────────────────────────────────────── */

  function grid() {
    var acc = A.curAccount();
    var wrap = A.el('div', { class: 'grid-wrap' });
    if (!acc) {
      wrap.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessun account selezionato' }),
        A.el('p', { text: 'Scegli un cliente e un account nella barra in alto per iniziare a comporre il mese.' })
      ]));
      return wrap;
    }

    var fmt = A.formatOfAccount(acc);
    var all = A.curPosts();
    var list = A.visiblePosts();

    if (!all.length) {
      wrap.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: A.monthLabel(A.ui.month) + ' è vuoto' }),
        A.el('p', { text: 'Aggiungi il primo contenuto: una foto, un reel, un carosello o una card di solo testo.' }),
        A.el('button', { class: 'btn primary', html: A.icon('plus', 13) + 'Aggiungi contenuto', onclick: openAddMenu })
      ]));
      return wrap;
    }

    var g = A.el('div', { class: 'grid', style: '--cols:' + fmt.cols + ';' });
    list.forEach(function (p) {
      g.appendChild(A.postCard(p, {
        onOpen: function (post) { A.openPostEditor(post.id); },
        onSelect: function (post) { A.openPostEditor(post.id); },
        onState: function (post) { A.openStatusModal(post); }
      }));
    });
    g.appendChild(A.el('button', {
      type: 'button', class: 'addcell', style: '--ratio:' + fmt.ratio + ';',
      html: A.icon('plus', 18) + '<span>Aggiungi</span>', onclick: openAddMenu
    }));
    wrap.appendChild(g);

    var foot = A.el('div', { style: 'margin-top:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-3);' });
    foot.appendChild(A.el('span', { text: 'Ordinati per data di pubblicazione. I contenuti senza data restano in fondo.' }));
    if (list.length < all.length) {
      foot.appendChild(A.el('span', { text: '·' }));
      foot.appendChild(A.el('span', { text: (all.length - list.length) + ' nascosti dai filtri' }));
      foot.appendChild(A.el('button', {
        class: 'btn ghost sm', text: 'Mostra tutti',
        onclick: function () { A.ui.filters = A.emptyFilters(); A.render(); }
      }));
    }
    wrap.appendChild(foot);
    return wrap;
  }

  /* Typing in the caption repaints only the card that changed. */
  function repaintCard(post) {
    var node = A.$('.card[data-id="' + post.id + '"]');
    if (!node) return;
    node.replaceWith(A.postCard(post, {
      onOpen: function (p) { A.openPostEditor(p.id); },
      onSelect: function (p) { A.openPostEditor(p.id); },
      onState: function (p) { A.openStatusModal(p); }
    }));
  }

  A.views = A.views || {};
  A.views.feed = function (host) {
    A.clear(host);
    host.appendChild(toolbar());
    var canvas = A.el('div', { class: 'canvas' });
    canvas.appendChild(grid());
    host.appendChild(canvas);
  };
})(window.IDE);
