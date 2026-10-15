/* ============================================================
   Ideology — Clienti

   The client record is where every content decision is set once:
   which platforms, and therefore which aspect ratio, which grid,
   which export size and which caption limit; the brand palette
   the text cards are drawn from; the pillars and formats the
   feed classifies against; and the monthly commitment the Home
   measures progress against.

   Picking a platform is the only size decision in the product.
   Nothing downstream asks again.
   ============================================================ */

(function (A) {
  'use strict';

  A.goClient = function (id) {
    A.ui.section = 'clienti';
    A.ui.clientDetailId = id || null;
    A.render();
  };

  function field(label, control, hint) {
    var f = A.el('div', { class: 'field' }, [A.el('label', { text: label }), control]);
    if (hint) f.appendChild(A.el('div', { class: 'hint', text: hint }));
    return f;
  }

  function section(title, desc, action) {
    var s = A.el('div', { class: 'dsec' });
    var h = A.el('h2', {}, [A.el('span', { text: title })]);
    if (action) { h.appendChild(A.el('div', { class: 'bar-space' })); h.appendChild(action); }
    s.appendChild(h);
    if (desc) s.appendChild(A.el('p', { text: desc }));
    return s;
  }

  /* ── List ─────────────────────────────────────────────── */

  function listView(host) {
    var head = A.el('div', { class: 'sec-head' }, [
      A.el('div', {}, [
        A.el('h1', { text: 'Clienti' }),
        A.el('p', { text: 'Account, formati, identità visiva e impegni mensili.' })
      ]),
      A.el('div', { class: 'bar-space' }),
      A.el('button', { class: 'btn primary', html: A.icon('plus', 13) + 'Nuovo cliente', onclick: newClientModal })
    ]);
    host.appendChild(head);

    var scroll = A.el('div', { class: 'canvas', style: 'padding:0;' });
    var page = A.el('div', { class: 'clients' });

    if (!A.S.clients.length) {
      page.appendChild(A.el('div', { class: 'empty' }, [
        A.el('h4', { text: 'Nessun cliente' }),
        A.el('p', { text: 'Crea il primo cliente: bastano un nome e la piattaforma principale, il resto si imposta dopo.' }),
        A.el('button', { class: 'btn primary', html: A.icon('plus', 13) + 'Nuovo cliente', onclick: newClientModal })
      ]));
      scroll.appendChild(page); host.appendChild(scroll); return;
    }

    var grid = A.el('div', { class: 'client-grid' });
    A.S.clients.forEach(function (c) {
      var accounts = c.accounts || [];
      var posts = 0, pending = 0;
      accounts.forEach(function (a) {
        var list = A.postsIn(a.id, A.ui.month);
        posts += list.length;
        pending += list.filter(function (p) { return p.status === 'da_approvare' || p.status === 'in_revisione'; }).length;
      });
      var stat = (A.CLIENT_STATUS.filter(function (s) { return s.key === c.status; })[0] || {}).label || 'Attivo';

      var card = A.el('button', { type: 'button', class: 'client-card', onclick: function () { A.goClient(c.id); } });
      card.appendChild(A.el('div', { class: 'top' }, [
        A.el('span', { class: 'mark', style: 'background:' + A.markColor(c.id) + ';', text: A.initials(c.name) }),
        A.el('div', { style: 'min-width:0;flex:1 1 auto;' }, [
          A.el('h3', { text: c.name }),
          A.el('div', { class: 'sub', text: accounts.length + (accounts.length === 1 ? ' account' : ' account') + ' · ' + posts + ' contenuti in ' + A.monthShort(A.ui.month).toLowerCase() })
        ]),
        A.el('span', { class: 'statuspill ' + (c.status || 'attivo'), text: stat })
      ]));

      var row = A.el('div', { class: 'plat-row' });
      accounts.forEach(function (a) {
        var fmt = A.formatOfAccount(a);
        row.appendChild(A.el('span', {
          class: 'plat-chip',
          html: '<span class="dot" style="background:' + fmt.platform.color + '"></span>' +
                A.esc(a.platform) + ' <span style="opacity:.6">' + A.esc(fmt.sizeLabel) + '</span>'
        }));
      });
      card.appendChild(row);

      if (pending) {
        card.appendChild(A.el('div', {
          style: 'font-size:11.5px;font-weight:700;color:var(--st-approvare);',
          text: pending + (pending === 1 ? ' contenuto in attesa' : ' contenuti in attesa')
        }));
      }
      grid.appendChild(card);
    });
    page.appendChild(grid);
    scroll.appendChild(page);
    host.appendChild(scroll);
  }

  function newClientModal() {
    var name = A.el('input', { class: 'inp', placeholder: 'Nome del cliente' });
    var handle = A.el('input', { class: 'inp', placeholder: '@handle (facoltativo)' });
    var chosen = 'Instagram';
    var pick = A.el('div', { class: 'plat-pick' });

    function paint() {
      A.clear(pick);
      A.PLATFORM_LIST.forEach(function (k) {
        var p = A.PLATFORMS[k];
        pick.appendChild(A.el('button', {
          type: 'button', class: 'plat-opt', 'aria-pressed': chosen === k ? 'true' : 'false',
          onclick: function () { chosen = k; paint(); }
        }, [
          A.el('span', { class: 'pn', html: '<span class="pdot" style="background:' + p.color + '"></span>' + A.esc(p.label) }),
          A.el('span', { class: 'pd', text: p.sizeLabel + ' · ' + p.w + '×' + p.h })
        ]));
      });
    }
    paint();

    A.modal({
      title: 'Nuovo cliente',
      body: [
        field('Nome', name),
        field('Piattaforma principale', pick, 'Decide formato, griglia e limite caption. Puoi aggiungere altri account dopo.'),
        field('Handle', handle)
      ],
      actions: [
        { label: 'Annulla' },
        {
          label: 'Crea', kind: 'primary',
          run: function () {
            var n = name.value.trim();
            if (!n) { name.focus(); return false; }
            var cl = A.addClient(n, chosen, handle.value.trim());
            A.goClient(cl.id);
            A.toast('Cliente creato');
          }
        }
      ]
    });
  }

  /* ── Detail ───────────────────────────────────────────── */

  function identity(cl) {
    var s = section('Anagrafica', null);
    var name = A.el('input', { class: 'inp', value: cl.name });
    name.addEventListener('change', function () { A.updateClient(cl.id, { name: name.value.trim() || cl.name }); });

    var status = A.el('select', { class: 'sel' });
    A.CLIENT_STATUS.forEach(function (st) {
      status.appendChild(A.el('option', { value: st.key, text: st.label, selected: cl.status === st.key }));
    });
    status.addEventListener('change', function () { A.updateClient(cl.id, { status: status.value }); });

    s.appendChild(A.el('div', { class: 'row' }, [field('Nome', name), field('Stato', status)]));

    var note = A.el('textarea', { class: 'ta', rows: '2', placeholder: 'Contesto utile allo studio: tono di voce, vincoli, referente…' });
    note.value = cl.note || '';
    note.addEventListener('input', function () { cl.note = note.value; A.commit({ render: false }); });
    s.appendChild(field('Note', note));

    var url = A.clientUrl(cl);
    s.appendChild(field('Link di approvazione', A.el('div', { class: 'linkbox' }, [
      A.el('code', { text: url }),
      A.el('button', {
        class: 'btn ghost sm', text: 'Copia',
        onclick: function () { A.copy(url).then(function (ok) { A.toast(ok ? 'Link copiato' : url); }); }
      }),
      A.el('button', {
        class: 'btn ghost sm', text: 'Rigenera',
        onclick: function () {
          A.confirm({
            title: 'Rigenerare il link?',
            body: 'Il link precedente smette di funzionare subito. Usalo se è finito nelle mani sbagliate.',
            ok: 'Rigenera', danger: true,
            run: function () { A.updateClient(cl.id, { shareToken: A.newToken() }); A.toast('Nuovo link generato'); }
          });
        }
      })
    ]), 'Apre solo l\'anteprima di questo cliente, in sola lettura. Le bozze non sono mai incluse.'));
    return s;
  }

  function accountsSection(cl) {
    var s = section(
      'Account social',
      'La piattaforma scelta qui decide tutto il resto: proporzione delle celle, colonne della griglia, dimensioni di esportazione e limite della caption. Non viene richiesta una seconda volta da nessuna parte.',
      A.el('button', { class: 'btn sm', html: A.icon('plus', 12) + 'Account', onclick: function () { addAccountModal(cl); } })
    );

    if (!cl.accounts.length) {
      s.appendChild(A.el('div', { class: 'empty', style: 'padding:30px;' }, [
        A.el('p', { text: 'Nessun account. Aggiungine uno per poter pianificare contenuti.' })
      ]));
      return s;
    }

    cl.accounts.forEach(function (acc) {
      var fmt = A.formatOfAccount(acc);
      var card = A.el('div', { class: 'acc-card' });

      /* avatar */
      var av = A.el('div', { class: 'acc-av', title: 'Cambia foto profilo' });
      function paintAv() {
        A.clear(av);
        if (acc.avatarUrl) av.appendChild(A.el('img', { src: acc.avatarUrl, alt: '' }));
        else av.innerHTML = A.icon('users', 20);
      }
      paintAv();
      var file = A.el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        A.readImage(f).then(function (u) { acc.avatarUrl = u; paintAv(); A.commit({ render: false }); })
          .catch(function (e) { A.toast(e.message); });
      });
      av.addEventListener('click', function () { file.click(); });
      card.appendChild(A.el('div', {}, [av, file]));

      var main = A.el('div', { class: 'acc-main' });

      var handle = A.el('input', { class: 'inp', value: acc.handle || '', placeholder: '@handle', style: 'max-width:220px;' });
      handle.addEventListener('input', function () { acc.handle = handle.value; A.commit({ render: false }); });
      var top = A.el('div', { class: 'acc-top' }, [
        handle,
        A.el('span', { class: 'plat-chip', html: '<span class="dot" style="background:' + fmt.platform.color + '"></span>' + A.esc(acc.platform) }),
        A.el('div', { class: 'bar-space' }),
        A.el('button', {
          class: 'btn ghost sm icon', title: 'Rimuovi account', html: A.icon('trash', 12),
          onclick: function () { removeAccount(cl, acc); }
        })
      ]);
      main.appendChild(top);

      /* platform picker — the single size decision */
      var pick = A.el('div', { class: 'plat-pick' });
      A.PLATFORM_LIST.forEach(function (k) {
        var p = A.PLATFORMS[k];
        pick.appendChild(A.el('button', {
          type: 'button', class: 'plat-opt', 'aria-pressed': acc.platform === k ? 'true' : 'false',
          onclick: function () { acc.platform = k; acc.ratio = ''; A.commit(); }
        }, [
          A.el('span', { class: 'pn', html: '<span class="pdot" style="background:' + p.color + '"></span>' + A.esc(p.label) }),
          A.el('span', { class: 'pd', text: p.sizeLabel + ' · ' + p.w + '×' + p.h })
        ]));
      });
      main.appendChild(pick);

      /* alternative ratios offered by that platform */
      if (fmt.platform.alts && fmt.platform.alts.length) {
        var alts = A.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;' });
        alts.appendChild(A.el('span', { style: 'font-size:10.5px;font-weight:700;color:var(--ink-3);', text: 'Formato in griglia' }));
        alts.appendChild(A.el('button', {
          type: 'button', class: 'chip', 'aria-pressed': !acc.ratio ? 'true' : 'false',
          text: fmt.platform.sizeLabel + ' (predefinito)',
          onclick: function () { acc.ratio = ''; A.commit(); }
        }));
        fmt.platform.alts.forEach(function (al) {
          alts.appendChild(A.el('button', {
            type: 'button', class: 'chip', 'aria-pressed': acc.ratio === al.ratio ? 'true' : 'false',
            text: al.label,
            onclick: function () { acc.ratio = al.ratio; A.commit(); }
          }));
        });
        main.appendChild(alts);
      }

      /* what the choice produced */
      var spec = A.el('div', { class: 'acc-spec' }, [
        A.el('div', {}, [A.el('b', { text: fmt.sizeLabel }), A.el('span', { text: 'proporzione' })]),
        A.el('div', {}, [A.el('b', { text: fmt.w + ' × ' + fmt.h }), A.el('span', { text: 'pixel di esportazione' })]),
        A.el('div', {}, [A.el('b', { text: String(fmt.cols) }), A.el('span', { text: 'colonne in griglia' })]),
        A.el('div', {}, [A.el('b', { text: fmt.platform.captionMax.toLocaleString('it-IT') }), A.el('span', { text: 'caratteri caption' })]),
        A.el('div', {}, [
          A.el('b', { text: fmt.platform.story ? fmt.platform.story.label : '—' }),
          A.el('span', { text: 'stories' })
        ])
      ]);
      main.appendChild(spec);
      main.appendChild(A.el('div', { style: 'font-size:11.5px;color:var(--ink-3);line-height:1.5;', text: fmt.platform.note }));

      var bio = A.el('textarea', { class: 'ta', rows: '2', placeholder: 'Bio del profilo — compare nell\'anteprima cliente' });
      bio.value = acc.bio || '';
      bio.addEventListener('input', function () { acc.bio = bio.value; A.commit({ render: false }); });
      var nums = A.el('div', { class: 'row' }, [
        (function () {
          var i = A.el('input', { class: 'inp', type: 'number', value: acc.followers || 0 });
          i.addEventListener('input', function () { acc.followers = Number(i.value) || 0; A.commit({ render: false }); });
          return field('Follower', i);
        })(),
        (function () {
          var i = A.el('input', { class: 'inp', type: 'number', value: acc.following || 0 });
          i.addEventListener('input', function () { acc.following = Number(i.value) || 0; A.commit({ render: false }); });
          return field('Seguiti', i);
        })()
      ]);
      main.appendChild(field('Bio', bio));
      main.appendChild(nums);

      var counts = A.countAccountContent(acc.id);
      main.appendChild(A.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, [
        A.el('span', { style: 'font-size:11.5px;color:var(--ink-3);', text: counts.posts + ' contenuti · ' + counts.stories + ' stories · ' + counts.ugc + ' slot UGC' }),
        A.el('div', { class: 'bar-space' }),
        A.el('button', {
          class: 'btn sm', html: A.icon('grid', 12) + 'Apri il feed',
          onclick: function () {
            A.ui.clientId = cl.id; A.ui.accountId = acc.id;
            A.ui.section = 'contenuti'; A.ui.tab = 'feed';
            A.render();
          }
        })
      ]));

      card.appendChild(main);
      s.appendChild(card);
    });
    return s;
  }

  function addAccountModal(cl) {
    var handle = A.el('input', { class: 'inp', placeholder: '@handle' });
    var chosen = 'Instagram';
    var pick = A.el('div', { class: 'plat-pick' });
    function paint() {
      A.clear(pick);
      A.PLATFORM_LIST.forEach(function (k) {
        var p = A.PLATFORMS[k];
        pick.appendChild(A.el('button', {
          type: 'button', class: 'plat-opt', 'aria-pressed': chosen === k ? 'true' : 'false',
          onclick: function () { chosen = k; paint(); }
        }, [
          A.el('span', { class: 'pn', html: '<span class="pdot" style="background:' + p.color + '"></span>' + A.esc(p.label) }),
          A.el('span', { class: 'pd', text: p.sizeLabel + ' · ' + p.w + '×' + p.h })
        ]));
      });
    }
    paint();
    A.modal({
      title: 'Nuovo account · ' + cl.name,
      body: [field('Piattaforma', pick), field('Handle', handle)],
      actions: [
        { label: 'Annulla' },
        { label: 'Aggiungi', kind: 'primary', run: function () { A.addAccount(cl.id, chosen, handle.value.trim()); A.toast('Account aggiunto'); } }
      ]
    });
  }

  function removeAccount(cl, acc) {
    var c = A.countAccountContent(acc.id);
    var total = c.posts + c.stories + c.ugc;
    A.confirm({
      title: 'Rimuovere ' + (acc.handle || 'questo account') + '?',
      body: total
        ? 'Vengono eliminati anche ' + c.posts + ' contenuti, ' + c.stories + ' stories e ' + c.ugc + ' slot UGC collegati. Esporta un backup se non sei sicuro.'
        : 'Non ci sono contenuti collegati: la rimozione non cancella nulla di pianificato.',
      ok: 'Rimuovi', danger: true,
      run: function () { A.deleteAccount(cl.id, acc.id); A.toast('Account rimosso'); }
    });
  }

  /* ── Brand palette ────────────────────────────────────── */

  function paletteSection(cl) {
    var s = section('Identità visiva',
      'I colori usati dalle card di solo testo nel feed e nelle stories. Niente file da aprire: la card si disegna da qui.');

    var pal = cl.palette;
    var preview = A.el('div', { class: 'pal-preview' });

    function paintPreview() {
      A.clear(preview);
      var feed = A.el('div', { class: 'pal-card', style: 'background:' + pal.bg + ';color:' + pal.ink + ';' }, [
        A.el('div', { class: 'e', style: 'color:' + pal.accent + ';', text: 'Dalla bottega' }),
        A.el('div', { class: 't', text: 'Il titolo di una card di solo testo' }),
        A.el('div', { class: 'r' }),
        A.el('div', { class: 's', text: 'Sottotitolo su due righe, come comparirebbe nel feed.' })
      ]);
      var story = A.el('div', { class: 'pal-card story', style: 'background:' + pal.accent + ';color:' + pal.bg + ';' }, [
        A.el('div', { class: 'e', style: 'color:' + pal.alt + ';', text: 'UGC' }),
        A.el('div', { class: 't', text: 'Una citazione dal cliente' }),
        A.el('div', { class: 'r' }),
        A.el('div', { class: 's', text: cl.name })
      ]);
      preview.appendChild(feed);
      preview.appendChild(story);
    }

    var grid = A.el('div', { class: 'pal-grid' });
    A.PALETTE_KEYS.forEach(function (k) {
      var item = A.el('div', { class: 'pal-item' });
      var sw = A.el('div', { class: 'swatch', style: 'background:' + (pal[k.key] || '#eee') + ';' });
      var picker = A.el('input', { type: 'color', value: pal[k.key] || '#000000', style: 'position:absolute;opacity:0;width:0;height:0;' });
      var hex = A.el('input', { class: 'inp', value: pal[k.key] || '' });

      function apply(v) {
        if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
        pal[k.key] = v;
        sw.style.background = v;
        hex.value = v;
        picker.value = v;
        paintPreview();
        A.commit({ render: false });
      }
      sw.addEventListener('click', function () { picker.click(); });
      sw.style.cursor = 'pointer';
      picker.addEventListener('input', function () { apply(picker.value); });
      hex.addEventListener('change', function () {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) { hex.value = pal[k.key]; A.toast('Serve un colore in formato #RRGGBB'); return; }
        apply(hex.value.trim());
      });

      item.appendChild(sw);
      item.appendChild(A.el('label', { style: 'font-size:10.5px;font-weight:700;color:var(--ink-3);', text: k.label }));
      item.appendChild(hex);
      item.appendChild(picker);
      grid.appendChild(item);
    });

    paintPreview();
    s.appendChild(grid);
    s.appendChild(preview);
    return s;
  }

  /* ── Categories ───────────────────────────────────────
     One classification axis, defined per client. A ceramics
     studio sorts by "prodotto / dietro le quinte", a restaurant
     by "piatti / persone in cucina": the names belong to the
     client, the single axis belongs to the product, which is
     why it fits in one corner of every card.
  ──────────────────────────────────────────────────────── */

  function categoriesSection(cl) {
    var items = A.categoriesOf(cl.id);
    var s = section(
      'Categorie di contenuto',
      'L\'unico modo in cui i contenuti di ' + cl.name + ' vengono classificati. Compaiono nell\'angolo in basso a destra di ogni card e come filtro nel feed.',
      A.el('button', {
        class: 'btn sm', html: A.icon('plus', 12) + 'Aggiungi',
        onclick: function () { A.addCategory(cl.id); }
      })
    );

    if (!items.length) {
      s.appendChild(A.el('p', { style: 'font-size:12px;color:var(--ink-4);margin:0 0 10px;', text: 'Nessuna categoria. Aggiungi quelle che usate con questo cliente.' }));
      var presets = ['Prodotto', 'Dietro le quinte', 'Community', 'Educativo', 'Promozionale'];
      var row = A.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
      presets.forEach(function (name) {
        row.appendChild(A.el('button', {
          class: 'chip', text: '+ ' + name,
          onclick: function () { A.addCategory(cl.id, name); }
        }));
      });
      s.appendChild(row);
      return s;
    }

    items.forEach(function (it) {
      var used = A.usageOfCategory(it.id);
      var row = A.el('div', { class: 'taxrow' });

      var sw = A.el('div', { class: 'sw', style: 'background:' + it.color + ';', title: 'Cambia colore' });
      var picker = A.el('input', { type: 'color', value: it.color, style: 'position:absolute;opacity:0;width:0;height:0;' });
      sw.addEventListener('click', function () { picker.click(); });
      picker.addEventListener('input', function () { it.color = picker.value; sw.style.background = it.color; A.commit({ render: false }); });

      var name = A.el('input', { class: 'inp', value: it.name, style: 'flex:0 0 180px;font-weight:600;' });
      name.addEventListener('input', function () { it.name = name.value; A.commit({ render: false }); });

      var desc = A.el('input', { class: 'inp', value: it.description || '', placeholder: 'A cosa serve', style: 'flex:1 1 auto;' });
      desc.addEventListener('input', function () { it.description = desc.value; A.commit({ render: false }); });

      row.appendChild(sw); row.appendChild(picker);
      row.appendChild(name); row.appendChild(desc);
      row.appendChild(A.el('span', { class: 'cnt', text: used + (used === 1 ? ' uso' : ' usi') }));
      row.appendChild(A.el('button', {
        class: 'btn ghost sm icon', title: 'Elimina', html: A.icon('trash', 12),
        onclick: function () {
          A.confirm({
            title: 'Eliminare "' + it.name + '"?',
            body: used
              ? used + ' contenuti perdono questa classificazione, ma restano al loro posto.'
              : 'Non è usata da nessun contenuto.',
            ok: 'Elimina', danger: true,
            run: function () { A.deleteCategory(it.id); }
          });
        }
      }));
      s.appendChild(row);
    });
    return s;
  }

  /* ── Monthly commitment ───────────────────────────────── */

  function goalsSection(cl) {
    var s = section('Impegni mensili',
      'Quanto è stato concordato per ogni mese. La Home misura su questi numeri quanto manca a chiudere il mese.');
    var acc = cl.accounts[0];
    A.GOALS.forEach(function (g) {
      var done = acc ? A.progressOf(acc.id, A.ui.month, cl.id).filter(function (x) { return x.key === g.key; })[0].done : 0;
      var inp = A.el('input', { class: 'inp', type: 'number', min: '0', value: cl.goals[g.key] || 0 });
      inp.addEventListener('input', function () { cl.goals[g.key] = Number(inp.value) || 0; A.commit({ render: false }); });
      var target = cl.goals[g.key] || 0;
      var pct = target ? Math.min(100, Math.round(done / target * 100)) : 0;
      s.appendChild(A.el('div', { class: 'goal' }, [
        A.el('span', { class: 'gn', text: g.label }),
        A.el('span', { class: 'track' }, [A.el('i', { style: 'width:' + pct + '%;' })]),
        A.el('span', { class: 'done', text: done + ' fatti' }),
        inp
      ]));
    });
    return s;
  }

  function dangerSection(cl) {
    var s = section('Zona pericolosa', null);
    var accIds = (cl.accounts || []).map(function (a) { return a.id; });
    var posts = A.S.posts.filter(function (p) { return accIds.indexOf(p.accountId) >= 0; }).length;
    s.appendChild(A.el('div', { class: 'danger-zone' }, [
      A.el('h3', { text: 'Elimina il cliente' }),
      A.el('p', { text: 'Spariscono ' + posts + ' contenuti, le stories, gli slot UGC, i creator, i pilastri e i formati. Non è reversibile: esporta prima un backup.' }),
      A.el('button', {
        class: 'btn danger', html: A.icon('trash', 13) + 'Elimina ' + cl.name,
        onclick: function () {
          A.confirm({
            title: 'Eliminare ' + cl.name + '?',
            body: 'Tutto il lavoro collegato viene rimosso. Questa azione non si annulla.',
            ok: 'Elimina tutto', danger: true,
            run: function () { A.deleteClient(cl.id); A.ui.clientDetailId = null; A.toast('Cliente eliminato'); }
          });
        }
      })
    ]));
    return s;
  }

  function detailView(host, cl) {
    var head = A.el('div', { class: 'sec-head' }, [
      A.el('button', { class: 'btn ghost icon', 'aria-label': 'Torna ai clienti', html: A.icon('left', 15), onclick: function () { A.goClient(null); } }),
      A.el('span', { class: 'mark', style: 'width:40px;height:40px;border-radius:11px;background:' + A.markColor(cl.id) + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:0 0 auto;', text: A.initials(cl.name) }),
      A.el('div', {}, [
        A.el('h1', { style: 'font-size:22px;', text: cl.name }),
        A.el('p', { text: (cl.accounts || []).map(function (a) { return a.platform; }).join(' · ') || 'Nessun account' })
      ]),
      A.el('div', { class: 'bar-space' }),
      A.el('button', {
        class: 'btn', html: A.icon('grid', 13) + 'Vai ai contenuti',
        onclick: function () {
          A.ui.clientId = cl.id;
          A.ui.accountId = cl.accounts[0] ? cl.accounts[0].id : null;
          A.ui.section = 'contenuti'; A.ui.tab = 'feed';
          A.render();
        }
      })
    ]);
    host.appendChild(head);

    var scroll = A.el('div', { class: 'canvas', style: 'padding:0;' });
    var page = A.el('div', { class: 'detail' });
    page.appendChild(identity(cl));
    page.appendChild(accountsSection(cl));
    page.appendChild(paletteSection(cl));
    page.appendChild(categoriesSection(cl));
    page.appendChild(goalsSection(cl));
    page.appendChild(dangerSection(cl));
    scroll.appendChild(page);
    host.appendChild(scroll);
  }

  A.views = A.views || {};
  A.views.clienti = function (host) {
    A.clear(host);
    var cl = A.get(A.ui.clientDetailId);
    if (cl && cl.accounts) detailView(host, cl);
    else listView(host);
  };
})(window.IDE);
