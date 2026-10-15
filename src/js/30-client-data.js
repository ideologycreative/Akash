/* ============================================================
   Ideology — the client link's data contract

   This file is the wall between the studio and the client.

   The client link is a separate page. It does not load the
   editor, the UGC planner, the client registry or anything else
   the studio uses — open its source and none of that code is
   there. What it loads is this file, which does exactly two
   things:

     read(token)    → the only data that client may see
     submit(...)    → the only changes that client may make

   Both are written as if a server were on the other side, and
   when 00-config.js names a Supabase project there is one: the
   `anteprima` Edge Function, backed by client_preview() and
   client_review() in Postgres, which enforce the same rules.
   The page calls load() and send(), which pick the route.

   What never crosses:
     · other clients — the token selects exactly one
     · drafts — the studio decides when something is ready
     · internal notes, approval history, cross-posting plans
     · UGC plans, creators, budgets, monthly commitments
     · the studio's own filters, settings or backup

   What the client may write: an approval, or a change request
   with a message. Nothing else, and only on their own content —
   addressed by id, never by position, so a reordered month can
   never route an approval onto the wrong post.
   ============================================================ */

window.IDEC = window.IDEC || {};

(function (C, A) {
  'use strict';

  var KEY = 'ideology.content.v1';

  /* The client's own vocabulary. The studio has five internal
     states; the client is shown four, in their own words, and
     only ever sees three of them. "Bozza" has no client-facing
     name because a draft never reaches this page. */
  C.STATES = {
    da_approvare: { key: 'da_approvare', label: 'Da rivedere',      c: 'var(--st-approvare)',  sub: 'var(--st-approvare-sub)',  todo: true },
    in_revisione: { key: 'in_revisione', label: 'Modifica chiesta', c: 'var(--st-revisione)',  sub: 'var(--st-revisione-sub)',  todo: false },
    approvato:    { key: 'approvato',    label: 'Approvato',        c: 'var(--st-approvato)',  sub: 'var(--st-approvato-sub)',  todo: false },
    pubblicato:   { key: 'pubblicato',   label: 'Pubblicato',       c: 'var(--st-pubblicato)', sub: 'var(--st-pubblicato-sub)', todo: false }
  };
  C.stateOf = function (k) { return C.STATES[k] || C.STATES.da_approvare; };

  /* Posts a draft never leaves the studio. */
  function isVisible(p) { return p && p.status && p.status !== 'bozza'; }

  /* True when the page is running on the baked-in example rather
     than on a document the studio actually wrote. The page says so,
     and the token check relaxes, because a demo nobody can open is
     not a demo. */
  C.isDemo = false;

  function readDoc() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        C.isDemo = !!parsed.__demo;
        return parsed;
      } catch (e) { /* unreadable — fall through to the example */ }
    }
    if (window.__IDEOLOGY_DEMO__) {
      C.isDemo = true;
      var demo = JSON.parse(JSON.stringify(window.__IDEOLOGY_DEMO__));
      demo.__demo = true;
      /* Persist it so an approval made here survives a reload, the
         way it would against a real document. */
      try { localStorage.setItem(KEY, JSON.stringify(demo)); } catch (e) {}
      return demo;
    }
    C.isDemo = false;
    return null;
  }

  /* One post, reduced to the fields a client may see. Written as
     an allow-list: a field added to the studio's record does not
     appear here until someone decides it should. */
  function projectPost(p, categories) {
    var cat = null;
    if (p.categoryId) {
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].id === p.categoryId) {
          cat = { name: categories[i].name, color: categories[i].color };
          break;
        }
      }
    }
    return {
      id: p.id,
      accountId: p.accountId,
      month: p.month,
      kind: p.kind,
      coverUrl: p.coverUrl || '',
      mediaUrl: p.mediaUrl || '',
      slides: (p.slides || []).map(function (s) { return { id: s.id, url: s.url || '' }; }),
      editorial: p.kind === 'editoriale'
        ? { eyebrow: (p.editorial || {}).eyebrow || '', title: (p.editorial || {}).title || '', sub: (p.editorial || {}).sub || '' }
        : null,
      date: p.date || '',
      showDate: !!p.showDate,
      caption: p.caption || '',
      category: cat,
      paid: !!p.paid,
      partner: (p.partner || '').trim(),
      status: p.status,
      clientNote: p.clientNote || '',
      clientNoteAt: p.clientNoteAt || '',
      revisions: p.revisions || 0
    };
  }

  /* GET /api/anteprima?c=<token> */
  C.read = function (token) {
    token = String(token || '').trim();
    var doc = readDoc();
    if (!doc || !Array.isArray(doc.clients)) return null;

    var cl = null;
    /* The token only. A slug is the client's name in lowercase —
       anyone could guess it, so it opens nothing. */
    doc.clients.forEach(function (c) {
      if (token && c.shareToken === token) cl = c;
    });
    if (cl && cl.shareEnabled === false) cl = null;      // switched off by the studio

    /* On the example document a missing token opens the first client,
       so the page can be looked at without one. Against a real
       document a token is always required. */
    if (!cl && C.isDemo && !token) cl = doc.clients[0] || null;
    if (!cl) return null;

    var accIds = {};
    (cl.accounts || []).forEach(function (a) { accIds[a.id] = 1; });

    var cats = (doc.categories || []).filter(function (c) { return c.clientId === cl.id; });

    /* A post can be published on more than one of the client's
       accounts. It is still one piece of content, so it is sent
       once per account it appears on, carrying the same id — the
       client approves the content, not a copy of it. */
    var posts = [];
    (doc.posts || []).forEach(function (p) {
      if (!isVisible(p)) return;
      var on = [];
      if (accIds[p.accountId]) on.push(p.accountId);
      (p.alsoOn || []).forEach(function (id) { if (accIds[id]) on.push(id); });
      if (!on.length) return;
      on.forEach(function (accId) {
        var out = projectPost(p, cats);
        out.accountId = accId;
        posts.push(out);
      });
    });

    posts.sort(function (a, b) {
      var ka = a.date || '￿', kb = b.date || '￿';
      return ka === kb ? 0 : ka.localeCompare(kb);
    });

    var months = {};
    posts.forEach(function (p) { if (p.month) months[p.month] = 1; });

    return {
      demo: C.isDemo,
      token: cl.shareToken,
      client: {
        name: cl.name,
        slug: cl.slug || '',
        palette: Object.assign({ bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C', alt: '#6E6256' }, cl.palette || {}),
        accounts: (cl.accounts || []).map(function (a) {
          var f = A.formatOfAccount(a);
          return {
            id: a.id, handle: a.handle || '', platform: a.platform || '',
            bio: a.bio || '', followers: a.followers || 0, following: a.following || 0,
            avatarUrl: a.avatarUrl || '',
            ratio: f.ratio, w: f.w, h: f.h, sizeLabel: f.sizeLabel
          };
        })
      },
      months: Object.keys(months).sort(),
      posts: posts
    };
  };

  /* POST /api/anteprima
     action: 'approva' | 'revisione' | 'annulla'

     Three guards, in order: the token must resolve to a client,
     the post must exist, and the post must belong to that
     client. Only then does a whitelisted write happen. */
  C.submit = function (token, postId, action, note) {
    var doc = readDoc();
    if (!doc) return { ok: false, error: 'Dati non disponibili' };

    var cl = null;
    (doc.clients || []).forEach(function (c) {
      if (token && c.shareToken === token) cl = c;
    });
    if (!cl && C.isDemo && !token) cl = doc.clients[0] || null;
    if (cl && cl.shareEnabled === false) cl = null;
    if (!cl) return { ok: false, error: 'Link non valido' };

    var accIds = {};
    (cl.accounts || []).forEach(function (a) { accIds[a.id] = 1; });

    var post = null;
    (doc.posts || []).forEach(function (p) { if (p.id === postId) post = p; });
    if (!post) return { ok: false, error: 'Contenuto non trovato' };

    var mine = accIds[post.accountId] ||
      (post.alsoOn || []).some(function (id) { return accIds[id]; });
    if (!mine) return { ok: false, error: 'Contenuto non disponibile' };
    if (!isVisible(post)) return { ok: false, error: 'Contenuto non disponibile' };

    /* The same transitions the database allows (client_review):
       published content is closed, and repeating an answer is a no-op. */
    var from = post.status;
    var to, allowed;
    if (action === 'approva') { to = 'approvato'; allowed = ['da_approvare', 'in_revisione']; }
    else if (action === 'revisione') { to = 'in_revisione'; allowed = ['da_approvare', 'approvato', 'in_revisione']; }
    else if (action === 'annulla') { to = 'da_approvare'; allowed = ['approvato', 'in_revisione']; }
    else return { ok: false, error: 'Azione non riconosciuta' };
    if (from === to && action !== 'revisione') return { ok: true, status: to };
    if (allowed.indexOf(from) < 0) return { ok: false, error: 'Questo contenuto non si può più modificare da qui' };

    if (action === 'revisione') {
      var msg = String(note || '').trim();
      if (!msg) return { ok: false, error: 'Serve un messaggio' };
      /* The client's words go in the client's field. The studio's
         internal note is never touched — in the tool this replaces,
         the two shared one field and a change request overwrote
         whatever the studio had written to itself. */
      post.clientNote = msg.slice(0, 2000);
      post.clientNoteAt = new Date().toISOString();
      post.revisions = (post.revisions || 0) + 1;
    }

    post.status = to;
    if (!Array.isArray(post.history)) post.history = [];
    post.history.push({
      at: new Date().toISOString(),
      from: from, to: to, by: 'cliente',
      note: action === 'revisione' ? post.clientNote : ''
    });

    try {
      doc.savedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(doc));
    } catch (e) {
      return { ok: false, error: 'Salvataggio non riuscito' };
    }
    return { ok: true, status: to };
  };

  /* ── The network path ─────────────────────────────────
     When 00-config.js names a Supabase project, the same two calls go
     to the `anteprima` Edge Function instead of this browser's
     storage. The page only ever uses load/send, so it cannot tell
     the difference — and the answer has the same shape either way. */

  var CFG = window.IDEOLOGY_CONFIG || {};
  C.misconfigured = !!(CFG.supabaseKey && A.looksSecretKey(CFG.supabaseKey));
  C.remote = !!(CFG.supabaseUrl && CFG.supabaseKey) && !C.misconfigured;
  C.endpoint = C.remote ? String(CFG.supabaseUrl).replace(/\/+$/, '') + '/functions/v1/anteprima' : '';

  /* The server sends one entry per post with the client's accounts
     it appears on; the page wants one entry per account. */
  function shape(raw, token) {
    var accounts = (raw.accounts || []).map(function (a) {
      var f = A.formatOfAccount(a);
      return {
        id: a.id, handle: a.handle || '', platform: a.platform || '',
        bio: a.bio || '', followers: a.followers || 0, following: a.following || 0,
        avatarUrl: a.avatarUrl || '',
        ratio: f.ratio, w: f.w, h: f.h, sizeLabel: f.sizeLabel
      };
    });
    var posts = [];
    (raw.posts || []).forEach(function (p) {
      (p.accountIds || []).forEach(function (accId) {
        var out = {
          id: p.id, accountId: accId, month: p.month, kind: p.kind,
          coverUrl: p.coverUrl || '', mediaUrl: p.mediaUrl || '',
          slides: (p.slides || []).map(function (s) { return { id: s.id, url: s.url || '' }; }),
          editorial: p.editorial || null,
          date: p.date || '', showDate: !!p.showDate, caption: p.caption || '',
          category: p.category || null, paid: !!p.paid, partner: p.partner || '',
          status: p.status, clientNote: p.clientNote || '', clientNoteAt: p.clientNoteAt || '',
          revisions: p.revisions || 0
        };
        posts.push(out);
      });
    });
    var months = {};
    posts.forEach(function (p) { if (p.month) months[p.month] = 1; });
    return {
      demo: false,
      token: token,
      loadedAt: Date.now(),
      client: {
        name: raw.client.name,
        slug: raw.client.slug || '',
        palette: Object.assign({ bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C', alt: '#6E6256' }, raw.client.palette || {}),
        accounts: accounts
      },
      months: Object.keys(months).sort(),
      posts: posts
    };
  }

  /* → the data, or null for a link that opens nothing. Throws only when
     the server cannot be reached, so the page can say "try again"
     instead of "invalid link". */
  C.load = function (token) {
    if (!C.remote) return Promise.resolve(C.read(token));
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token || '')) return Promise.resolve(null);
    return fetch(C.endpoint, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'read', token: token })
    }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Il server non risponde (' + res.status + ')');
      return res.json().then(function (j) { return shape(j, token); });
    });
  };

  C.send = function (token, postId, action, note) {
    if (!C.remote) return Promise.resolve(C.submit(token, postId, action, note));
    return fetch(C.endpoint, {
      method: 'POST',
      headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'review', token: token, postId: postId, action: action, note: note || '' })
    }).then(function (res) {
      return res.json().then(function (j) {
        return j && j.ok ? { ok: true, status: j.status } : { ok: false, error: (j && j.error) || 'Non è andato a buon fine' };
      }, function () { return { ok: false, error: 'Risposta non valida dal server' }; });
    }, function () {
      return { ok: false, error: 'Connessione assente. Riprova tra un momento.' };
    });
  };

  /* The token lives in the fragment (#c=…): browsers never send the
     fragment to a server, so it stays out of every access log and every
     Referer. Links in the older ?c= form still open, and are moved into
     the fragment straight away so they leave the address bar too. */
  C.tokenFromUrl = function () {
    var m = /[#&]c=([^&]+)/.exec(location.hash);
    if (m) return decodeURIComponent(m[1]);
    m = /[?&](?:c|cliente)=([^&]+)/.exec(location.search);
    if (!m) return '';
    var token = decodeURIComponent(m[1]);
    try { history.replaceState(null, '', location.pathname + '#c=' + encodeURIComponent(token)); } catch (e) {}
    return token;
  };
})(window.IDEC, window.IDE);
