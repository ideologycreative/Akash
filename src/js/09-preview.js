/* ============================================================
   Ideology — Anteprima (studio)

   The month as a profile: header, then the grid exactly as the
   account will look. Clicking a tile opens the post the way
   someone actually reads it — media on the left, everything
   written about it on the right.

   This screen is for the studio. The client-facing version is
   a separate surface opened by the share link; the two are kept
   apart on purpose so neither has to compromise for the other.
   ============================================================ */

(function (A) {
  'use strict';

  function visible() {
    var all = A.curPosts();
    if (A.ui.previewFilter) all = all.filter(function (p) { return p.status === A.ui.previewFilter; });
    return all;
  }

  /* ── Toolbar ──────────────────────────────────────────── */

  function toolbar() {
    var bar = A.el('div', { class: 'toolbar' });
    var client = A.curClient();
    var acc = A.curAccount();

    bar.appendChild(A.el('span', {
      style: 'font-size:12px;font-weight:600;color:var(--ink-3);',
      text: 'Il mese come apparirà sul profilo'
    }));
    bar.appendChild(A.el('div', { class: 'bar-space' }));

    bar.appendChild(A.el('button', {
      class: 'btn sm', html: A.icon('pencil', 12) + 'Profilo', onclick: function () { editProfile(acc); }
    }));
    bar.appendChild(A.el('button', {
      class: 'btn sm hide-sm', html: A.icon('link', 12) + 'Copia link cliente',
      onclick: function () {
        var url = A.clientUrl(client);
        A.copy(url).then(function (ok) { A.toast(ok ? 'Link copiato negli appunti' : url); });
      }
    }));
    var drafts = A.curPosts().filter(function (p) { return p.status === 'bozza'; }).length;
    bar.appendChild(A.el('button', {
      class: 'btn primary sm', html: A.icon('send', 12) + 'Invia in approvazione',
      disabled: drafts === 0 ? true : null,
      onclick: sendForApproval
    }));
    return bar;
  }

  function sendForApproval() {
    var drafts = A.curPosts().filter(function (p) { return p.status === 'bozza'; });
    if (!drafts.length) { A.toast('Nessuna bozza da inviare'); return; }
    A.confirm({
      title: 'Inviare ' + drafts.length + (drafts.length === 1 ? ' contenuto' : ' contenuti') + ' al cliente?',
      body: 'Passano in "Da approvare" e compaiono nel link cliente. Le bozze restano fuori.',
      ok: 'Invia',
      run: function () {
        drafts.forEach(function (p) { A.setStatus(p.id, 'da_approvare', 'studio', ''); });
        A.saveNow();
        A.toast(drafts.length + ' contenuti inviati');
      }
    });
  }

  function editProfile(acc) {
    if (!acc) return;
    var h = A.el('input', { class: 'inp', value: acc.handle || '' });
    var f = A.el('input', { class: 'inp', type: 'number', value: acc.followers || 0 });
    var g = A.el('input', { class: 'inp', type: 'number', value: acc.following || 0 });
    var bio = A.el('textarea', { class: 'ta', rows: '4' });
    bio.value = acc.bio || '';
    var held = { snap: A.snap(acc) };
    var stopSnap = A.followSnapshot ? A.followSnapshot(acc.id, held) : function () {};
    function bind(input, write) {
      input.addEventListener('input', function () { write(); A.commit({ render: false }); });
    }
    bind(h, function () { acc.handle = h.value.trim(); });
    bind(f, function () { acc.followers = Number(f.value) || 0; });
    bind(g, function () { acc.following = Number(g.value) || 0; });
    bind(bio, function () { acc.bio = bio.value; });
    var prev = A.el('div', {
      style: 'width:54px;height:54px;border-radius:50%;overflow:hidden;background:var(--paper-2);border:1px solid var(--rule);' +
             'display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--ink-3);'
    });
    function paint() {
      A.clear(prev);
      if (acc.avatarUrl) prev.appendChild(A.el('img', { src: acc.avatarUrl, alt: '', style: 'width:100%;height:100%;object-fit:cover;' }));
      else prev.textContent = A.initials(A.curClient().name);
    }
    paint();

    A.modal({
      title: 'Profilo ' + (acc.platform || ''),
      body: [
        A.el('div', { style: 'display:flex;align-items:flex-start;gap:12px;' }, [
          prev,
          A.el('div', { style: 'flex:1 1 auto;min-width:0;' }, [
            A.mediaControl(acc.avatarUrl,
              function (u) { acc.avatarUrl = u; paint(); A.commit({ render: false }); },
              function () { acc.avatarUrl = ''; paint(); A.commit({ render: false }); })
          ])
        ]),
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Handle' }), h]),
        A.el('div', { class: 'row' }, [
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Follower' }), f]),
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Seguiti' }), g])
        ]),
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Bio' }), bio])
      ],
      onClose: function () { stopSnap(); A.render(); A.saveNow(); },
      actions: [
        {
          label: 'Annulla modifiche',
          run: function () { A.restore(acc, held.snap); A.commit(); A.saveNow(); }
        },
        { label: 'Fatto', kind: 'primary', run: function () {} }
      ]
    });
  }

  /* ── Pieces ───────────────────────────────────────────── */

  function stateBar() {
    var posts = A.curPosts();
    var bar = A.el('div', { class: 'statebar' });
    A.STATUS.forEach(function (st) {
      var n = posts.filter(function (p) { return p.status === st.key; }).length;
      bar.appendChild(A.el('button', {
        type: 'button', 'aria-pressed': A.ui.previewFilter === st.key ? 'true' : 'false',
        style: '--c:' + st.c + ';--sub:' + st.sub + ';',
        onclick: function () { A.ui.previewFilter = A.ui.previewFilter === st.key ? '' : st.key; A.render(); }
      }, [A.el('b', { text: String(n) }), A.el('span', { text: st.short })]));
    });
    return bar;
  }

  function profileBlock() {
    var acc = A.curAccount();
    var client = A.curClient();
    var posts = A.curPosts();
    var box = A.el('div', { class: 'profile' });
    var av = A.el('div', { class: 'av' });
    if (acc.avatarUrl) av.appendChild(A.el('img', { src: acc.avatarUrl, alt: '' }));
    else av.textContent = A.initials(client.name);
    box.appendChild(A.el('div', { class: 'profile-top' }, [
      av,
      A.el('div', { class: 'profile-nums' }, [
        A.el('div', {}, [A.el('b', { text: String(posts.length) }), A.el('span', { text: 'in piano' })]),
        A.el('div', {}, [A.el('b', { text: A.fmtNum(acc.followers) }), A.el('span', { text: 'follower' })]),
        A.el('div', {}, [A.el('b', { text: A.fmtNum(acc.following) }), A.el('span', { text: 'seguiti' })])
      ])
    ]));
    box.appendChild(A.el('div', { class: 'handle', text: acc.handle || client.name }));
    if (acc.bio) box.appendChild(A.el('div', { class: 'bio', text: acc.bio }));
    return box;
  }

  function mosaic(list) {
    var g = A.el('div', { class: 'pv-grid' });
    list.forEach(function (p) {
      var st = A.statusOf(p.status);
      var nat = A.natureOf(p);
      var cell = A.el('div', {
        class: 'pv-cell', style: '--ratio:' + A.ratioFor(p.accountId) + ';',
        role: 'button', tabindex: '0', 'aria-label': 'Apri il contenuto'
      });
      cell.appendChild(A.mediaFill(p));
      if (p.kind === 'reel' || p.kind === 'carosello') {
        cell.appendChild(A.el('span', { class: 'mk', html: A.icon(p.kind === 'reel' ? 'play' : 'layers', 14) }));
      }
      if (nat.short) {
        cell.appendChild(A.el('span', { class: 'mk badge ' + nat.cls, text: nat.short, title: nat.label }));
      }
      cell.appendChild(A.el('span', { class: 'st', style: 'background:' + st.c + ';' }));
      function open() { A.openPostView(list, p.id); }
      cell.addEventListener('click', open);
      cell.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      g.appendChild(cell);
    });
    return g;
  }

  /* ── View ─────────────────────────────────────────────── */

  A.views = A.views || {};
  A.views.anteprima = function (host) {
    A.clear(host);
    var client = A.curClient();
    var acc = A.curAccount();
    if (!client || !acc) {
      host.appendChild(A.el('div', { class: 'empty' }, [A.el('h4', { text: 'Nessun account selezionato' })]));
      return;
    }

    host.appendChild(toolbar());

    var scroll = A.el('div', { class: 'preview-scroll' });
    var stage = A.el('div', { class: 'stage' });
    stage.appendChild(stateBar());

    var list = visible();
    var sheet = A.el('div', { class: 'sheet' });
    sheet.appendChild(profileBlock());

    if (!list.length) {
      sheet.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessun contenuto' }),
        A.el('p', { text: 'Aggiungi contenuti dal Feed: qui vedi come si comporranno sul profilo.' })
      ]));
    } else {
      sheet.appendChild(mosaic(list));
    }

    stage.appendChild(sheet);
    stage.appendChild(A.el('div', { class: 'pv-foot' }, [
      A.el('div', { text: 'Clicca un contenuto per aprirlo · ' + A.monthLabel(A.ui.month) }),
      A.el('div', { class: 'sig', text: 'Ideology · ideology.it' })
    ]));
    scroll.appendChild(stage);
    host.appendChild(scroll);
  };
})(window.IDE);
