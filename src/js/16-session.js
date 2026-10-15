/* ============================================================
   Ideology — signing in, choosing the studio, the team

   Only used when 00-config.js names a Supabase project.

   Who gets in: people with a login (an owner creates it in the
   Supabase dashboard — public sign-up is off) who belong to a
   studio. Belonging comes from an invite: an owner adds the
   colleague's email here; the next time that person signs in they
   see the invite — studio, role, who sent it — and choose to
   accept or decline. Nothing is joined automatically. An email
   nobody invited gets an empty screen, never data: the database
   decides that, not this page.
   ============================================================ */

(function (A) {
  'use strict';

  var R = A.remote;
  var CFG = window.IDEOLOGY_CONFIG || {};
  var LAST_WS = 'ideology.workspace';
  var S = A.session = {};

  /* ── Screens ───────────────────────────────────────────── */

  function screen(title, text, nodes) {
    var root = A.$('#root');
    A.closeModal();
    A.clear(root);
    var box = A.el('div', { class: 'gate-box' }, [
      A.el('span', { class: 'gate-mark', text: 'I' }),
      A.el('h1', { text: title }),
      text ? A.el('p', { text: text }) : null
    ]);
    (nodes || []).forEach(function (n) { if (n) box.appendChild(n); });
    root.appendChild(A.el('div', { class: 'gate' }, [box]));
    var f = box.querySelector('input');
    if (f) setTimeout(function () { f.focus(); }, 30);
    return box;
  }

  S.problem = function (title, text, retry) {
    screen(title, text, [
      retry ? A.el('button', { class: 'btn primary', text: 'Riprova', onclick: retry }) : null
    ]);
  };

  function busy(text) { screen(text || 'Un momento…', ''); }

  function formError(form, msg) {
    var e = form.querySelector('.gate-err');
    if (!e) { e = A.el('div', { class: 'gate-err', role: 'alert' }); form.appendChild(e); }
    e.textContent = msg || '';
  }

  function italian(err) {
    var m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'Email o password non corretti.';
    if (/email not confirmed/i.test(m)) return 'Questo indirizzo non è ancora confermato.';
    if (/rate limit|too many/i.test(m)) return 'Troppi tentativi. Riprova tra qualche minuto.';
    if (/password should be at least|weak/i.test(m)) return 'La password è troppo corta: almeno 10 caratteri.';
    if (/fetch|network|load failed/i.test(m)) return 'Non riesco a raggiungere il server. Controlla la connessione.';
    return m || 'Qualcosa non ha funzionato.';
  }

  /* ── Start ─────────────────────────────────────────────── */

  S.start = async function () {
    busy('Apro lo studio…');
    R.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ideology.auth' }
    });

    R.sb.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') setTimeout(showNewPassword, 0);
      if (event === 'SIGNED_OUT') { R.stop(); setTimeout(function () { showLogin(); }, 0); }
    });

    try {
      var res = await R.sb.auth.getSession();
      if (res.error) throw res.error;
      if (!res.data.session) return showLogin();
      if (/type=recovery/.test(location.hash)) return;   // the recovery event takes over
      await afterLogin(res.data.session.user);
    } catch (e) {
      S.problem('Lo studio non risponde', italian(e), S.start);
    }
  };

  function showLogin(msg) {
    var email = A.el('input', { class: 'inp', type: 'email', autocomplete: 'username', placeholder: 'nome@ideology.it', required: true });
    var pass = A.el('input', { class: 'inp', type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
    var go = A.el('button', { class: 'btn primary', type: 'submit', text: 'Entra' });
    var form = A.el('form', { class: 'gate-form' }, [
      A.el('label', { class: 'field' }, [A.el('span', { text: 'Email' }), email]),
      A.el('label', { class: 'field' }, [A.el('span', { text: 'Password' }), pass]),
      go,
      A.el('button', {
        class: 'btn ghost sm', type: 'button', text: 'Password dimenticata?',
        onclick: async function () {
          var addr = email.value.trim();
          if (!addr) { formError(form, 'Scrivi prima la tua email.'); email.focus(); return; }
          var r = await R.sb.auth.resetPasswordForEmail(addr, { redirectTo: location.origin + location.pathname });
          formError(form, r.error ? italian(r.error) : 'Se l\'indirizzo ha un accesso, arriva una mail con il link per una nuova password.');
        }
      })
    ]);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      go.disabled = true;
      formError(form, '');
      var r = await R.sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
      go.disabled = false;
      if (r.error) { formError(form, italian(r.error)); pass.select(); return; }
      afterLogin(r.data.user);
    });
    screen('Entra nello studio', msg || 'Accedi con l\'account che ti ha dato lo studio.', [form]);
  }

  function showNewPassword() {
    var pass = A.el('input', { class: 'inp', type: 'password', autocomplete: 'new-password', minlength: '10', placeholder: 'Almeno 10 caratteri', required: true });
    var go = A.el('button', { class: 'btn primary', type: 'submit', text: 'Salva la password' });
    var form = A.el('form', { class: 'gate-form' }, [
      A.el('label', { class: 'field' }, [A.el('span', { text: 'Nuova password' }), pass]), go
    ]);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (pass.value.length < 10) { formError(form, 'Almeno 10 caratteri.'); return; }
      go.disabled = true;
      var r = await R.sb.auth.updateUser({ password: pass.value });
      go.disabled = false;
      if (r.error) { formError(form, italian(r.error)); return; }
      history.replaceState(null, '', location.pathname);
      afterLogin(r.data.user);
    });
    screen('Nuova password', 'Scegli la password per entrare nello studio.', [form]);
  }

  /* ── Which studio ──────────────────────────────────────── */

  async function afterLogin(user) {
    R.user = user;
    busy('Apro lo studio…');
    try {
      var inv = await R.sb.rpc('pending_invites');
      if (inv.error) throw inv.error;
      if (inv.data && inv.data.length) return showInvites(inv.data);

      var mine = await R.sb.from('workspace_members')
        .select('workspace_id, role, created_at, workspaces(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (mine.error) throw mine.error;

      R.workspaces = mine.data.map(function (m) {
        return { id: m.workspace_id, role: m.role, name: (m.workspaces && m.workspaces.name) || 'Studio' };
      });
      if (!R.workspaces.length) return showNoStudio();

      var last = null;
      try { last = localStorage.getItem(LAST_WS); } catch (e) {}
      var pick = R.workspaces.filter(function (w) { return w.id === last; })[0] || R.workspaces[0];
      await openWorkspace(pick);
    } catch (e) {
      S.problem('Lo studio non risponde', italian(e), function () { afterLogin(user); });
    }
  }

  /* One screen per sign-in that has invites waiting: who, which studio,
     which role — and the choice is the invited person's. */
  function showInvites(list) {
    var rows = list.map(function (i) {
      var line = A.el('div', { class: 'invite-row' }, [
        A.el('div', { class: 'invite-text' }, [
          A.el('strong', { text: i.workspace_name }),
          A.el('span', { text: (i.role === 'owner' ? 'come proprietario' : 'come editor') +
            (i.invited_by_email ? ' · invito di ' + i.invited_by_email : '') })
        ]),
        A.el('div', { class: 'invite-actions' }, [
          A.el('button', { class: 'btn sm', type: 'button', text: 'Rifiuta', onclick: function () { answer('decline_invite', i, line); } }),
          A.el('button', { class: 'btn primary sm', type: 'button', text: 'Accetta', onclick: function () { answer('accept_invite', i, line); } })
        ])
      ]);
      return line;
    });
    var box = screen(list.length === 1 ? 'Hai un invito' : 'Hai ' + list.length + ' inviti',
      'Entri in uno studio solo se accetti. Se non conosci chi ti ha invitato, rifiuta.', rows);

    async function answer(fn, i, line) {
      Array.prototype.forEach.call(line.querySelectorAll('button'), function (b) { b.disabled = true; });
      var r = await R.sb.rpc(fn, { p_workspace: i.workspace_id });
      if (r.error) { A.toast(italian(r.error)); Array.prototype.forEach.call(line.querySelectorAll('button'), function (b) { b.disabled = false; }); return; }
      if (fn === 'accept_invite') { try { localStorage.setItem(LAST_WS, i.workspace_id); } catch (e) {} }
      line.remove();
      if (!box.querySelector('.invite-row')) afterLogin(R.user);
    }
  }

  async function openWorkspace(w) {
    /* Finish saving the studio we are leaving before touching anything
       of the next one. */
    if (R.ready) {
      busy('Salvo…');
      await R.whenIdle();
      await A.saveNow();
      await R.whenIdle();
    }
    busy('Carico ' + w.name + '…');
    R.stop();
    R.ws = w.id;
    R.role = w.role;
    R.wsName = w.name;
    try { localStorage.setItem(LAST_WS, w.id); } catch (e) {}
    await R.loadMembers();
    await R.loadAll();
    R.start();
    if (!A.S.clients.length) return showFirstContent();
    A.finishBoot();
  }

  function showNoStudio() {
    var name = A.el('input', { class: 'inp', placeholder: 'Ideology', value: 'Ideology', required: true });
    var go = A.el('button', { class: 'btn primary', type: 'submit', text: 'Crea lo studio' });
    var form = A.el('form', { class: 'gate-form' }, [
      A.el('label', { class: 'field' }, [A.el('span', { text: 'Nome dello studio' }), name]), go
    ]);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      go.disabled = true;
      var r = await R.sb.rpc('create_workspace', { p_name: name.value.trim() || 'Studio' });
      go.disabled = false;
      if (r.error) { formError(form, italian(r.error)); return; }
      afterLogin(R.user);
    });
    screen('Non fai ancora parte di uno studio',
      'Se un collega ti ha invitato, chiedigli di controllare che l\'invito sia per ' + (R.user.email || 'questa email') +
      '. Se sei il primo, crea lo studio: ne diventi il proprietario.', [
        form,
        A.el('button', { class: 'btn ghost sm', type: 'button', text: 'Esci', onclick: function () { R.sb.auth.signOut(); } })
      ]);
  }

  /* An empty studio, the first time: start from this browser's own
     work, from the example, or from nothing. */
  function showFirstContent() {
    var local = null;
    try {
      var raw = localStorage.getItem('ideology.content.v1');
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && !parsed.__demo && Array.isArray(parsed.clients) && parsed.clients.length) local = parsed;
    } catch (e) { local = null; }

    var status = A.el('p', { class: 'gate-note' });
    function run(fill) {
      return async function () {
        Array.prototype.forEach.call(document.querySelectorAll('.gate-box button'), function (b) { b.disabled = true; });
        /* No autosave until every image is in Storage: the database
           refuses rows that still carry inline images. */
        R.paused = true;
        try {
          fill();
          R.remapIds();
          await R.uploadInlineMedia(function (n, tot) { status.textContent = 'Carico le immagini: ' + n + ' di ' + tot; });
          status.textContent = 'Salvo nello studio…';
          R.paused = false;
          await A.saveNow();
          if (A.ui.saveState === 'error') throw new Error('Una parte non è stata salvata: riprova dal pulsante in basso a sinistra.');
          A.finishBoot();
        } catch (e) {
          R.paused = false;
          status.textContent = italian(e);
          Array.prototype.forEach.call(document.querySelectorAll('.gate-box button'), function (b) { b.disabled = false; });
        }
      };
    }

    screen('Lo studio è vuoto', 'Da dove partiamo? Si fa una volta sola.', [
      local ? A.el('button', {
        class: 'btn primary', type: 'button',
        text: 'Porta qui il lavoro di questo browser (' + local.clients.length + (local.clients.length === 1 ? ' cliente' : ' clienti') + ')',
        onclick: run(function () { A.hydrate(JSON.parse(JSON.stringify(local))); })
      }) : null,
      A.el('button', {
        class: 'btn' + (local ? '' : ' primary'), type: 'button', text: 'Inizia con lo studio di esempio',
        onclick: run(function () { A.seed(); })
      }),
      A.el('button', {
        class: 'btn ghost', type: 'button', text: 'Inizia da zero',
        onclick: function () { A.finishBoot(); A.ui.section = 'clienti'; A.render(); }
      }),
      status
    ]);
  }

  /* ── Team ──────────────────────────────────────────────── */

  S.openTeam = async function () {
    var owner = R.role === 'owner';
    var body = A.el('div', { style: 'display:flex;flex-direction:column;gap:16px;' });
    A.modal({ title: 'Team · ' + R.wsName, body: [body], actions: [{ label: 'Chiudi', kind: 'primary' }] });

    async function paint() {
      A.clear(body);
      body.appendChild(A.el('p', { class: 'hint', text: 'Caricamento…' }));
      var members, invites;
      try {
        members = await R.loadMembers();
        var inv = await R.sb.from('workspace_invites').select('*').eq('workspace_id', R.ws).order('created_at');
        if (inv.error) throw inv.error;
        invites = inv.data;
      } catch (e) { A.clear(body); body.appendChild(A.el('p', { text: italian(e) })); return; }
      A.clear(body);

      body.appendChild(A.el('div', { class: 'team-me' }, [
        A.el('div', {}, [
          A.el('div', { class: 'tm-email', text: R.user.email || '' }),
          A.el('div', { class: 'hint', text: owner ? 'Proprietario' : 'Editor' })
        ]),
        A.el('button', { class: 'btn sm', text: 'Esci', onclick: function () { A.closeModal(); R.sb.auth.signOut(); } })
      ]));

      if (R.workspaces.length > 1) {
        var sel = A.el('select', { class: 'sel' });
        R.workspaces.forEach(function (w) { sel.appendChild(A.el('option', { value: w.id, text: w.name, selected: w.id === R.ws })); });
        sel.addEventListener('change', function () {
          var w = R.workspaces.filter(function (x) { return x.id === sel.value; })[0];
          if (w) { A.closeModal(); openWorkspace(w).catch(function (e) { S.problem('Lo studio non risponde', italian(e), S.start); }); }
        });
        body.appendChild(A.el('div', { class: 'field' }, [A.el('label', { text: 'Studio' }), sel]));
      }

      var list = A.el('div', { class: 'team-list' });
      members.forEach(function (m) {
        var me = m.user_id === R.user.id;
        list.appendChild(A.el('div', { class: 'team-row' }, [
          A.el('span', { class: 'tm-email', text: (m.display_name || m.email || 'Utente') + (me ? ' (tu)' : '') }),
          A.el('span', { class: 'tm-role', text: m.role === 'owner' ? 'Proprietario' : 'Editor' }),
          owner && !me ? A.el('button', {
            class: 'btn ghost sm', text: 'Rimuovi',
            onclick: function () {
              A.confirm({
                title: 'Rimuovere ' + (m.email || 'questo collega') + '?',
                body: 'Non vedrà più lo studio. Il suo lavoro resta.', ok: 'Rimuovi', danger: true,
                run: async function () {
                  var r = await R.sb.from('workspace_members').delete().eq('workspace_id', R.ws).eq('user_id', m.user_id);
                  A.toast(r.error ? italian(r.error) : 'Rimosso');
                  S.openTeam();
                }
              });
            }
          }) : null
        ]));
      });
      invites.forEach(function (i) {
        list.appendChild(A.el('div', { class: 'team-row pending' }, [
          A.el('span', { class: 'tm-email', text: i.email }),
          A.el('span', { class: 'tm-role', text: 'Invitato' }),
          owner ? A.el('button', {
            class: 'btn ghost sm', text: 'Annulla invito',
            onclick: async function () {
              var r = await R.sb.from('workspace_invites').delete().eq('workspace_id', R.ws).eq('email', i.email);
              if (r.error) A.toast(italian(r.error));
              paint();
            }
          }) : null
        ]));
      });
      body.appendChild(A.el('div', { class: 'field' }, [A.el('label', { text: 'Persone' }), list]));

      if (owner) {
        var email = A.el('input', { class: 'inp', type: 'email', placeholder: 'collega@ideology.it' });
        var role = A.el('select', { class: 'sel', style: 'max-width:140px;' }, [
          A.el('option', { value: 'editor', text: 'Editor' }),
          A.el('option', { value: 'owner', text: 'Proprietario' })
        ]);
        var add = A.el('button', {
          class: 'btn primary', type: 'button', text: 'Invita',
          onclick: async function () {
            var addr = email.value.trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { A.toast('Email non valida'); return; }
            add.disabled = true;
            var r = await R.sb.from('workspace_invites').insert({ workspace_id: R.ws, email: addr, role: role.value });
            add.disabled = false;
            if (r.error) { A.toast(r.error.code === '23505' ? 'Già invitato' : italian(r.error)); return; }
            A.toast('Invito inviato: lo vedrà al prossimo accesso');
            paint();
          }
        });
        body.appendChild(A.el('div', { class: 'field' }, [
          A.el('label', { text: 'Invita un collega' }),
          A.el('div', { style: 'display:flex;gap:7px;flex-wrap:wrap;' }, [email, role, add]),
          A.el('div', { class: 'hint', text: 'Al prossimo accesso con questa email il collega vede l\'invito e sceglie se accettare. ' +
            'L\'accesso si crea in Supabase → Authentication → Add user (spunta "Auto Confirm User").' })
        ]));
      }
    }
    paint();
  };
})(window.IDE);
