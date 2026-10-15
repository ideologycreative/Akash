/* ============================================================
   Ideology — Calendario
   Everything dated in one month: feed posts, stories and UGC
   slots. Dragging a post onto a day moves its publication date.
   ============================================================ */

(function (A) {
  'use strict';

  function eventsFor(month) {
    var map = {};
    function push(iso, ev) { if (!iso) return; (map[iso] = map[iso] || []).push(ev); }
    A.postsIn(A.ui.accountId, month).forEach(function (p) {
      var st = A.statusOf(p.status);
      push(p.date, {
        c: st.c, kind: 'post', id: p.id,
        label: (A.natureOf(p).short ? A.natureOf(p).short + ' · ' : '') +
               (p.kind === 'reel' ? 'Reel' : p.kind === 'carosello' ? 'Carosello' : p.kind === 'editoriale' ? 'Card' : 'Post') +
               (p.caption ? ' · ' + p.caption.split('\n')[0].slice(0, 24) : '')
      });
    });
    A.storiesIn(A.ui.accountId, month).forEach(function (s) {
      push(s.date, { c: 'var(--cobalt)', kind: 'story', id: s.id, label: (s.kind === 'storyboard' ? 'Storyboard' : 'Story') + ' · ' + (s.title || '') });
    });
    A.ugcIn(A.ui.accountId, month).forEach(function (u) {
      var st = A.ugcStatusOf(u.status);
      push(u.date, { c: st.c, kind: 'ugc', id: u.id, label: 'UGC · ' + (u.brief || st.label) });
    });
    return map;
  }

  function legend() {
    var bar = A.el('div', { class: 'toolbar' });
    var items = [
      ['Feed', 'var(--ink-3)'],
      ['Stories', 'var(--cobalt)'],
      ['UGC', 'var(--ugc-girato)']
    ];
    var wrap = A.el('div', { class: 'toolbar-stats' });
    items.forEach(function (i) {
      wrap.appendChild(A.el('span', {
        style: 'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--ink-2);',
        html: '<span style="width:8px;height:8px;border-radius:2px;background:' + i[1] + '"></span>' + i[0]
      }));
    });
    bar.appendChild(wrap);
    bar.appendChild(A.el('div', { class: 'bar-space' }));
    bar.appendChild(A.el('span', {
      style: 'font-size:11.5px;color:var(--ink-3);',
      text: 'Trascina un contenuto su un altro giorno per spostarne la data.'
    }));
    return bar;
  }

  function monthGrid() {
    var wrap = A.el('div', { class: 'cal' });
    var mk = A.ui.month.split('-');
    var y = parseInt(mk[0], 10), m = parseInt(mk[1], 10);
    var startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    var daysIn = new Date(y, m, 0).getDate();
    var prevDays = new Date(y, m - 1, 0).getDate();
    var today = A.todayKey();
    var map = eventsFor(A.ui.month);

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
      var cell = A.el('div', {
        class: 'cal-day' + (off ? ' off' : '') + (iso === today ? ' today' : ''),
        style: 'min-height:116px;'
      });
      cell.appendChild(A.el('span', { class: 'd', text: String(dd) }));

      if (!off) {
        (map[iso] || []).slice(0, 3).forEach(function (ev) {
          var node = A.el('span', {
            class: 'ev', style: '--c:' + ev.c + ';', text: ev.label, title: ev.label
          });
          if (ev.kind === 'post') {
            node.setAttribute('draggable', 'true');
            node.style.cursor = 'grab';
            node.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', ev.id); });
          }
          node.addEventListener('click', function (e) {
            e.stopPropagation();
            if (ev.kind === 'post') { A.ui.tab = 'feed'; A.render(); A.openPostEditor(ev.id); return; }
            if (ev.kind === 'story') { A.ui.tab = 'stories'; A.render(); A.openStoryEditor(ev.id); return; }
            A.ui.tab = 'ugc'; A.ui.ugcTab = 'calendario'; A.render(); A.openSlotEditor(ev.id);
          });
          cell.appendChild(node);
        });
        var extra = (map[iso] || []).length - 3;
        if (extra > 0) cell.appendChild(A.el('span', { class: 'cal-more', text: '+' + extra + ' altri' }));

        (function (isoDate) {
          cell.addEventListener('dragover', function (e) { e.preventDefault(); cell.style.borderColor = 'var(--cobalt)'; });
          cell.addEventListener('dragleave', function () { cell.style.borderColor = ''; });
          cell.addEventListener('drop', function (e) {
            e.preventDefault();
            cell.style.borderColor = '';
            var id = e.dataTransfer.getData('text/plain');
            var p = A.get(id);
            if (p && p.date !== isoDate) {
              A.updatePost(id, { date: isoDate, showDate: true });
              A.toast('Spostato al ' + A.dayLabel(isoDate));
            }
          });
        })(iso);
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function unscheduled() {
    var list = A.curPosts().filter(function (p) { return !p.date; });
    if (!list.length) return null;
    var wrap = A.el('div', { style: 'margin-top:22px;' });
    wrap.appendChild(A.el('div', { class: 'sec-title', text: 'Senza data (' + list.length + ')' }));
    var row = A.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
    list.forEach(function (p) {
      var st = A.statusOf(p.status);
      row.appendChild(A.el('button', {
        type: 'button', class: 'chip',
        draggable: 'true',
        html: '<span class="dot" style="background:' + st.c + '"></span>' + A.esc((p.caption || 'Senza testo').slice(0, 28)),
        onclick: function () { A.ui.tab = 'feed'; A.render(); A.openPostEditor(p.id); },
        ondragstart: function (e) { e.dataTransfer.setData('text/plain', p.id); }
      }));
    });
    wrap.appendChild(row);
    return wrap;
  }

  A.views = A.views || {};
  A.views.calendario = function (host) {
    A.clear(host);
    if (!A.ui.accountId) {
      host.appendChild(A.el('div', { class: 'empty' }, [A.el('h4', { text: 'Nessun account selezionato' })]));
      return;
    }
    host.appendChild(legend());
    var canvas = A.el('div', { class: 'canvas' });
    canvas.appendChild(monthGrid());
    var un = unscheduled();
    if (un) canvas.appendChild(un);
    host.appendChild(canvas);
  };
})(window.IDE);
