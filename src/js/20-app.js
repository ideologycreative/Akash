/* ============================================================
   Ideology — shell
   Left rail for the three areas. The context bar (client,
   account, month) belongs to Contenuti only; Home and Clienti
   draw their own headers.
   ============================================================ */

(function (A) {
  'use strict';

  var TABS = [
    { key: 'feed',       label: 'Feed' },
    { key: 'stories',    label: 'Stories' },
    { key: 'ugc',        label: 'UGC' },
    { key: 'calendario', label: 'Calendario' },
    { key: 'anteprima',  label: 'Anteprima' }
  ];

  var SECTIONS = [
    { key: 'home',      label: 'Home',      icon: 'grid' },
    { key: 'clienti',   label: 'Clienti',   icon: 'users' },
    { key: 'contenuti', label: 'Contenuti', icon: 'image' }
  ];

  /* ── Left rail ────────────────────────────────────────── */

  function pendingAcrossStudio() {
    var ids = {};
    A.S.clients.forEach(function (c) {
      if (c.status === 'chiuso') return;
      (c.accounts || []).forEach(function (a) { ids[a.id] = 1; });
    });
    return A.S.posts.filter(function (p) {
      return p.month === A.ui.month && ids[p.accountId] &&
        (p.status === 'in_revisione' || p.status === 'da_approvare');
    }).length;
  }

  function railItem(cfg) {
    var btn = A.el('button', {
      type: 'button', class: 'rail-item', title: cfg.title || cfg.label,
      'aria-current': cfg.current ? 'page' : null,
      onclick: cfg.onclick
    });
    var i = A.el('span', { class: 'ic', style: 'display:inline-flex;' });
    i.innerHTML = A.icon(cfg.icon, 16);
    btn.appendChild(i);
    btn.appendChild(A.el('span', { class: 'rtxt', text: cfg.label }));
    if (cfg.badge) btn.appendChild(A.el('span', { class: 'n', text: String(cfg.badge) }));
    return btn;
  }

  function rail() {
    var r = A.el('nav', { class: 'rail', 'aria-label': 'Sezioni' });

    r.appendChild(A.el('div', { class: 'rail-brand' }, [
      A.el('span', { class: 'mark', text: 'I' }),
      A.el('span', {}, [
        A.el('div', { class: 'nm', text: 'Ideology' }),
        A.el('div', { class: 'sub', text: 'ideology.it' })
      ])
    ]));

    var pending = pendingAcrossStudio();
    SECTIONS.forEach(function (s) {
      r.appendChild(railItem({
        label: s.label, icon: s.icon,
        current: A.ui.section === s.key,
        badge: (s.key === 'home' || s.key === 'contenuti') ? pending : 0,
        onclick: function () {
          A.ui.section = s.key;
          if (s.key === 'clienti') A.ui.clientDetailId = null;
          A.render();
        }
      }));
    });

    var foot = A.el('div', { class: 'rail-foot' });
    foot.appendChild(railItem({ label: 'Backup', icon: 'down', title: 'Dati e backup', onclick: dataMenu }));

    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    foot.appendChild(railItem({
      label: dark ? 'Chiaro' : 'Scuro', icon: dark ? 'sun' : 'moon', title: 'Tema chiaro o scuro',
      onclick: function () { toggleTheme(); }
    }));

    if (A.remote && A.remote.on) {
      foot.appendChild(railItem({ label: 'Team', icon: 'users', title: 'Studio, colleghi e accesso', onclick: function () { A.session.openTeam(); } }));
    }

    /* Autosave: no Salva button, just the state of the last save. */
    var saved = A.el('button', {
      class: 'saved', id: 'save-state', type: 'button', style: 'padding:7px 10px;',
      onclick: function () { if (A.ui.saveState === 'error' || A.ui.saveState === 'offline') A.saveNow(); }
    });
    foot.appendChild(saved);
    paintSaveState(saved);

    r.appendChild(foot);
    return r;
  }

  var SAVE_LABELS = {
    saved:    ['Salvato', 'Tutto salvato'],
    pending:  ['Modifiche…', 'Salvataggio tra un attimo'],
    saving:   ['Salvataggio…', 'Salvataggio in corso'],
    offline:  ['Offline', 'Connessione assente: riprovo da solo. Clic per riprovare ora'],
    conflict: ['Da decidere', 'Un collega ha cambiato la stessa cosa: scegli in basso quale tenere'],
    error:    ['Non salvato', 'Qualcosa non è stato salvato. Clic per riprovare']
  };

  function paintSaveState(node) {
    var st = A.ui.saveState || 'saved';
    var l = SAVE_LABELS[st] || SAVE_LABELS.saved;
    node.setAttribute('data-s', st);
    node.title = l[1];
    A.clear(node);
    node.appendChild(A.el('span', { class: 'pip' }));
    node.appendChild(A.el('span', { class: 'rtxt', text: l[0] }));
  }

  /* Called by setSaveState: repaints the indicator alone, so typing
     never triggers a whole-page render. */
  A.renderSaveState = function () {
    var n = document.getElementById('save-state');
    if (n) paintSaveState(n);
  };

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var isDark = cur === 'dark';
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ideology.theme', next); } catch (e) {}
    A.render();
  }

  /* ── Context bar (Contenuti only) ─────────────────────── */

  function contextBar() {
    var bar = A.el('div', { class: 'bar' });
    var client = A.curClient();
    var acc = A.curAccount();

    {
      var cw = A.el('span', { class: 'ctx-wrap' });
      var cs = A.el('select', { class: 'ctx', 'aria-label': 'Cliente' });
      A.S.clients.forEach(function (c) {
        cs.appendChild(A.el('option', { value: c.id, text: c.name, selected: A.ui.clientId === c.id }));
      });
      cs.addEventListener('change', function () { selectClient(cs.value); });
      cw.appendChild(cs);
      bar.appendChild(cw);
    }

    if (client && client.accounts.length > 1) {
      var aw = A.el('span', { class: 'ctx-wrap' });
      var as = A.el('select', { class: 'ctx', 'aria-label': 'Account' });
      client.accounts.forEach(function (a) {
        as.appendChild(A.el('option', {
          value: a.id, text: a.platform + ' · ' + a.handle, selected: A.ui.accountId === a.id
        }));
      });
      as.addEventListener('change', function () {
        A.ui.accountId = as.value;
        A.ui.selectedPostId = null; A.ui.selectedStoryId = null; A.ui.selectedSlotId = null;
        A.render();
      });
      aw.appendChild(as);
      bar.appendChild(aw);
    } else if (acc) {
      bar.appendChild(A.el('span', { class: 'ctx', style: 'font-weight:600;', text: acc.platform + ' · ' + acc.handle }));
    }

    bar.appendChild(A.el('span', { class: 'bar-sep' }));
    bar.appendChild(A.el('div', { class: 'monthnav' }, [
      A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Mese precedente', html: A.icon('left', 14), onclick: function () { A.ui.month = A.shiftMonth(A.ui.month, -1); A.render(); } }),
      A.el('span', { class: 'm', text: A.monthLabel(A.ui.month) }),
      A.el('button', { class: 'btn ghost icon sm', 'aria-label': 'Mese successivo', html: A.icon('right', 14), onclick: function () { A.ui.month = A.shiftMonth(A.ui.month, 1); A.render(); } })
    ]));
    if (A.ui.month !== A.thisMonth()) {
      bar.appendChild(A.el('button', { class: 'btn ghost sm hide-sm', text: 'Oggi', onclick: function () { A.ui.month = A.thisMonth(); A.render(); } }));
    }

    bar.appendChild(A.el('div', { class: 'bar-space' }));

    if (client) {
      bar.appendChild(A.el('button', {
        class: 'btn ghost sm hide-sm', html: A.icon('pencil', 12) + 'Scheda cliente',
        onclick: function () { A.goClient(client.id); }
      }));
    }
    return bar;
  }

  function selectClient(id) {
    A.ui.clientId = id;
    var c = A.get(id);
    A.ui.accountId = c && c.accounts[0] ? c.accounts[0].id : null;
    A.ui.selectedPostId = null;
    A.ui.selectedStoryId = null;
    A.ui.selectedSlotId = null;
    A.render();
  }

  /* ── Data menu ────────────────────────────────────────── */

  function dataMenu() {
    var fileInput = A.el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { A.importAll(fr.result); A.closeModal(); A.toast('Backup importato'); }
        catch (e) { A.toast('File non valido: ' + e.message); }
      };
      fr.readAsText(f);
    });

    var counts = A.serialize().counts;
    var shared = !!(A.remote && A.remote.on);
    var lines = [
      ['Clienti', counts.clients],
      ['Contenuti feed', counts.posts],
      ['Stories e storyboard', counts.stories],
      ['Slot UGC', counts.ugcSlots],
      ['Creator', counts.creators]
    ];
    var table = A.el('div', { style: 'display:flex;flex-direction:column;gap:5px;' });
    lines.forEach(function (l) {
      table.appendChild(A.el('div', {
        style: 'display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-2);' +
               'padding:5px 0;border-bottom:1px solid var(--rule);'
      }, [A.el('span', { text: l[0] }), A.el('b', { text: String(l[1]) })]));
    });

    A.modal({
      title: 'Dati e backup',
      body: [
        A.el('p', {
          style: 'margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-2);',
          text: shared
            ? 'Il lavoro è salvato nel database dello studio e lo vedono tutti i colleghi. Il backup è una copia in un file, da tenere da parte.'
            : 'Tutto il lavoro resta in questo browser. Esporta un backup prima di cambiare macchina, o per passare il piano a un collega.'
        }),
        table,
        A.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
          A.el('button', { class: 'btn', html: A.icon('down', 13) + 'Esporta backup', onclick: A.exportAll }),
          shared ? null : A.el('button', { class: 'btn', html: A.icon('up', 13) + 'Importa backup', onclick: function () { fileInput.click(); } }),
          fileInput
        ])
      ],
      actions: shared ? [{ label: 'Chiudi', kind: 'primary' }] : [
        {
          label: 'Ricarica dati demo', kind: 'danger', keepOpen: true, run: function () {
            A.confirm({
              title: 'Ricaricare i dati demo?',
              body: 'Il lavoro salvato in questo browser viene sostituito dallo studio di esempio. Esporta prima un backup se ti serve.',
              ok: 'Ricarica', danger: true,
              run: function () { A.resetAll(); A.toast('Dati demo ricaricati'); }
            });
            return false;
          }
        },
        { label: 'Chiudi', kind: 'primary' }
      ]
    });
  }

  /* ── Tabs ─────────────────────────────────────────────── */

  function tabBar() {
    var bar = A.el('div', { class: 'tabs', role: 'tablist' });
    var posts = A.curPosts();
    var counts = {
      feed: posts.length,
      stories: A.curStories().length,
      ugc: A.curUgc().length,
      calendario: 0,
      anteprima: posts.filter(function (p) { return p.status === 'da_approvare' || p.status === 'in_revisione'; }).length
    };
    TABS.forEach(function (t) {
      var btn = A.el('button', {
        class: 'tab', role: 'tab', 'aria-selected': A.ui.tab === t.key ? 'true' : 'false',
        onclick: function () { A.ui.tab = t.key; A.render(); }
      }, [A.el('span', { text: t.label })]);
      if (counts[t.key]) btn.appendChild(A.el('span', { class: 'count', text: String(counts[t.key]) }));
      bar.appendChild(btn);
    });
    return bar;
  }

  /* ── Render ───────────────────────────────────────────── */

  A.render = function () {
    var root = A.$('#root');
    if (!root) return;

    if (!A.get(A.ui.clientId)) {
      var c0 = A.S.clients[0];
      A.ui.clientId = c0 ? c0.id : null;
      A.ui.accountId = c0 && c0.accounts[0] ? c0.accounts[0].id : null;
    }
    var client = A.curClient();
    if (client && !A.accountCtx(A.ui.accountId)) {
      A.ui.accountId = client.accounts[0] ? client.accounts[0].id : null;
    }

    var old = A.$('.canvas') || A.$('.preview-scroll');
    var scrollTop = old ? old.scrollTop : 0;

    A.clear(root);
    root.appendChild(rail());

    var main = A.el('div', { class: 'main' });

    if (A.ui.section === 'contenuti') {
      main.appendChild(contextBar());
      main.appendChild(tabBar());
      var pages = A.el('div', { class: 'pages' });
      var page = A.el('div', { class: 'page on' });
      (A.views[A.ui.tab] || A.views.feed)(page);
      pages.appendChild(page);
      main.appendChild(pages);
    } else {
      (A.views[A.ui.section] || A.views.home)(main);
    }

    root.appendChild(main);

    var fresh = A.$('.canvas') || A.$('.preview-scroll');
    if (fresh && scrollTop) fresh.scrollTop = scrollTop;
  };

  /* ── Boot ─────────────────────────────────────────────── */

  /* A client link must never open the studio. If one arrives here —
     an old link, or a host that served this page for a path it did
     not recognise — the studio does not render at all. It says where
     the link was meant to go and stops, because the alternative is
     handing a client the whole tool. */
  function clientLinkArrived() {
    var m = /[?&](?:c|cliente)=([^&]+)/.exec(location.search) || /[#&]c=([^&]+)/.exec(location.hash);
    if (!m) return false;

    var target = new URL('cliente.html#c=' + m[1], document.baseURI).href;
    var root = A.$('#root');
    A.clear(root);
    root.appendChild(A.el('div', { class: 'gate' }, [
      A.el('div', { class: 'gate-box' }, [
        A.el('span', { class: 'gate-mark', text: 'I' }),
        A.el('h1', { text: 'Questo è un link cliente' }),
        A.el('p', { text: 'L\'anteprima cliente è una pagina a parte. Questo indirizzo apre lo studio, quindi non prosegue da solo.' }),
        A.el('a', { class: 'btn primary', href: target, text: 'Apri l\'anteprima cliente' }),
        A.el('code', { class: 'gate-url', text: target })
      ])
    ]));
    return true;
  }

  A.boot = function () {
    try {
      var savedTheme = localStorage.getItem('ideology.theme');
      if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (e) {}

    if (clientLinkArrived()) return;

    if (A.remote && A.remote.misconfigured) {
      A.session.problem('Configurazione da correggere', A.remote.misconfigured);
      return;
    }
    if (A.remote && A.remote.on) { A.session.start(); return; }

    if (!A.load()) { A.seed(); A.save({ quiet: true }); }
    A.index();
    A.finishBoot();
  };

  /* Common to both modes, once the data is in memory. */
  A.finishBoot = function () {
    var c = A.get(A.ui.clientId) ? null : A.S.clients[0];
    if (c) { A.ui.clientId = c.id; A.ui.accountId = c.accounts[0] ? c.accounts[0].id : null; }
    A.ui.section = 'home';
    A.setSaveState('saved');
    A.render();
  };

  /* Leaving the page. Alone, the browser's storage is synchronous, so the
     last keystrokes are written on the spot. Shared, the save is a
     request that may not finish in time — so the browser asks first. */
  window.addEventListener('beforeunload', function (e) {
    if (!A.dirty) return;
    var shared = A.remote && A.remote.on;
    A.saveNow();
    if (!shared) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', A.boot);
  } else {
    A.boot();
  }
})(window.IDE);
