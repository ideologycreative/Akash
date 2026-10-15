/* ============================================================
   Ideology — Home
   What needs attention this morning, across every client. The
   numbers are links: each one drops you into the exact account
   and month it counted.
   ============================================================ */

(function (A) {
  'use strict';

  function allAccounts() {
    var out = [];
    A.S.clients.forEach(function (c) {
      if (c.status === 'chiuso') return;
      (c.accounts || []).forEach(function (a) { out.push({ client: c, account: a }); });
    });
    return out;
  }

  function postsThisMonth() {
    var m = A.ui.month;
    var ids = {};
    allAccounts().forEach(function (x) { ids[x.account.id] = 1; });
    return A.S.posts.filter(function (p) { return p.month === m && ids[p.accountId]; });
  }

  function goTo(filterStatus) {
    return function () {
      var posts = postsThisMonth().filter(function (p) { return !filterStatus || p.status === filterStatus; });
      if (!posts.length) { A.toast('Niente da mostrare in ' + A.monthLabel(A.ui.month).toLowerCase()); return; }
      var ctx = A.accountCtx(posts[0].accountId);
      if (ctx) { A.ui.clientId = ctx.client.id; A.ui.accountId = ctx.account.id; }
      A.ui.section = 'contenuti';
      A.ui.tab = filterStatus === 'in_revisione' || filterStatus === 'da_approvare' ? 'anteprima' : 'feed';
      A.ui.filters = A.emptyFilters();
      if (filterStatus) A.ui.filters.status = [filterStatus];
      A.ui.previewFilter = filterStatus || '';
      A.ui.previewMode = 'studio';
      A.render();
    };
  }

  function kpis() {
    var posts = postsThisMonth();
    var box = A.el('div', { class: 'kpis' });
    var rows = [
      { n: posts.filter(function (p) { return p.status === 'in_revisione'; }).length,
        label: 'Da rilavorare', sub: 'il cliente ha chiesto modifiche', c: 'var(--st-revisione)', f: 'in_revisione' },
      { n: posts.filter(function (p) { return p.status === 'da_approvare'; }).length,
        label: 'In attesa del cliente', sub: 'inviati, nessuna risposta', c: 'var(--st-approvare)', f: 'da_approvare' },
      { n: posts.filter(function (p) { return p.status === 'bozza'; }).length,
        label: 'Bozze da inviare', sub: 'non ancora visibili al cliente', c: 'var(--st-bozza)', f: 'bozza' },
      { n: posts.filter(function (p) { return p.status === 'approvato'; }).length,
        label: 'Pronti a uscire', sub: 'approvati, non pubblicati', c: 'var(--st-approvato)', f: 'approvato' }
    ];
    rows.forEach(function (r) {
      box.appendChild(A.el('button', { type: 'button', class: 'kpi', style: '--c:' + r.c + ';', onclick: goTo(r.f) }, [
        A.el('b', { text: String(r.n) }),
        A.el('span', { text: r.label }),
        A.el('em', { text: r.sub })
      ]));
    });
    return box;
  }

  function clientList() {
    var col = A.el('div');
    col.appendChild(A.el('div', { class: 'sec-title', text: 'Clienti · ' + A.monthLabel(A.ui.month) }));
    var any = false;
    A.S.clients.forEach(function (c) {
      (c.accounts || []).forEach(function (acc) {
        any = true;
        var posts = A.postsIn(acc.id, A.ui.month);
        var counts = {};
        A.STATUS.forEach(function (s) { counts[s.key] = posts.filter(function (p) { return p.status === s.key; }).length; });
        var bars = A.el('div', { class: 'bars', title: posts.length + ' contenuti' });
        A.STATUS.forEach(function (s) {
          if (!counts[s.key]) return;
          bars.appendChild(A.el('i', {
            style: 'flex:' + counts[s.key] + ';background:' + s.c + ';',
            title: counts[s.key] + ' ' + s.label.toLowerCase()
          }));
        });
        if (!posts.length) bars.appendChild(A.el('i', { style: 'flex:1;background:var(--rule);' }));

        var fmt = A.formatOfAccount(acc);
        col.appendChild(A.el('button', {
          type: 'button', class: 'crow',
          onclick: function () {
            A.ui.clientId = c.id; A.ui.accountId = acc.id;
            A.ui.section = 'contenuti'; A.ui.tab = 'feed';
            A.ui.filters = A.emptyFilters();
            A.render();
          }
        }, [
          A.el('span', { class: 'mark', style: 'background:' + A.markColor(c.id) + ';', text: A.initials(c.name) }),
          A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
            A.el('span', { class: 'nm', style: 'display:block;', text: c.name }),
            A.el('span', { class: 'sub', text: acc.platform + ' · ' + acc.handle + ' · ' + fmt.sizeLabel })
          ]),
          posts.length ? A.el('span', { class: 'sub', style: 'min-width:54px;text-align:right;', text: posts.length + ' pezzi' })
                       : A.el('span', { class: 'sub', style: 'min-width:54px;text-align:right;', text: 'vuoto' }),
          bars
        ]));
      });
    });
    if (!any) {
      col.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessun cliente' }),
        A.el('p', { text: 'Aggiungine uno dalla sezione Clienti per cominciare.' }),
        A.el('button', { class: 'btn primary', text: 'Vai a Clienti', onclick: function () { A.ui.section = 'clienti'; A.render(); } })
      ]));
    }
    return col;
  }

  function goals() {
    var col = A.el('div');
    var cl = A.curClient();
    var acc = A.curAccount();
    if (!cl || !acc) return col;
    col.appendChild(A.el('div', { class: 'sec-title', text: 'Impegni del mese · ' + cl.name }));
    A.progressOf(acc.id, A.ui.month, cl.id).forEach(function (g) {
      if (!g.goal && !g.done) return;
      var pct = g.goal ? Math.min(100, Math.round(g.done / g.goal * 100)) : 100;
      col.appendChild(A.el('div', { class: 'goal' }, [
        A.el('span', { class: 'gn', text: g.label }),
        A.el('span', { class: 'track' }, [A.el('i', { style: 'width:' + pct + '%;background:' + (g.goal && g.done >= g.goal ? 'var(--st-approvato)' : 'var(--ink)') + ';' })]),
        A.el('span', { class: 'done', text: g.goal ? g.done + ' / ' + g.goal : String(g.done) })
      ]));
    });
    return col;
  }

  function activity() {
    var col = A.el('div', { style: 'margin-top:26px;' });
    col.appendChild(A.el('div', { class: 'sec-title', text: 'Ultimi movimenti' }));
    var rows = A.recentActivity(9);
    if (!rows.length) {
      col.appendChild(A.el('p', { style: 'font-size:12px;color:var(--ink-3);margin:0;', text: 'Ancora nessun passaggio di stato registrato.' }));
      return col;
    }
    rows.forEach(function (r) {
      var st = A.statusOf(r.to);
      var ctx = A.accountCtx(r.accountId);
      var when = r.at ? new Date(r.at) : null;
      col.appendChild(A.el('button', {
        type: 'button', class: 'feedline',
        style: 'width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--rule);',
        onclick: function () {
          if (ctx) { A.ui.clientId = ctx.client.id; A.ui.accountId = ctx.account.id; }
          A.ui.section = 'contenuti'; A.ui.tab = 'feed';
          A.ui.filters = A.emptyFilters();
          A.render();
          A.openPostEditor(r.postId);
        }
      }, [
        A.el('span', { class: 'pip', style: 'background:' + st.c + ';' }),
        A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
          A.el('span', {}, [
            A.el('b', { text: r.by === 'cliente' ? (ctx ? ctx.client.name : 'Il cliente') : 'Lo studio' }),
            ' · ' + st.label.toLowerCase()
          ]),
          r.note ? A.el('div', { style: 'color:var(--ink-3);font-size:11.5px;', text: r.note }) : null,
          A.el('div', { class: 'when', text: when ? when.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '' })
        ])
      ]));
    });
    return col;
  }

  A.views = A.views || {};
  A.views.home = function (host) {
    A.clear(host);

    var head = A.el('div', { class: 'sec-head' }, [
      A.el('div', {}, [
        A.el('h1', { text: 'Buongiorno' }),
        A.el('p', { text: A.S.clients.length + ' clienti · ' + A.monthLabel(A.ui.month) })
      ]),
      A.el('div', { class: 'bar-space' }),
      A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Mese precedente', html: A.icon('left', 14), onclick: function () { A.ui.month = A.shiftMonth(A.ui.month, -1); A.render(); } }),
      A.el('span', { style: 'font-size:12px;font-weight:600;min-width:104px;text-align:center;', text: A.monthLabel(A.ui.month) }),
      A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Mese successivo', html: A.icon('right', 14), onclick: function () { A.ui.month = A.shiftMonth(A.ui.month, 1); A.render(); } })
    ]);
    host.appendChild(head);

    var scroll = A.el('div', { class: 'canvas', style: 'padding:0;' });
    var page = A.el('div', { class: 'home' });
    page.appendChild(kpis());
    var board = A.el('div', { class: 'board' });
    board.appendChild(clientList());
    var right = A.el('div');
    right.appendChild(goals());
    right.appendChild(activity());
    board.appendChild(right);
    page.appendChild(board);
    scroll.appendChild(page);
    host.appendChild(scroll);
  };
})(window.IDE);
