/* ============================================================
   Ideology — UGC
   The plan is keyed on the account id, not the client's name,
   so renaming a client never orphans a month of work. Slots,
   creators and briefs are one collection each with real ids.
   ============================================================ */

(function (A) {
  'use strict';

  var MODES = [
    { key: 'autonoma', label: 'Spontaneo' },
    { key: 'creator',  label: 'Creator' },
    { key: 'template', label: 'Template' }
  ];
  A.UGC_MODES = MODES;    // the database checks the same list
  function modeLabel(k) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].key === k) return MODES[i].label;
    return k;
  }

  function toolbar() {
    A.ui.ugcTab = A.ui.ugcTab || 'calendario';
    var bar = A.el('div', { class: 'toolbar' });
    var slots = A.curUgc();
    var client = A.curClient();

    var seg = A.el('div', { class: 'segment', style: 'max-width:340px;flex:0 0 auto;' });
    [['calendario', 'Calendario'], ['elenco', 'Elenco'], ['creator', 'Creator'], ['anno', 'Anno']].forEach(function (t) {
      seg.appendChild(A.el('button', {
        type: 'button', 'aria-pressed': A.ui.ugcTab === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { A.ui.ugcTab = t[0]; A.render(); }
      }));
    });
    bar.appendChild(seg);
    bar.appendChild(A.el('span', { class: 'bar-sep' }));

    var stats = A.el('div', { class: 'toolbar-stats' });
    A.UGC_STATUS.forEach(function (s) {
      var n = slots.filter(function (u) { return u.status === s.key; }).length;
      stats.appendChild(A.el('span', { class: 'stat' }, [
        A.el('b', { text: String(n), style: 'color:' + s.c }),
        A.el('span', { text: s.label.toLowerCase() })
      ]));
    });
    bar.appendChild(stats);
    bar.appendChild(A.el('div', { class: 'bar-space' }));

    if (A.ui.ugcTab === 'calendario' || A.ui.ugcTab === 'elenco') {
      var days = A.el('div', { class: 'daybtns hide-sm' });
      A.DAY_NAMES.forEach(function (d, i) {
        days.appendChild(A.el('button', {
          type: 'button', class: 'daybtn', text: d[0],
          title: d, 'aria-pressed': (A.S.prefs.ugcDays || []).indexOf(i) >= 0 ? 'true' : 'false',
          onclick: function () {
            var arr = (A.S.prefs.ugcDays || []).slice();
            var k = arr.indexOf(i);
            if (k >= 0) arr.splice(k, 1); else arr.push(i);
            A.S.prefs.ugcDays = arr;
            A.commit();
          }
        }));
      });
      bar.appendChild(days);
      bar.appendChild(A.el('button', { class: 'btn sm', text: 'Genera mese', onclick: A.generateUgcMonth }));
      bar.appendChild(A.el('button', { class: 'btn ghost sm', text: 'Pulisci vuoti', onclick: A.clearEmptyUgc }));
      bar.appendChild(A.el('button', {
        class: 'btn primary sm', html: A.icon('plus', 12) + 'Slot',
        onclick: function () { var s = A.addUgcSlot(A.ui.month + '-' + A.pad(new Date().getDate())); if (s) A.openSlotEditor(s.id, { isNew: true }); }
      }));
    }
    if (A.ui.ugcTab === 'creator' && client) {
      bar.appendChild(A.el('button', {
        class: 'btn primary sm', html: A.icon('plus', 12) + 'Creator',
        onclick: function () { editCreator(A.addCreator(client.id, { name: 'Nuovo creator' }), true); }
      }));
    }
    return bar;
  }

  /* ── Calendar ─────────────────────────────────────────── */

  function calendar() {
    var wrap = A.el('div', { class: 'cal' });
    var mk = A.ui.month.split('-');
    var y = parseInt(mk[0], 10), m = parseInt(mk[1], 10);
    var first = new Date(y, m - 1, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysIn = new Date(y, m, 0).getDate();
    var prevDays = new Date(y, m - 1, 0).getDate();
    var today = A.todayKey();

    var byDate = {};
    A.curUgc().forEach(function (u) { (byDate[u.date] = byDate[u.date] || []).push(u); });
    var postsByDate = {};
    A.curPosts().forEach(function (p) { if (p.date) (postsByDate[p.date] = postsByDate[p.date] || []).push(p); });
    var storiesByDate = {};
    A.curStories().forEach(function (s) { if (s.date) (storiesByDate[s.date] = storiesByDate[s.date] || []).push(s); });

    var head = A.el('div', { class: 'cal-head' });
    A.DAY_NAMES.forEach(function (d) { head.appendChild(A.el('div', { class: 'cal-dh', text: d })); });
    wrap.appendChild(head);

    var grid = A.el('div', { class: 'cal-grid' });
    var cells = Math.ceil((startDow + daysIn) / 7) * 7;
    var day = 1, next = 1;

    for (var i = 0; i < cells; i++) {
      var off = false, dd, mm = m, yy = y;
      if (i < startDow) { dd = prevDays - startDow + i + 1; mm = m - 1; off = true; if (mm < 1) { mm = 12; yy = y - 1; } }
      else if (day > daysIn) { dd = next++; mm = m + 1; off = true; if (mm > 12) { mm = 1; yy = y + 1; } }
      else dd = day++;

      var iso = yy + '-' + A.pad(mm) + '-' + A.pad(dd);
      var cell = A.el('button', {
        type: 'button',
        class: 'cal-day' + (off ? ' off' : '') + (iso === today ? ' today' : ''),
        dataset: { date: iso }
      });
      cell.appendChild(A.el('span', { class: 'd', text: String(dd) }));

      if (!off) {
        (postsByDate[iso] || []).slice(0, 1).forEach(function (p) {
          cell.appendChild(A.el('span', {
            class: 'ev', style: '--c:var(--ink-3);',
            text: p.kind === 'reel' ? 'Reel in feed' : 'Post in feed'
          }));
        });
        (storiesByDate[iso] || []).slice(0, 1).forEach(function (s) {
          cell.appendChild(A.el('span', { class: 'ev', style: '--c:var(--cobalt);', text: s.title || 'Story' }));
        });
        (byDate[iso] || []).slice(0, 2).forEach(function (u) {
          var st = A.ugcStatusOf(u.status);
          cell.appendChild(A.el('span', {
            class: 'ev', style: '--c:' + st.c + ';',
            html: '<span class="dot"></span>' + A.esc(u.brief || modeLabel(u.mode))
          }));
        });
        var extra = (byDate[iso] || []).length - 2;
        if (extra > 0) cell.appendChild(A.el('span', { class: 'cal-more', text: '+' + extra }));
      }

      (function (isoDate, isOff) {
        cell.addEventListener('click', function () {
          if (isOff) return;
          var existing = byDate[isoDate] || [];
          if (existing.length) { A.openSlotEditor(existing[0].id); }
          else { var s = A.addUgcSlot(isoDate); if (s) A.openSlotEditor(s.id, { isNew: true }); }
        });
      })(iso, off);

      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /* ── List ─────────────────────────────────────────────── */

  function list() {
    var wrap = A.el('div');
    var slots = A.curUgc();
    if (!slots.length) {
      wrap.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessuno slot per ' + A.monthLabel(A.ui.month).toLowerCase() }),
        A.el('p', { text: 'Scegli i giorni della settimana nella barra e usa "Genera mese" per riempire il calendario con la frequenza concordata.' })
      ]));
      return wrap;
    }
    slots.forEach(function (u) {
      var st = A.ugcStatusOf(u.status);
      var cr = A.get(u.creatorId);
      var row = A.el('button', {
        type: 'button', class: 'creator',
        onclick: function () { A.openSlotEditor(u.id); }
      }, [
        A.el('span', { style: 'width:3px;height:30px;border-radius:2px;background:' + st.c + ';flex:0 0 auto;' }),
        A.el('span', { style: 'min-width:62px;font-size:11.5px;font-weight:700;color:var(--ink-2);', text: A.dayLabel(u.date) }),
        A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
          A.el('span', { class: 'nm', style: 'display:block;', text: u.brief || modeLabel(u.mode) }),
          A.el('span', { class: 'sub', text: st.label + (cr ? ' · ' + cr.name : '') })
        ]),
        A.el('span', { class: 'tagpill', text: modeLabel(u.mode) })
      ]);
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ── Creators ─────────────────────────────────────────── */

  function creators() {
    var client = A.curClient();
    var wrap = A.el('div');
    var list = A.creatorsOf(client.id);
    if (!list.length) {
      wrap.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessun creator in rubrica' }),
        A.el('p', { text: 'Tieni qui chi collabora con il cliente: tariffa, stato della trattativa e slot assegnati.' })
      ]));
      return wrap;
    }
    var totFee = list.reduce(function (s, c) { return s + (Number(c.fee) || 0); }, 0);
    var reach = list.reduce(function (s, c) { return s + (Number(c.followers) || 0); }, 0);
    wrap.appendChild(A.el('div', { class: 'toolbar-stats', style: 'margin-bottom:16px;gap:22px;' }, [
      A.el('span', { class: 'stat' }, [A.el('b', { text: String(list.length) }), A.el('span', { text: 'creator' })]),
      A.el('span', { class: 'stat' }, [A.el('b', { text: '€' + totFee.toLocaleString('it-IT') }), A.el('span', { text: 'budget impegnato' })]),
      A.el('span', { class: 'stat' }, [A.el('b', { text: A.fmtNum(reach) }), A.el('span', { text: 'follower complessivi' })])
    ]));
    list.forEach(function (c) {
      var slots = A.S.ugcSlots.filter(function (u) { return u.creatorId === c.id; });
      wrap.appendChild(A.el('button', {
        type: 'button', class: 'creator', onclick: function () { editCreator(c); }
      }, [
        A.el('span', { class: 'av', text: A.initials(c.name) }),
        A.el('span', { style: 'flex:1 1 auto;min-width:0;' }, [
          A.el('span', { class: 'nm', style: 'display:block;', text: c.name || 'Senza nome' }),
          A.el('span', { class: 'sub', text: (c.handle || '') + ' · ' + A.fmtNum(c.followers) + ' follower' + (slots.length ? ' · ' + slots.length + ' slot' : '') })
        ]),
        A.el('span', { class: 'tagpill', text: (A.CREATOR_STATUS.filter(function (s) { return s.key === c.status; })[0] || {}).label || c.status }),
        A.el('span', { style: 'font-size:11.5px;font-weight:700;color:var(--ink-2);', text: c.fee ? '€' + c.fee : '—' })
      ]));
    });
    return wrap;
  }

  function editCreator(c, isNew) {
    var held = { snap: A.snap(c) };
    var stopSnap = A.followSnapshot ? A.followSnapshot(c.id, held) : function () {};
    var name = A.el('input', { class: 'inp', value: c.name });
    var handle = A.el('input', { class: 'inp', value: c.handle, placeholder: '@handle' });
    var fol = A.el('input', { class: 'inp', type: 'number', value: c.followers || 0 });
    var fee = A.el('input', { class: 'inp', type: 'number', value: c.fee || 0 });
    var stat = A.el('select', { class: 'sel' });
    A.CREATOR_STATUS.forEach(function (s) {
      stat.appendChild(A.el('option', { value: s.key, text: s.label, selected: c.status === s.key }));
    });
    var note = A.el('textarea', { class: 'ta', rows: '3' });
    note.value = c.note || '';

    /* every field is written as it changes, and autosaved */
    function bind(input, evt, write) {
      input.addEventListener(evt, function () { write(); A.commit({ render: false }); });
    }
    bind(name, 'input', function () { c.name = name.value; });
    bind(handle, 'input', function () { c.handle = handle.value.trim(); });
    bind(fol, 'input', function () { c.followers = Number(fol.value) || 0; });
    bind(fee, 'input', function () { c.fee = Number(fee.value) || 0; });
    bind(stat, 'change', function () { c.status = stat.value; });
    bind(note, 'input', function () { c.note = note.value; });

    A.modal({
      title: 'Creator',
      body: [
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Nome' }), name]),
        A.el('div', { class: 'row' }, [
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Handle' }), handle]),
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Follower' }), fol])
        ]),
        A.el('div', { class: 'row' }, [
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Compenso €' }), fee]),
          A.el('div', { class: 'field' }, [A.el('label', { text: 'Stato' }), stat])
        ]),
        A.el('div', { class: 'field' }, [A.el('label', { text: 'Note' }), note])
      ],
      onClose: function () {
        stopSnap();
        if (A.get(c.id) && !String(c.name || '').trim()) { c.name = 'Senza nome'; A.commit({ render: false }); }
        A.render();
        A.saveNow();
      },
      actions: [
        { label: 'Elimina', kind: 'danger', run: function () { A.deleteCreator(c.id); A.saveNow(); } },
        {
          label: isNew ? 'Annulla' : 'Annulla modifiche',
          run: function () {
            if (isNew) A.deleteCreator(c.id);
            else { A.restore(c, held.snap); A.commit(); }
            A.saveNow();
          }
        },
        { label: 'Fatto', kind: 'primary', run: function () {} }
      ]
    });
  }

  /* ── Year ─────────────────────────────────────────────── */

  function year() {
    var wrap = A.el('div');
    var y = A.ui.month.split('-')[0];
    var all = A.ugcInYear(A.ui.accountId, y);
    var max = 1;
    var byMonth = {};
    for (var i = 1; i <= 12; i++) byMonth[y + '-' + A.pad(i)] = [];
    all.forEach(function (u) {
      var k = A.monthOfDay(u.date);
      if (byMonth[k]) byMonth[k].push(u);
    });
    Object.keys(byMonth).forEach(function (k) { max = Math.max(max, byMonth[k].length); });

    wrap.appendChild(A.el('div', { class: 'sec-title', text: 'Anno ' + y + ' · ' + all.length + ' slot' }));
    var g = A.el('div', { class: 'year' });
    for (var m = 1; m <= 12; m++) {
      (function (mi) {
        var key = y + '-' + A.pad(mi);
        var slots = byMonth[key];
        var done = slots.filter(function (u) { return u.status === 'consegnato'; }).length;
        var cell = A.el('button', {
          type: 'button',
          class: 'ymonth' + (key === A.thisMonth() ? ' now' : ''),
          onclick: function () { A.ui.month = key; A.ui.ugcTab = 'calendario'; A.render(); }
        }, [
          A.el('span', { class: 'm', text: A.MONTH_NAMES[mi - 1] }),
          A.el('span', { class: 'track' }, [
            A.el('span', { class: 'fill', style: 'width:' + Math.round(slots.length / max * 100) + '%;' })
          ]),
          A.el('span', { class: 'n', text: slots.length ? slots.length + ' slot · ' + done + ' consegnati' : 'vuoto' })
        ]);
        g.appendChild(cell);
      })(m);
    }
    wrap.appendChild(g);
    return wrap;
  }

  /* ── Slot editor ──────────────────────────────────────── */

  A.openSlotEditor = function (slotId, opts) {
    opts = opts || {};
    var body = A.el('div', { style: 'display:flex;flex-direction:column;gap:15px;' });
    var held = { snap: A.snap(A.get(slotId)) };
    var stopSnap = A.followSnapshot ? A.followSnapshot(slotId, held) : function () {};

    function field(label, control) {
      return A.el('div', { class: 'field' }, [A.el('label', { text: label }), control]);
    }

    function redraw() { A.rebuild(build); }

    function build() {
      var u = A.get(slotId);
      if (!u) { A.closeModal(); return; }
      var client = A.clientOfAccount(u.accountId);
      A.clear(body);

      var dIn = A.el('input', { class: 'inp', type: 'date', value: u.date });
      dIn.addEventListener('change', function () { u.date = dIn.value; A.commit(); redraw(); });
      body.appendChild(field('Data', dIn));

      var seg = A.el('div', { class: 'segment' });
      MODES.forEach(function (m) {
        seg.appendChild(A.el('button', {
          type: 'button', 'aria-pressed': u.mode === m.key ? 'true' : 'false', text: m.label,
          'data-focus': 'mode-' + m.key,
          onclick: function () { u.mode = m.key; A.commit({ render: false }); A.render(); redraw(); }
        }));
      });
      body.appendChild(field('Origine', seg));

      var stSeg = A.el('div', { style: 'display:flex;flex-direction:column;gap:5px;' });
      A.UGC_STATUS.forEach(function (st) {
        var on = u.status === st.key;
        stSeg.appendChild(A.el('button', {
          type: 'button',
          style: 'display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:7px;text-align:left;font-size:12.5px;font-weight:600;' +
                 'border:1px solid ' + (on ? st.c : 'var(--rule)') + ';background:' + (on ? 'var(--panel-2)' : 'transparent') + ';color:var(--ink);',
          'data-focus': 'ugcst-' + st.key,
          html: '<span style="width:7px;height:7px;border-radius:50%;background:' + st.c + '"></span>' + st.label,
          onclick: function () { u.status = st.key; A.commit({ render: false }); A.render(); redraw(); }
        }));
      });
      body.appendChild(field('Stato', stSeg));

      var brief = A.el('textarea', { class: 'ta', rows: '4', placeholder: 'Cosa deve mostrare il contenuto' });
      brief.value = u.brief || '';
      brief.addEventListener('input', function () { u.brief = brief.value; A.commit({ render: false }); });
      body.appendChild(field('Brief', brief));

      if (u.mode === 'creator') {
        var sel = A.el('select', { class: 'sel' });
        sel.appendChild(A.el('option', { value: '', text: 'Nessun creator' }));
        A.creatorsOf(client.id).forEach(function (c) {
          sel.appendChild(A.el('option', { value: c.id, text: c.name, selected: u.creatorId === c.id }));
        });
        sel.addEventListener('change', function () { u.creatorId = sel.value; A.commit({ render: false }); A.render(); });
        body.appendChild(field('Creator', sel));
      }

      var note = A.el('textarea', { class: 'ta', rows: '3' });
      note.value = u.note || '';
      note.addEventListener('input', function () { u.note = note.value; A.commit({ render: false }); });
      body.appendChild(field('Note', note));
    }

    build();
    var slot = A.get(slotId);
    function cancel() {
      var live = A.get(slotId);
      if (!live) return;
      if (opts.isNew) A.S.ugcSlots = A.S.ugcSlots.filter(function (x) { return x.id !== slotId; });
      else A.restore(live, held.snap);
      A.commit();
      A.saveNow();
    }

    A.modal({
      title: 'Slot UGC · ' + (slot ? A.dayLabel(slot.date) : ''),
      body: [body],
      onClose: function () { stopSnap(); A.saveNow(); },
      actions: [
        {
          label: 'Elimina', kind: 'danger', keepOpen: true, run: function () {
            A.confirm({
              title: 'Eliminare lo slot?', body: 'Viene eliminato per tutto lo studio. Puoi annullare dal messaggio in basso.',
              ok: 'Elimina', danger: true,
              run: function () { A.closeModal(); A.deleteUgcSlot(slotId); A.saveNow(); }
            });
            return false;
          }
        },
        {
          label: opts.isNew ? 'Annulla' : 'Annulla modifiche',
          run: function () { cancel(); }
        },
        { label: 'Fatto', kind: 'primary', run: function () {} }
      ]
    });
  };

  A.views = A.views || {};
  A.views.ugc = function (host) {
    A.clear(host);
    if (!A.ui.accountId) {
      host.appendChild(A.el('div', { class: 'empty' }, [A.el('h4', { text: 'Nessun account selezionato' })]));
      return;
    }
    A.ui.ugcTab = A.ui.ugcTab || 'calendario';
    host.appendChild(toolbar());
    var canvas = A.el('div', { class: 'canvas' });
    if (A.ui.ugcTab === 'calendario') canvas.appendChild(calendar());
    else if (A.ui.ugcTab === 'elenco') canvas.appendChild(list());
    else if (A.ui.ugcTab === 'creator') canvas.appendChild(creators());
    else canvas.appendChild(year());
    host.appendChild(canvas);
  };
})(window.IDE);
