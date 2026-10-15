/* ============================================================
   Ideology — the shared studio (Supabase)

   Off unless 00-config.js names a project. Then this file swaps
   the browser-only document for the studio's database, without
   any other module changing how it edits data.

   How saving works
   ────────────────
   Every edit in the app mutates the in-memory state and calls
   A.commit(). A moment later A.save() runs flush(), which:

     1. turns every record into the row it would be in Postgres
     2. compares each row with the last version the server confirmed
        (the "base")
     3. sends only what differs: one insert per table for new rows,
        one update per changed row carrying only the changed columns,
        one delete per table for removed rows

   Because the work is recomputed from state each time instead of
   queued, a failed or interrupted save is simply retried: nothing
   is ever lost from a queue, and nothing is sent twice.

   Two people, one post
   ────────────────────
   Every row has a version only the database increments. An update
   says "only if you are still at version N". If someone saved in
   between, nothing is written and we merge field by field:

     · fields only I changed        → mine are kept and resent
     · fields only they changed     → theirs are taken
     · the same field, differently  → I am asked which to keep

   Colleagues' changes arrive live (Supabase Realtime). A record
   with unsaved local edits is never overwritten by them; the
   version check on the next save reconciles it instead.
   ============================================================ */

(function (A) {
  'use strict';

  var CFG = window.IDEOLOGY_CONFIG || {};

  var R = A.remote = {
    on: false, sb: null, user: null, paused: false,
    ws: null, wsName: '', role: '',
    workspaces: [], members: {}, ready: false
  };

  var looksSecret = A.looksSecretKey;

  R.configured = function () {
    return !!(CFG.supabaseUrl && CFG.supabaseKey);
  };
  R.misconfigured = '';
  if (R.configured()) {
    if (looksSecret(CFG.supabaseKey)) {
      R.misconfigured = 'La chiave in 00-config.js è una chiave segreta (service role). ' +
        'Nella pagina va solo la chiave pubblica (publishable / anon).';
    } else if (!window.supabase || !window.supabase.createClient) {
      R.misconfigured = 'Libreria Supabase non caricata.';
    } else {
      R.on = true;
    }
  }

  /* ── Values: one canonical form per column ──────────────
     Comparisons happen on canonical rows, so the server's
     "14:30:00" and our "14:30", or its microsecond timestamps
     and our milliseconds, never look like a change. */

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }
  R.isUuid = isUuid;

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* JSON with sorted keys: jsonb does not keep key order. */
  function stable(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  R.stable = stable;

  function noTransient(o) {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(noTransient);
    var out = {};
    Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = noTransient(o[k]); });
    return out;
  }

  var V = {
    str:   { row: function (v) { return v == null ? '' : String(v); },
             rec: function (v) { return v == null ? '' : String(v); } },
    bool:  { row: function (v) { return !!v; }, rec: function (v) { return !!v; } },
    boolT: { row: function (v) { return v === undefined || v === null ? true : !!v; },
             rec: function (v) { return v === undefined || v === null ? true : !!v; } },
    int:   { row: function (v) { var n = Math.round(Number(v)); return isFinite(n) ? n : 0; },
             rec: function (v) { var n = Math.round(Number(v)); return isFinite(n) ? n : 0; } },
    num:   { row: function (v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; },
             rec: function (v) { var n = Number(v); return isFinite(n) ? n : 0; } },
    obj:   { row: function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? noTransient(clone(v)) : {}; },
             rec: function (v) { return v && typeof v === 'object' && !Array.isArray(v) ? clone(v) : {}; } },
    list:  { row: function (v) { return Array.isArray(v) ? noTransient(clone(v)) : []; },
             rec: function (v) { return Array.isArray(v) ? clone(v) : []; } },
    ids:   { row: function (v) { return Array.isArray(v) ? v.filter(isUuid) : []; },
             rec: function (v) { return Array.isArray(v) ? v.slice() : []; } },
    ref:   { row: function (v) { return isUuid(v) ? v : null; },
             rec: function (v) { return v || ''; } },
    date:  { row: function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null; },
             rec: function (v) { return v ? String(v).slice(0, 10) : ''; } },
    time:  { row: function (v) { return /^\d{2}:\d{2}/.test(v || '') ? String(v).slice(0, 5) : null; },
             rec: function (v) { return v ? String(v).slice(0, 5) : ''; } },
    ts:    { row: function (v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toISOString() : null; },
             rec: function (v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toISOString() : ''; } }
  };

  /* ── Mapping: store records ↔ table rows ────────────────
     Tables in foreign-key order: inserts run top to bottom,
     deletes bottom to top. */

  var TABLES = [
    { name: 'workspaces', single: true, cols: [
      ['prefs', 'prefs', V.obj]
    ] },
    { name: 'clients', coll: 'clients', cols: [
      ['name', 'name', V.str], ['slug', 'slug', V.str], ['slugLocked', 'slug_locked', V.bool],
      ['status', 'status', V.str], ['note', 'note', V.str], ['goals', 'goals', V.obj],
      ['palette', 'palette', V.obj], ['shareToken', 'share_token', V.str],
      ['shareEnabled', 'share_enabled', V.boolT]
    ] },
    { name: 'accounts', nested: true, cols: [
      ['clientId', 'client_id', V.ref], ['handle', 'handle', V.str], ['platform', 'platform', V.str],
      ['ratio', 'ratio', V.str], ['bio', 'bio', V.str], ['followers', 'followers', V.int],
      ['following', 'following', V.int], ['avatarUrl', 'avatar', V.str]
    ] },
    { name: 'categories', coll: 'categories', cols: [
      ['clientId', 'client_id', V.ref], ['name', 'name', V.str], ['color', 'color', V.str],
      ['description', 'description', V.str]
    ] },
    { name: 'creators', coll: 'creators', cols: [
      ['clientId', 'client_id', V.ref], ['name', 'name', V.str], ['handle', 'handle', V.str],
      ['followers', 'followers', V.int], ['fee', 'fee', V.num], ['status', 'status', V.str],
      ['note', 'note', V.str]
    ] },
    { name: 'posts', coll: 'posts', cols: [
      ['accountId', 'account_id', V.ref], ['month', 'month', V.str], ['order', 'sort_order', V.int],
      ['kind', 'kind', V.str], ['mediaUrl', 'media', V.str], ['coverUrl', 'cover', V.str],
      ['slides', 'slides', V.list], ['date', 'publish_date', V.date], ['time', 'publish_time', V.time],
      ['showDate', 'show_date', V.boolT], ['caption', 'caption', V.str],
      ['categoryId', 'category_id', V.ref], ['paid', 'paid', V.bool], ['partner', 'partner', V.str],
      ['videoName', 'video_name', V.str], ['alsoOn', 'also_on', V.ids],
      ['inStories', 'in_stories', V.bool], ['storyIds', 'story_ids', V.ids],
      ['editorial', 'editorial', V.obj], ['status', 'status', V.str],
      ['revisions', 'revisions', V.int], ['internalNote', 'internal_note', V.str],
      ['clientNote', 'client_note', V.str], ['clientNoteAt', 'client_note_at', V.ts]
    ], insertOnly: [['createdAt', 'created_at', V.ts]] },
    { name: 'stories', coll: 'stories', cols: [
      ['accountId', 'account_id', V.ref], ['month', 'month', V.str], ['order', 'sort_order', V.int],
      ['kind', 'kind', V.str], ['title', 'title', V.str], ['mediaUrl', 'media', V.str],
      ['frames', 'frames', V.list], ['date', 'story_date', V.date], ['note', 'note', V.str],
      ['isUgc', 'is_ugc', V.bool], ['status', 'status', V.str], ['fromPostId', 'from_post_id', V.ref]
    ] },
    { name: 'highlights', coll: 'highlights', cols: [
      ['accountId', 'account_id', V.ref], ['title', 'title', V.str], ['coverUrl', 'cover', V.str],
      ['storyIds', 'story_ids', V.ids]
    ] },
    { name: 'ugc_slots', coll: 'ugcSlots', cols: [
      ['accountId', 'account_id', V.ref], ['date', 'slot_date', V.date], ['mode', 'mode', V.str],
      ['status', 'status', V.str], ['brief', 'brief', V.str], ['creatorId', 'creator_id', V.ref],
      ['note', 'note', V.str]
    ] }
  ];
  var BY_NAME = {};
  TABLES.forEach(function (t) { BY_NAME[t.name] = t; });
  R.TABLES = TABLES;

  function eachRecord(t, fn) {
    var S = A.S;
    if (t.single) { if (R.ws) fn({ id: R.ws, prefs: S.prefs }, null); return; }
    if (t.nested) {
      S.clients.forEach(function (c) { (c.accounts || []).forEach(function (a) { fn(a, c); }); });
      return;
    }
    (S[t.coll] || []).forEach(function (r) { fn(r, null); });
  }

  function toRow(t, rec, parent) {
    var row = {};
    t.cols.forEach(function (c) {
      var v = (t.nested && c[0] === 'clientId') ? (parent ? parent.id : rec.clientId) : rec[c[0]];
      row[c[1]] = c[2].row(v);
    });
    return row;
  }
  R.toRow = function (tableName, rec, parent) { return toRow(BY_NAME[tableName], rec, parent); };

  function fromRow(t, row) {
    var rec = { id: row.id };
    t.cols.concat(t.insertOnly || []).forEach(function (c) { rec[c[0]] = c[2].rec(row[c[1]]); });
    return rec;
  }
  R.fromRow = function (tableName, row) { return fromRow(BY_NAME[tableName], row); };

  function canon(t, serverRow) {
    var rec = fromRow(t, serverRow);
    return toRow(t, rec, t.nested ? { id: serverRow.client_id } : null);
  }

  /* ── The base: what the server last confirmed ──────────── */

  var base = {};            // 'table:id' → { row, s, version }
  var baseEvents = {};      // post_events id → true
  var rejected = {};        // 'table:id' → row string the server refused
  var conflicts = {};       // 'table:id' → pending question
  R._base = base;

  function keyOf(t, id) { return t.name + ':' + id; }

  function setBase(t, serverRow) {
    var row = canon(t, serverRow);
    base[keyOf(t, serverRow.id)] = { row: row, s: stable(row), version: serverRow.version, by: serverRow.updated_by };
  }

  function snapshot() {
    var out = {};
    TABLES.forEach(function (t) {
      eachRecord(t, function (rec, parent) {
        if (!isUuid(rec.id)) return;
        var row = toRow(t, rec, parent);
        out[keyOf(t, rec.id)] = { t: t, id: rec.id, rec: rec, parent: parent, row: row, s: stable(row) };
      });
    });
    return out;
  }

  function findLocal(t, id) {
    var hit = null;
    eachRecord(t, function (rec, parent) { if (!hit && rec.id === id) hit = { rec: rec, parent: parent }; });
    return hit;
  }

  function isPending(t, id) {
    var b = base[keyOf(t, id)];
    var loc = findLocal(t, id);
    if (!loc) return !!b;
    if (!b) return true;
    return stable(toRow(t, loc.rec, loc.parent)) !== b.s;
  }

  R.pendingCount = function () {
    if (!R.ready) return 0;
    var snap = snapshot(), n = 0;
    Object.keys(snap).forEach(function (k) { if (!base[k] || base[k].s !== snap[k].s) n++; });
    Object.keys(base).forEach(function (k) { if (!snap[k]) n++; });
    return n;
  };

  /* Write a row's values into an existing record, field by field, so
     every open editor holding that object sees the new values and
     nothing the row does not carry (history, UI flags) is lost. */
  function writeInto(t, rec, row) {
    var fresh = fromRow(t, Object.assign({ id: rec.id }, row));
    t.cols.forEach(function (c) {
      if (t.nested && c[0] === 'clientId') return;
      rec[c[0]] = fresh[c[0]];
    });
    if (t.single) A.S.prefs = rec.prefs;
  }

  function addLocal(t, serverRow) {
    var rec = fromRow(t, serverRow);
    if (t.single) { A.S.prefs = rec.prefs; return true; }
    if (t.nested) {
      var cl = null;
      A.S.clients.forEach(function (c) { if (c.id === serverRow.client_id) cl = c; });
      if (!cl) return false;
      delete rec.clientId;
      (cl.accounts = cl.accounts || []).push(rec);
      return true;
    }
    if (t.name === 'posts') rec.history = [];
    A.S[t.coll].push(rec);
    return true;
  }

  function removeLocal(t, id) {
    if (t.single) return;
    if (t.nested) {
      A.S.clients.forEach(function (c) {
        c.accounts = (c.accounts || []).filter(function (a) { return a.id !== id; });
      });
      return;
    }
    A.S[t.coll] = A.S[t.coll].filter(function (r) { return r.id !== id; });
  }

  /* ── Network helpers ──────────────────────────────────── */

  function isNetworkError(err) {
    if (!err) return false;
    var m = String(err.message || err);
    return !err.code && /fetch|network|load failed|timeout|offline/i.test(m);
  }

  function boom(res) {
    var e = new Error((res.error && res.error.message) || 'errore');
    e.code = res.error && res.error.code;
    e.details = res.error && res.error.details;
    e.network = isNetworkError(res.error);
    throw e;
  }

  /* Paged, because the API caps a response at 1000 rows. Ordered by
     creation so a reload shows things in the order they were made. */
  async function fetchAll(table) {
    var out = [], from = 0, page = 1000;
    var by = table === 'post_events' ? 'at' : 'created_at';
    for (;;) {
      var res = await R.sb.from(table).select('*')
        .eq('workspace_id', R.ws)
        .order(by, { ascending: true }).order('id', { ascending: true })
        .range(from, from + page - 1);
      if (res.error) boom(res);
      out = out.concat(res.data);
      if (res.data.length < page) return out;
      from += page;
    }
  }

  /* ── Loading ───────────────────────────────────────────── */

  R.loadAll = async function () {
    R.gen++;
    var wsRes = await R.sb.from('workspaces').select('*').eq('id', R.ws).single();
    if (wsRes.error) boom(wsRes);

    var rows = {};
    for (var i = 0; i < TABLES.length; i++) {
      var t = TABLES[i];
      if (t.single) continue;
      rows[t.name] = await fetchAll(t.name);
    }
    var events = await fetchAll('post_events');

    Object.keys(base).forEach(function (k) { delete base[k]; });
    Object.keys(baseEvents).forEach(function (k) { delete baseEvents[k]; });

    var doc = { v: 1, prefs: fromRow(BY_NAME.workspaces, wsRes.data).prefs,
      clients: [], posts: [], stories: [], highlights: [], ugcSlots: [], creators: [], categories: [] };
    R.wsName = wsRes.data.name;
    setBase(BY_NAME.workspaces, wsRes.data);

    var clientsById = {};
    rows.clients.forEach(function (r) {
      var c = fromRow(BY_NAME.clients, r);
      c.accounts = [];
      clientsById[c.id] = c;
      doc.clients.push(c);
      setBase(BY_NAME.clients, r);
    });
    rows.accounts.forEach(function (r) {
      var a = fromRow(BY_NAME.accounts, r);
      delete a.clientId;
      if (clientsById[r.client_id]) clientsById[r.client_id].accounts.push(a);
      setBase(BY_NAME.accounts, r);
    });
    var postsById = {};
    TABLES.forEach(function (t) {
      if (t.single || t.nested || t.name === 'clients') return;
      rows[t.name].forEach(function (r) {
        var rec = fromRow(t, r);
        if (t.name === 'posts') { rec.history = []; postsById[rec.id] = rec; }
        doc[t.coll].push(rec);
        setBase(t, r);
      });
    });
    events.forEach(function (e) {
      baseEvents[e.id] = true;
      var p = postsById[e.post_id];
      if (p) p.history.push(eventToEntry(e));
    });

    A.hydrate(doc);
    await R.preloadMedia();
    R.ready = true;
  };

  function eventToEntry(e) {
    return { id: e.id, at: e.at, from: e.from_status || '', to: e.to_status, by: e.actor, note: e.note || '', user: e.actor_user || '' };
  }

  /* ── Saving ────────────────────────────────────────────── */

  var flushing = false, again = false, retryTimer = null, retryDelay = 2000;
  var fkMiss = {};

  /* A save belongs to the studio it started in. Switching studio, or
     reloading, bumps the generation; a save from the old generation
     stops at its next step instead of writing the old studio's rows
     into the new one's bookkeeping. */
  R.gen = 0;
  var flushGen = -1, flushWs = null;
  var ABORT = { aborted: true };
  function alive() {
    if (R.gen !== flushGen || R.ws !== flushWs) throw ABORT;
  }

  var idleWaiters = [];
  R.whenIdle = function () {
    if (!flushing) return Promise.resolve();
    return new Promise(function (resolve) { idleWaiters.push(resolve); });
  };

  R.flush = async function () {
    if (!R.ready || R.paused) return;
    if (flushing) { again = true; return; }
    flushing = true;
    flushGen = R.gen; flushWs = R.ws;
    A.setSaveState('saving');
    try {
      do {
        again = false;
        await flushOnce();
      } while (again);
      retryDelay = 2000;
      A.setSaveState(settledState());
    } catch (e) {
      if (e === ABORT) {
        /* the studio changed under this save: nothing more to do here */
      } else if (e.network) {
        A.setSaveState('offline');
        clearTimeout(retryTimer);
        retryTimer = setTimeout(function () { R.flush(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      } else {
        console.error('[Ideology] salvataggio', e);
        A.setSaveState('error');
        A.toast('Salvataggio non riuscito: ' + e.message);
      }
    } finally {
      flushing = false;
      var w = idleWaiters; idleWaiters = [];
      w.forEach(function (fn) { fn(); });
      A.renderSaveState && A.renderSaveState();
    }
  };

  /* After a save: a question waiting → 'conflict'; a row the server
     refused → 'error'; edits that arrived during the save → 'pending'
     (their own save is already scheduled); otherwise 'saved'. */
  function settledState() {
    if (Object.keys(conflicts).length) return 'conflict';
    var snap = snapshot(), refused = false, left = false;
    Object.keys(rejected).forEach(function (k) {
      if (!snap[k] || snap[k].s !== rejected[k]) delete rejected[k];
    });
    Object.keys(snap).forEach(function (k) {
      if (base[k] && base[k].s === snap[k].s) return;
      if (rejected[k] === snap[k].s) refused = true; else left = true;
    });
    Object.keys(base).forEach(function (k) { if (!snap[k]) left = true; });
    if (refused) return 'error';
    return left ? 'pending' : 'saved';
  }
  R.settledState = settledState;

  async function flushOnce() {
    alive();
    var snap = snapshot();
    var keys = Object.keys(snap);
    var known = Object.keys(base);          // deletions are judged against this, not a later base

    for (var i = 0; i < TABLES.length; i++) {
      var t = TABLES[i];
      var ins = [], ups = [];
      keys.forEach(function (k) {
        var e = snap[k];
        if (e.t !== t || conflicts[k]) return;
        if (rejected[k] === e.s) return;
        var b = base[k];
        if (!b) { if (!t.single) ins.push(e); }
        else if (b.s !== e.s) ups.push(e);
      });
      for (var j = 0; j < ins.length; j += 200) { await insertRows(t, ins.slice(j, j + 200)); alive(); }
      for (var u = 0; u < ups.length; u++) { await updateRow(t, ups[u]); alive(); }
    }

    for (var d = TABLES.length - 1; d >= 0; d--) {
      var td = TABLES[d];
      if (td.single) continue;
      var gone = known.filter(function (k) {
        return k.indexOf(td.name + ':') === 0 && !snap[k] && base[k];
      }).map(function (k) { return k.slice(td.name.length + 1); });
      for (var g = 0; g < gone.length; g += 200) {
        var chunk = gone.slice(g, g + 200);
        alive();
        var res = await R.sb.from(td.name).delete().in('id', chunk);
        alive();
        if (res.error) boom(res);
        chunk.forEach(function (id) { delete base[keyOf(td, id)]; });
      }
    }

    alive();
    await flushEvents();
  }

  async function insertRows(t, entries) {
    var payload = entries.map(function (e) {
      var row = Object.assign({ id: e.id, workspace_id: R.ws }, e.row);
      /* Every row of a batch carries the same keys: PostgREST takes the
         column list from the first object. */
      (t.insertOnly || []).forEach(function (c) {
        row[c[1]] = c[2].row(e.rec[c[0]]) || new Date().toISOString();
      });
      return row;
    });
    var res = await R.sb.from(t.name).insert(payload).select();
    alive();
    if (!res.error) {
      res.data.forEach(function (r) {
        var e = entries.filter(function (x) { return x.id === r.id; })[0];
        setBase(t, r);
        delete fkMiss[keyOf(t, r.id)];
        if (e) adoptServer(t, e, r);
      });
      return;
    }
    if (isNetworkError(res.error)) boom(res);
    if (entries.length > 1) {
      for (var i = 0; i < entries.length; i++) await insertRows(t, [entries[i]]);
      return;
    }
    var e = entries[0];
    if (res.error.code === '23505') {
      /* Already there — our earlier insert landed but its answer was
         lost. Adopt the server's row; any difference becomes an update. */
      var got = await R.sb.from(t.name).select('*').eq('id', e.id).maybeSingle();
      alive();
      if (got.error) boom(got);
      if (got.data) { setBase(t, got.data); again = true; return; }
    }
    if (res.error.code === '23503') {
      /* A parent this row points at is not on the server. Usually it is
         being saved in this same pass — try again once or twice, then
         report it instead of leaving it silently unsaved. */
      var k = keyOf(t, e.id);
      fkMiss[k] = (fkMiss[k] || 0) + 1;
      if (fkMiss[k] <= 2) { again = true; return; }
    }
    refuse(t, e, res.error);
  }

  async function updateRow(t, e) {
    var k = keyOf(t, e.id), b = base[k];
    var patch = {};
    Object.keys(e.row).forEach(function (col) {
      if (stable(e.row[col]) !== stable(b.row[col])) patch[col] = e.row[col];
    });
    patch.version = b.version;
    var res = await R.sb.from(t.name).update(patch).eq('id', e.id).eq('version', b.version).select();
    alive();
    if (res.error) {
      if (isNetworkError(res.error)) boom(res);
      if (res.error.code === '40001') return reconcile(t, e);
      return refuse(t, e, res.error);
    }
    if (!res.data.length) return reconcile(t, e);
    setBase(t, res.data[0]);
    adoptServer(t, e, res.data[0]);
  }

  /* The database has the last word on some columns (it keeps the
     client's own feedback, normalises values). Where its answer differs
     from what we sent, and the field has not been edited again since,
     take its value — otherwise the difference would be resent forever. */
  function adoptServer(t, e, serverRow) {
    var srv = canon(t, serverRow);
    var loc = findLocal(t, e.id);
    if (!loc) return;
    var now = toRow(t, loc.rec, loc.parent), fix = null;
    Object.keys(e.row).forEach(function (col) {
      if (stable(srv[col]) === stable(e.row[col])) return;      // accepted as sent
      if (stable(now[col]) !== stable(e.row[col])) return;      // edited again meanwhile: keep
      (fix = fix || {})[col] = srv[col];
    });
    if (!fix) return;
    var merged = Object.assign({}, now, fix);
    var before = clone(loc.rec);
    writeInto(t, loc.rec, merged);
    changed(t.name, e.id, diffFields(before, loc.rec));
  }

  function refuse(t, e, err) {
    rejected[keyOf(t, e.id)] = e.s;
    console.error('[Ideology] il server ha rifiutato', t.name, e.id, err);
    A.toast('Una modifica non è stata salvata (' + (err.message || err.code) + ')');
  }

  /* ── Conflicts ─────────────────────────────────────────── */

  var LABELS = {
    caption: 'Didascalia', publish_date: 'Data', publish_time: 'Ora', status: 'Stato',
    media: 'Media', cover: 'Copertina', slides: 'Slide', kind: 'Formato', category_id: 'Categoria',
    paid: 'Sponsorizzato', partner: 'Collaborazione', internal_note: 'Nota interna',
    also_on: 'Pubblicato anche su', in_stories: 'Anche nelle Stories', editorial: 'Testo della card',
    title: 'Titolo', note: 'Nota', name: 'Nome', handle: 'Account', bio: 'Bio', brief: 'Brief',
    frames: 'Fotogrammi', story_date: 'Data', slot_date: 'Data', prefs: 'Impostazioni',
    palette: 'Colori', goals: 'Obiettivi', description: 'Descrizione', color: 'Colore',
    month: 'Mese', sort_order: 'Ordine', show_date: 'Mostra data', creator_id: 'Creator',
    mode: 'Modalità', fee: 'Compenso', followers: 'Follower', following: 'Seguiti',
    avatar: 'Immagine profilo', video_name: 'Video', story_ids: 'Stories collegate', ratio: 'Formato',
    platform: 'Piattaforma', share_token: 'Link cliente', share_enabled: 'Link cliente attivo'
  };

  R.whoIs = function (userId) {
    if (!userId) return 'il cliente';
    if (R.user && userId === R.user.id) return 'tu, da un\'altra finestra';
    var m = R.members[userId];
    return m ? (m.display_name || m.email || 'un collega') : 'un collega';
  };

  async function reconcile(t, e) {
    var k = keyOf(t, e.id), b = base[k];
    var got = await R.sb.from(t.name).select('*').eq('id', e.id).maybeSingle();
    alive();
    if (got.error) boom(got);

    if (!got.data) {
      removeLocal(t, e.id);
      delete base[k];
      A.index(); A.scheduleRender();
      A.toast('Un elemento che stavi modificando è stato eliminato da un collega');
      return;
    }

    /* "Mine" is the record as it is now, not as it was when this save
       started: anything typed while the request was in flight stays. */
    var theirs = canon(t, got.data);
    var loc = findLocal(t, e.id) || { rec: e.rec, parent: e.parent };
    var mine = toRow(t, loc.rec, loc.parent);
    var merged = {}, clash = [];
    Object.keys(mine).forEach(function (col) {
      var bs = stable(b.row[col]), ls = stable(mine[col]), ts = stable(theirs[col]);
      if (ls === bs) merged[col] = theirs[col];
      else if (ts === bs || ts === ls) merged[col] = mine[col];
      else { clash.push(col); merged[col] = mine[col]; }
    });

    setBase(t, got.data);
    var before = clone(loc.rec);
    writeInto(t, loc.rec, merged);
    changed(t.name, e.id, diffFields(before, loc.rec));

    if (!clash.length) { again = true; return; }

    conflicts[k] = { t: t, id: e.id, rec: loc.rec, cols: clash, theirs: theirs, by: got.data.updated_by };
    showConflicts();
  }

  function describe(c) {
    var r = c.rec;
    if (c.t.name === 'posts') {
      var first = (r.caption || '').split('\n')[0].trim().slice(0, 40);
      return 'il contenuto' + (r.date ? ' del ' + A.dayLabel(r.date) : '') + (first ? ' «' + first + '…»' : '');
    }
    if (c.t.name === 'clients') return 'il cliente ' + (r.name || '');
    if (c.t.name === 'stories') return 'la story ' + (r.title ? '«' + r.title + '»' : '');
    return 'un elemento';
  }

  function showConflicts() {
    var host = document.getElementById('conflict-bar');
    if (!host) {
      host = A.el('div', { id: 'conflict-bar', class: 'conflict-bar', role: 'alertdialog', 'aria-live': 'assertive' });
      document.body.appendChild(host);
    }
    A.clear(host);
    var keys = Object.keys(conflicts);
    if (!keys.length) { host.remove(); A.setSaveState(R.pendingCount() ? 'pending' : 'saved'); return; }
    var c = conflicts[keys[0]];
    host.appendChild(A.el('div', { class: 'cb-text' }, [
      A.el('strong', { text: 'Modifiche in contemporanea. ' }),
      document.createTextNode('Mentre lavoravi su ' + describe(c) + ', ' + R.whoIs(c.by) +
        ' ha cambiato: ' + c.cols.map(function (col) { return LABELS[col] || col; }).join(', ') + '.'),
      keys.length > 1 ? A.el('span', { class: 'cb-more', text: ' (+' + (keys.length - 1) + ')' }) : null
    ]));
    host.appendChild(A.el('div', { class: 'cb-actions' }, [
      A.el('button', { class: 'btn sm', text: 'Usa la loro versione', onclick: function () { settle(keys[0], 'theirs'); } }),
      A.el('button', { class: 'btn primary sm', text: 'Tieni la mia', onclick: function () { settle(keys[0], 'mine'); } })
    ]));
    A.setSaveState('conflict');
  }

  function settle(k, choice) {
    var c = conflicts[k];
    if (!c) return;
    delete conflicts[k];
    if (choice === 'theirs') {
      var patch = {};
      c.cols.forEach(function (col) { patch[col] = c.theirs[col]; });
      var loc = findLocal(c.t, c.id);
      if (loc) {
        var row = toRow(c.t, loc.rec, loc.parent);
        Object.assign(row, patch);
        var before = clone(loc.rec);
        writeInto(c.t, loc.rec, row);
        changed(c.t.name, c.id, diffFields(before, loc.rec));
      }
      A.render();
    }
    showConflicts();
    R.flush();
  }
  R._conflicts = conflicts;
  R._settle = settle;

  /* ── History ───────────────────────────────────────────── */

  async function flushEvents() {
    var rows = [], entries = [];
    A.S.posts.forEach(function (p) {
      if (!base[keyOf(BY_NAME.posts, p.id)]) return;      // post not on the server yet
      (p.history || []).forEach(function (h) {
        if (!isUuid(h.id)) h.id = A.uuid();
        if (baseEvents[h.id]) return;
        rows.push({
          id: h.id, workspace_id: R.ws, post_id: p.id,
          at: V.ts.row(h.at) || new Date().toISOString(),
          from_status: h.from || null, to_status: h.to,
          actor: 'studio',
          note: (h.by === 'cliente' ? '[dal cliente] ' : '') + (h.note || '')
        });
        entries.push(h);
      });
    });
    if (!rows.length) return;
    var res = await R.sb.from('post_events').insert(rows).select('id, actor_user');
    alive();
    if (res.error) {
      if (isNetworkError(res.error)) boom(res);
      console.error('[Ideology] cronologia', res.error);
      rows.forEach(function (r) { baseEvents[r.id] = true; });      // do not retry forever
      return;
    }
    res.data.forEach(function (r) { baseEvents[r.id] = true; });
    entries.forEach(function (h) { if (!h.user && R.user) h.user = R.user.id; });
  }

  /* ── Live changes from colleagues ──────────────────────── */

  var channel = null, lastSync = Date.now(), hiddenAt = 0;

  /* → the record fields that changed, or false if the row could not be
     placed (its parent has not arrived yet). */
  function applyRemote(t, row) {
    var loc = findLocal(t, row.id), fields = [];
    if (loc) {
      var before = clone(loc.rec);
      writeInto(t, loc.rec, canon(t, row));
      fields = diffFields(before, loc.rec);
    } else if (!addLocal(t, row)) return false;
    setBase(t, row);
    return fields;
  }

  function diffFields(a, b) {
    var out = [];
    Object.keys(b).forEach(function (k) { if (k.charAt(0) !== '_' && stable(a[k]) !== stable(b[k])) out.push(k); });
    return out;
  }

  function onChange(payload) {
    lastSync = Date.now();
    if (payload.table === 'post_events') return onEvent(payload.new);
    var t = BY_NAME[payload.table];
    if (!t) return;

    if (payload.eventType === 'DELETE') {
      var id = payload.old && payload.old.id;
      if (!id) return;
      if (!base[keyOf(t, id)] && !findLocal(t, id)) return;
      removeLocal(t, id);
      delete base[keyOf(t, id)];
      changed(t.name, id);
      return;
    }

    var row = payload.new;
    if (!row || !row.id) return;
    var k = keyOf(t, row.id), b = base[k];
    if (b && b.version >= row.version) return;           // our own write, echoed back
    if (!b && findLocal(t, row.id)) return;               // our insert, answer still on its way
    if (b && isPending(t, row.id)) return;                // unsaved edits here: the save will merge
    var fields = applyRemote(t, row);
    if (fields) changed(t.name, row.id, fields);
    else R.refresh();                                     // arrived before its parent
  }

  function onEvent(e) {
    if (!e || baseEvents[e.id]) return;
    baseEvents[e.id] = true;
    var p = A.get(e.post_id);
    if (p) {
      p.history = p.history || [];
      if (!p.history.some(function (h) { return h.id === e.id; })) p.history.push(eventToEntry(e));
      changed('post_events', e.post_id, ['history']);
    }
  }

  var listeners = [];
  R.onRemote = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
  function changed(table, id, fields) {
    A.index();
    A.scheduleRender();
    listeners.slice().forEach(function (fn) { try { fn(table, id, fields || []); } catch (e) { console.error(e); } });
  }

  /* An open dialog keeps a snapshot for "Annulla modifiche". When a
     colleague or the client changes the same record meanwhile, their
     change is folded into the snapshot — so undoing my edits never
     undoes theirs (a client's approval, a colleague's new date). */
  A.followSnapshot = function (id, holder) {
    if (!R.on || !R.onRemote) return function () {};
    return R.onRemote(function (table, rid, fields) {
      if (rid !== id || !fields || !fields.length) return;
      var rec = A.get(id);
      if (!rec) return;
      var snap = JSON.parse(holder.snap);
      fields.forEach(function (f) { snap[f] = clone(rec[f]); });
      holder.snap = JSON.stringify(snap);
    });
  };

  R.subscribe = function () {
    if (channel) R.sb.removeChannel(channel);
    var filter = 'workspace_id=eq.' + R.ws;
    channel = R.sb.channel('studio:' + R.ws);
    TABLES.forEach(function (t) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: t.name, filter: t.single ? 'id=eq.' + R.ws : filter },
        onChange);
    });
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_events', filter: filter }, onChange);
    var wasDown = false;
    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED') { if (wasDown) R.refresh(); wasDown = false; }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') wasDown = true;
    });
  };

  /* After being away (laptop asleep, connection dropped) the live feed
     may have missed something. Fetch everything and fold it in, never
     touching a record with unsaved edits. */
  var refreshing = false;
  R.refresh = async function () {
    if (!R.ready || refreshing) return;
    refreshing = true;
    var g = R.gen, w = R.ws;
    try {
      var seen = {};
      for (var i = 0; i < TABLES.length; i++) {
        var t = TABLES[i];
        var rows = t.single
          ? [(await R.sb.from('workspaces').select('*').eq('id', R.ws).single()).data].filter(Boolean)
          : await fetchAll(t.name);
        if (R.gen !== g || R.ws !== w) return;            // switched studio meanwhile
        rows.forEach(function (row) {
          var k = keyOf(t, row.id), b = base[k];
          seen[k] = true;
          if (b && b.version >= row.version) return;
          if (b && isPending(t, row.id)) return;
          if (!b && findLocal(t, row.id)) return;
          var f = applyRemote(t, row);
          if (f && f.length) changed(t.name, row.id, f);
        });
      }
      Object.keys(base).forEach(function (k) {
        if (seen[k]) return;
        var name = k.split(':')[0], id = k.slice(name.length + 1), t = BY_NAME[name];
        if (!t || t.single) return;
        if (isPending(t, id) && findLocal(t, id)) return;
        removeLocal(t, id);
        delete base[k];
      });
      var evs = await fetchAll('post_events');
      if (R.gen !== g || R.ws !== w) return;
      evs.forEach(onEvent);
      lastSync = Date.now();
      A.index(); A.scheduleRender();
    } catch (e) {
      if (!e.network) console.error('[Ideology] aggiornamento', e);
    } finally {
      refreshing = false;
    }
  };

  document.addEventListener('visibilitychange', function () {
    if (!R.ready) return;
    if (document.hidden) { hiddenAt = Date.now(); R.flush(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000) R.refresh();
  });
  window.addEventListener('online', function () { if (R.ready) { R.flush(); R.refresh(); } });

  /* ── Media in Storage ──────────────────────────────────── */

  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var SIGN_TTL = 3600;           // a removed member's links stop working within the hour
  var signed = {}, waiting = {}, signTimer = null;

  function isPath(ref) { return typeof ref === 'string' && ref !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(ref); }
  R.isPath = isPath;

  /* Called by A.el for every src/poster: a storage path becomes a
     signed URL, fetched in batches; the element fills in when it
     arrives. Links and data URLs pass through untouched. */
  A.resolveMedia = function (ref, node, attr) {
    if (!R.on || !isPath(ref)) return ref;
    var hit = signed[ref];
    if (hit && hit.exp > Date.now() + 60000) return hit.url;
    (waiting[ref] = waiting[ref] || []).push([node, attr]);
    clearTimeout(signTimer);
    signTimer = setTimeout(signWaiting, 0);
    return attr === 'poster' ? '' : BLANK;
  };

  async function signPaths(paths) {
    for (var i = 0; i < paths.length; i += 300) {
      var chunk = paths.slice(i, i + 300);
      var res = await R.sb.storage.from('media').createSignedUrls(chunk, SIGN_TTL);
      if (res.error) { console.error('[Ideology] firma media', res.error); continue; }
      var exp = Date.now() + SIGN_TTL * 1000;
      (res.data || []).forEach(function (r) { if (r.signedUrl && r.path) signed[r.path] = { url: r.signedUrl, exp: exp }; });
    }
  }

  async function signWaiting() {
    var batch = waiting;
    waiting = {};
    var paths = Object.keys(batch);
    if (!paths.length) return;
    await signPaths(paths);
    paths.forEach(function (p) {
      var url = signed[p] && signed[p].url;
      if (!url) return;
      batch[p].forEach(function (pair) { if (pair[0]) pair[0].setAttribute(pair[1], url); });
    });
  }

  function mediaRefs() {
    var set = {};
    function add(v) { if (isPath(v)) set[v] = 1; }
    A.S.clients.forEach(function (c) { (c.accounts || []).forEach(function (a) { add(a.avatarUrl); }); });
    A.S.posts.forEach(function (p) {
      add(p.mediaUrl); add(p.coverUrl);
      (p.slides || []).forEach(function (s) { add(s.url); });
    });
    A.S.stories.forEach(function (s) { add(s.mediaUrl); (s.frames || []).forEach(function (f) { add(f.url); }); });
    A.S.highlights.forEach(function (h) { add(h.coverUrl); });
    return Object.keys(set);
  }

  R.preloadMedia = function () { return signPaths(mediaRefs()); };

  function extOf(type) {
    return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
      'image/avif': 'avif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' })[type] || '';
  }

  function folder() {
    var c = A.ui.clientDetailId || A.ui.clientId || 'condivisi';
    return R.ws + '/' + (isUuid(c) ? c : 'condivisi');
  }

  R.MAX_UPLOAD = 50 * 1024 * 1024;

  R.uploadBlob = async function (blob, type) {
    type = type || blob.type;
    var ext = extOf(type);
    if (!ext) throw new Error('Formato non supportato (' + (type || 'sconosciuto') + ')');
    if (blob.size > R.MAX_UPLOAD) throw new Error('File oltre ' + A.humanSize(R.MAX_UPLOAD));
    var path = folder() + '/' + A.uuid() + '.' + ext;
    var res = await R.sb.storage.from('media').upload(path, blob, {
      contentType: type, cacheControl: '31536000', upsert: false
    });
    if (res.error) throw new Error('Caricamento non riuscito: ' + res.error.message);
    try { signed[path] = { url: URL.createObjectURL(blob), exp: Date.now() + 7 * 24 * 3600 * 1000 }; } catch (e) {}
    return path;
  };

  function dataUrlToBlob(d) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(d);
    if (!m) throw new Error('dato non valido');
    var bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var arr = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }

  /* SVG can carry script, so the bucket refuses it. Anything that is
     not a plain raster image is drawn onto a canvas first. */
  function rasterize(dataUrl) {
    return new Promise(function (resolve, reject) {
      var probe = document.createElement('canvas');
      if (!probe.getContext || !probe.getContext('2d')) return reject(new Error('conversione non disponibile'));
      var timer = setTimeout(function () { reject(new Error('immagine non leggibile')); }, 15000);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || 1080, h = img.naturalHeight || 1080;
          var s = Math.min(1, 1600 / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.round(w * s); cv.height = Math.round(h * s);
          var cx = cv.getContext('2d');
          cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) { clearTimeout(timer); b ? resolve(b) : reject(new Error('conversione non riuscita')); }, 'image/jpeg', 0.86);
        } catch (e) { clearTimeout(timer); reject(e); }
      };
      img.onerror = function () { clearTimeout(timer); reject(new Error('immagine non leggibile')); };
      img.src = dataUrl;
    });
  }

  R.uploadDataUrl = async function (d) {
    var blob = dataUrlToBlob(d);
    if (!extOf(blob.type)) blob = await rasterize(d);
    return R.uploadBlob(blob, blob.type);
  };

  /* Used by every upload control: in the shared studio the file goes
     to Storage and the record keeps its path. */
  A.storeMedia = function (res, file) {
    if (!R.on) return Promise.resolve(res);
    if (typeof res === 'string') {
      return /^data:/.test(res) ? R.uploadDataUrl(res) : Promise.resolve(res);
    }
    if (res && typeof res === 'object') {
      var jobs = [];
      if (file && file.size <= R.MAX_UPLOAD && extOf(file.type)) {
        jobs.push(R.uploadBlob(file, file.type).then(function (p) { res.dataUrl = p; }));
      } else if (/^data:/.test(res.dataUrl || '')) {
        jobs.push(R.uploadDataUrl(res.dataUrl).then(function (p) { res.dataUrl = p; }));
      } else if (!/^https?:/i.test(res.dataUrl || '')) {
        res.dataUrl = '';
      }
      if (/^data:/.test(res.poster || '')) {
        jobs.push(R.uploadDataUrl(res.poster).then(function (p) { res.poster = p; }));
      }
      return Promise.all(jobs).then(function () { return res; });
    }
    return Promise.resolve(res);
  };

  /* Move every inline image in the current state into Storage. Used
     when a browser's own document, or the demo, becomes the studio's
     first content. Identical images are uploaded once. */
  R.uploadInlineMedia = async function (onProgress) {
    var refs = [];
    function visit(obj, key) { if (/^data:/.test(obj[key] || '')) refs.push([obj, key]); }
    A.S.clients.forEach(function (c) { (c.accounts || []).forEach(function (a) { visit(a, 'avatarUrl'); }); });
    A.S.posts.forEach(function (p) {
      visit(p, 'mediaUrl'); visit(p, 'coverUrl');
      (p.slides || []).forEach(function (s) { visit(s, 'url'); });
    });
    A.S.stories.forEach(function (s) { visit(s, 'mediaUrl'); (s.frames || []).forEach(function (f) { visit(f, 'url'); }); });
    A.S.highlights.forEach(function (h) { visit(h, 'coverUrl'); });

    var done = {}, unique = 0, n = 0;
    refs.forEach(function (r) { if (!done.hasOwnProperty(r[0][r[1]])) { done[r[0][r[1]]] = null; unique++; } });
    for (var i = 0; i < refs.length; i++) {
      var obj = refs[i][0], key = refs[i][1], d = obj[key];
      if (done[d] === null) {
        try { done[d] = await R.uploadDataUrl(d); }
        catch (e) { console.warn('[Ideology] immagine non caricata', e.message); done[d] = ''; }
        n++;
        if (onProgress) onProgress(n, unique);
      }
      obj[key] = done[d];
    }
  };

  /* Give every record a fresh UUID and repoint every reference to it.
     Browser documents use readable ids; the database uses UUIDs. */
  R.remapIds = function () {
    var S = A.S, map = {};
    function id(old) {
      if (!old) return old;
      if (!map[old]) map[old] = isUuid(old) ? old : A.uuid();
      return map[old];
    }
    S.clients.forEach(function (c) {
      c.id = id(c.id);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(c.shareToken || '')) c.shareToken = A.newToken();
      (c.accounts || []).forEach(function (a) { a.id = id(a.id); });
    });
    ['categories', 'creators', 'posts', 'stories', 'highlights', 'ugcSlots'].forEach(function (k) {
      S[k].forEach(function (r) { r.id = id(r.id); });
    });
    S.categories.forEach(function (c) { c.clientId = map[c.clientId] || c.clientId; });
    S.creators.forEach(function (c) { c.clientId = map[c.clientId] || c.clientId; });
    S.posts.forEach(function (p) {
      p.accountId = map[p.accountId] || p.accountId;
      p.categoryId = p.categoryId ? (map[p.categoryId] || '') : '';
      p.alsoOn = (p.alsoOn || []).map(function (x) { return map[x]; }).filter(Boolean);
      p.storyIds = (p.storyIds || []).map(function (x) { return map[x]; }).filter(Boolean);
      (p.history || []).forEach(function (h) { h.id = A.uuid(); });
    });
    S.stories.forEach(function (s) {
      s.accountId = map[s.accountId] || s.accountId;
      s.fromPostId = s.fromPostId ? (map[s.fromPostId] || '') : '';
    });
    S.highlights.forEach(function (h) {
      h.accountId = map[h.accountId] || h.accountId;
      h.storyIds = (h.storyIds || []).map(function (x) { return map[x]; }).filter(Boolean);
    });
    S.ugcSlots.forEach(function (u) {
      u.accountId = map[u.accountId] || u.accountId;
      u.creatorId = u.creatorId ? (map[u.creatorId] || '') : '';
    });
    ['clientId', 'accountId', 'clientDetailId', 'selectedPostId', 'selectedStoryId'].forEach(function (k) {
      if (A.ui[k]) A.ui[k] = map[A.ui[k]] || null;
    });
    A.index();
  };

  /* ── Members ───────────────────────────────────────────── */

  R.loadMembers = async function () {
    var res = await R.sb.from('workspace_members').select('*').eq('workspace_id', R.ws);
    if (res.error) boom(res);
    R.members = {};
    res.data.forEach(function (m) { R.members[m.user_id] = m; if (R.user && m.user_id === R.user.id) R.role = m.role; });
    return res.data;
  };

  R.start = function () {
    R.subscribe();
  };

  R.stop = function () {
    if (channel) { R.sb.removeChannel(channel); channel = null; }
    R.ready = false;
    R.gen++;
  };

  /* test hook */
  R._reset = function () {
    [base, baseEvents, rejected, conflicts].forEach(function (o) { Object.keys(o).forEach(function (k) { delete o[k]; }); });
    flushing = false; again = false;
  };
})(window.IDE);
