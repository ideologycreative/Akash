/* ============================================================
   Ideology — store

   Design rules this file enforces, each one a fix for a failure
   mode we have seen in production tools of this kind:

   1. Every record has an id. Nothing is ever addressed by its
      position in an array, because the grid is reorderable.
   2. Relations are id references (post.storyIds), never indices.
   3. Collections are flat and carry their own foreign keys
      (accountId, month), so renaming a client breaks nothing.
   4. Ordering is an explicit `order` field, not array order.
   5. Saving validates the payload first. A collection that is
      meant to be an array and is not aborts the write instead of
      silently persisting an empty one over good data.
   ============================================================ */

(function (A) {
  'use strict';

  var KEY = 'ideology.content.v1';

  /* ── Vocabulary ───────────────────────────────────────── */

  A.STATUS = [
    { key: 'bozza',        label: 'Bozza',        short: 'Bozza',      c: 'var(--st-bozza)',      sub: 'var(--st-bozza-sub)' },
    { key: 'da_approvare', label: 'Da approvare', short: 'Da appr.',   c: 'var(--st-approvare)',  sub: 'var(--st-approvare-sub)' },
    { key: 'in_revisione', label: 'In revisione', short: 'Revisione',  c: 'var(--st-revisione)',  sub: 'var(--st-revisione-sub)' },
    { key: 'approvato',    label: 'Approvato',    short: 'Approvato',  c: 'var(--st-approvato)',  sub: 'var(--st-approvato-sub)' },
    { key: 'pubblicato',   label: 'Pubblicato',   short: 'Pubbl.',     c: 'var(--st-pubblicato)', sub: 'var(--st-pubblicato-sub)' }
  ];
  A.statusOf = function (k) {
    for (var i = 0; i < A.STATUS.length; i++) if (A.STATUS[i].key === k) return A.STATUS[i];
    return A.STATUS[0];
  };

  A.UGC_STATUS = [
    { key: 'idea',       label: 'Idea',       c: 'var(--ugc-idea)' },
    { key: 'brief',      label: 'Brief inviato', c: 'var(--ugc-brief)' },
    { key: 'girato',     label: 'Girato',     c: 'var(--ugc-girato)' },
    { key: 'consegnato', label: 'Consegnato', c: 'var(--ugc-consegna)' }
  ];
  A.ugcStatusOf = function (k) {
    for (var i = 0; i < A.UGC_STATUS.length; i++) if (A.UGC_STATUS[i].key === k) return A.UGC_STATUS[i];
    return A.UGC_STATUS[0];
  };

  /* Paid and partnership are two different facts about a post, not two
     values of one field: a collaboration can also be put behind budget.
     They are stored separately and read together. */
  A.natureOf = function (p) {
    var paid = !!p.paid, partner = (p.partner || '').trim();
    if (paid && partner) return { key: 'both', label: 'ADV · con ' + partner, short: 'ADV+', cls: 'promo-both' };
    if (paid) return { key: 'paid', label: 'Sponsorizzato', short: 'ADV', cls: 'promo-paid' };
    if (partner) return { key: 'partner', label: 'Con ' + partner, short: 'Partner', cls: 'promo-partner' };
    return { key: 'organico', label: 'Organico', short: '', cls: 'promo-organico' };
  };

  A.CREATOR_STATUS = [
    { key: 'contattato', label: 'Contattato' },
    { key: 'accordo',    label: 'Accordo chiuso' },
    { key: 'girato',     label: 'Girato' },
    { key: 'pubblicato', label: 'Pubblicato' }
  ];

  /* Platform catalogue lives in 00-platforms.js — shared with the client link. */

  A.CLIENT_STATUS = [
    { key: 'attivo', label: 'Attivo' },
    { key: 'pausa',  label: 'In pausa' },
    { key: 'chiuso', label: 'Archiviato' }
  ];

  A.GOALS = [
    { key: 'post',    label: 'Post in feed' },
    { key: 'reel',    label: 'Reel' },
    { key: 'stories', label: 'Stories' },
    { key: 'ugc',     label: 'Contenuti UGC' }
  ];

  A.PALETTE_KEYS = [
    { key: 'bg',     label: 'Sfondo' },
    { key: 'ink',    label: 'Testo' },
    { key: 'accent', label: 'Accento' },
    { key: 'alt',    label: 'Secondario' }
  ];

  A.KINDS = [
    { key: 'foto',       label: 'Foto',          icon: 'image' },
    { key: 'reel',       label: 'Reel',          icon: 'play' },
    { key: 'carosello',  label: 'Carosello',     icon: 'layers' },
    { key: 'editoriale', label: 'Card testuale', icon: 'type' }
  ];

  /* Date vocabulary lives in 00-dates.js — shared with the client link. */

  /* ── State ────────────────────────────────────────────── */

  var S = {
    v: 1,
    clients: [], posts: [], stories: [], highlights: [],
    ugcSlots: [], creators: [], categories: [],
    prefs: { ugcDays: [1, 3, 5] }
  };
  A.S = S;

  var COLLECTIONS = ['clients', 'posts', 'stories', 'highlights', 'ugcSlots', 'creators', 'categories'];

  /* ── Session (not persisted as content) ───────────────── */

  A.ui = {
    section: 'contenuti', clientDetailId: null,
    clientId: null, accountId: null, month: A.thisMonth(),
    tab: 'feed', selectedPostId: null, selectedStoryId: null,
    filters: { status: [], categoryId: [], paid: false, partner: false },
    show: { date: true, caption: true, tags: true },
    previewMode: 'studio',   // 'studio' | 'client'
    saveState: 'saved'      // see setSaveState
  };

  /* ── Persistence ──────────────────────────────────────── */

  function assertShape(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('stato non valido');
    for (var i = 0; i < COLLECTIONS.length; i++) {
      var k = COLLECTIONS[i];
      if (!Array.isArray(obj[k])) throw new Error('la collezione "' + k + '" non è una lista');
    }
    return true;
  }
  A.assertShape = assertShape;

  function serialize() {
    var out = { v: S.v, savedAt: new Date().toISOString(), prefs: S.prefs, counts: {} };
    COLLECTIONS.forEach(function (k) { out[k] = S[k]; out.counts[k] = S[k].length; });
    return out;
  }
  A.serialize = serialize;

  /* Autosave. Every change is kept a moment after it is made: in the
     browser's own storage when working alone, in the studio's database
     when 00-config.js names one (15-sync.js). The pause batches a burst
     of keystrokes into one write.

     States: saved · pending (change made, save scheduled) · saving ·
     offline (retrying) · conflict (a colleague changed the same field)
     · error (the server refused something). */
  A.dirty = false;
  A.AUTOSAVE_MS = 700;

  function setSaveState(s) {
    A.ui.saveState = s;
    A.dirty = s !== 'saved';
    if (A.renderSaveState) A.renderSaveState();
  }
  A.setSaveState = setSaveState;

  var saveTimer = null;
  A.scheduleSave = function () {
    clearTimeout(saveTimer);
    if (A.ui.saveState !== 'saving' && A.ui.saveState !== 'conflict') setSaveState('pending');
    saveTimer = setTimeout(function () { saveTimer = null; A.save({ quiet: true }); }, A.AUTOSAVE_MS);
  };

  /* Save now, skipping the pause (leaving the page, closing a dialog). */
  A.saveNow = function () {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return A.save({ quiet: true });
  };

  A.save = function (opts) {
    if (A.remote && A.remote.on) {
      return A.remote.flush().then(function () {
        if (!opts || opts.quiet !== true) A.toast('Salvato');
        return true;
      });
    }
    try {
      assertShape(S);
      localStorage.setItem(KEY, JSON.stringify(serialize()));
      setSaveState('saved');
      if (!opts || opts.quiet !== true) A.toast('Salvato');
      return true;
    } catch (e) {
      setSaveState('error');
      A.toast('Salvataggio non riuscito: ' + e.message);
      return false;
    }
  };

  /* Re-render soon, once, and not under someone's cursor: if a field in
     the page is focused, wait until it is left. Used for changes that
     arrive from colleagues. */
  var renderTimer = null, renderAfterBlur = false;
  A.scheduleRender = function () {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      var act = document.activeElement;
      var typing = act && /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName) &&
        !act.closest('#modal-bg') && act.closest('#root');
      if (typing) {
        if (!renderAfterBlur) {
          renderAfterBlur = true;
          act.addEventListener('blur', function () { renderAfterBlur = false; A.scheduleRender(); }, { once: true });
        }
        return;
      }
      A.render();
    }, 60);
  };

  A.load = function () {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var data = migrate(JSON.parse(raw));
      assertShape(data);
      A.hydrate(data);
      return true;
    } catch (e) {
      console.warn('[Ideology] stato locale illeggibile, riparto dai dati demo:', e.message);
      return false;
    }
  };

  /* Documents written before the taxonomies were merged carry `pillars`
     and `formats`. Fold them into one list and repoint the posts, so an
     older backup opens with its classification intact instead of blank. */
  function migrate(data) {
    if (!Array.isArray(data.categories)) {
      var cats = [];
      (data.pillars || []).forEach(function (p) { cats.push({ id: p.id, clientId: p.clientId, name: p.name, color: p.color, description: p.description || '' }); });
      (data.formats || []).forEach(function (f) {
        var dup = cats.some(function (c) { return c.clientId === f.clientId && c.name.toLowerCase() === f.name.toLowerCase(); });
        if (!dup) cats.push({ id: f.id, clientId: f.clientId, name: f.name, color: f.color, description: f.description || '' });
      });
      data.categories = cats;
    }
    (data.posts || []).forEach(function (p) {
      if (p.categoryId === undefined) p.categoryId = p.pillarId || p.formatId || '';
      if (p.paid === undefined) p.paid = (p.promo === 'sponsorizzato') || !!p.sponsored;
      if (p.partner === undefined) p.partner = '';
      if (p.videoName === undefined) p.videoName = '';
      delete p.promo;
      if (!Array.isArray(p.alsoOn)) p.alsoOn = [];
      if (p.inStories === undefined) p.inStories = false;
      if (p.time === undefined) p.time = '';
      if (p.coverUrl === undefined) p.coverUrl = '';
      delete p.sponsored;
      delete p.pillarId; delete p.formatId;
    });
    delete data.pillars; delete data.formats;
    return data;
  }

  A.hydrate = function (data) {
    migrate(data);
    assertShape(data);
    COLLECTIONS.forEach(function (k) { S[k] = data[k]; });
    S.prefs = Object.assign({ ugcDays: [1, 3, 5] }, data.prefs || {});
    S.v = data.v || 1;
    /* forward-compatible defaults, so a document saved by an older build
       opens without losing anything and without special-casing downstream */
    S.clients.forEach(function (c) {
      if (!c.status) c.status = 'attivo';
      if (!c.slug) c.slug = A.slugify(c.name);
      if (!c.shareToken) c.shareToken = A.newToken();
      if (!c.goals) c.goals = { post: 12, reel: 4, stories: 20, ugc: 8 };
      c.palette = Object.assign({ bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C', alt: '#6E6256' }, c.palette || {});
      (c.accounts || []).forEach(function (a) {
        if (!a.handle && a.name) a.handle = a.name;
        if (!a.platform) a.platform = 'Instagram';
      });
    });
    index();
  };

  /* Every mutation goes through commit(): it reindexes, schedules the
     save, and re-renders. */
  A.commit = function (opts) {
    index();
    A.scheduleSave();
    if (!opts || opts.render !== false) A.render();
  };

  /* ── Indexes ──────────────────────────────────────────── */

  var IX = { byId: {}, accounts: {} };
  A.IX = IX;

  function index() {
    IX.byId = {}; IX.accounts = {};
    COLLECTIONS.forEach(function (k) {
      S[k].forEach(function (r) { IX.byId[r.id] = r; });
    });
    S.clients.forEach(function (c) {
      (c.accounts || []).forEach(function (a) {
        IX.byId[a.id] = a;
        IX.accounts[a.id] = { account: a, client: c };
      });
    });
  }
  A.index = index;

  A.get = function (id) { return id ? IX.byId[id] || null : null; };
  A.accountCtx = function (id) { return IX.accounts[id] || null; };
  A.clientOfAccount = function (id) { var c = IX.accounts[id]; return c ? c.client : null; };

  /* ── Selectors ────────────────────────────────────────── */

  function bySort(a, b) { return (a.order || 0) - (b.order || 0); }

  /* The grid is ordered by when the content goes out, not by where someone
     last dropped it. Anything without a date sits at the end, in the order
     it was created, so an unscheduled idea never jumps into the middle. */
  A.sortKey = function (p) { return p.date ? p.date + 'T' + (p.time || '00:00') : ''; };
  function byMoment(a, b) {
    var ka = A.sortKey(a), kb = A.sortKey(b);
    if (ka && kb) return ka === kb ? bySort(a, b) : ka.localeCompare(kb);
    if (ka) return -1;
    if (kb) return 1;
    return bySort(a, b);
  }

  /* A post belongs to one account and can be published on others of the
     same client. There is still only one record: the second account shows
     the same content, so a caption fixed once is fixed everywhere. */
  A.isOn = function (p, accountId) {
    return p.accountId === accountId || (p.alsoOn || []).indexOf(accountId) >= 0;
  };
  A.postsIn = function (accountId, month) {
    return S.posts.filter(function (p) { return A.isOn(p, accountId) && p.month === month; }).sort(byMoment);
  };
  A.storiesIn = function (accountId, month) {
    return S.stories.filter(function (s) { return s.accountId === accountId && s.month === month; }).sort(bySort);
  };
  A.highlightsIn = function (accountId) {
    return S.highlights.filter(function (h) { return h.accountId === accountId; });
  };
  A.ugcIn = function (accountId, month) {
    return S.ugcSlots.filter(function (u) { return u.accountId === accountId && A.monthOfDay(u.date) === month; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
  };
  A.ugcInYear = function (accountId, year) {
    return S.ugcSlots.filter(function (u) { return u.accountId === accountId && (u.date || '').slice(0, 4) === String(year); });
  };
  A.creatorsOf = function (clientId) {
    return S.creators.filter(function (c) { return c.clientId === clientId; });
  };
  A.categoriesOf = function (clientId) {
    return S.categories.filter(function (c) { return c.clientId === clientId; });
  };
  /* The other accounts of the same client: what a post can be pushed to
     without re-uploading anything. */
  A.siblingAccounts = function (accountId) {
    var ctx = A.accountCtx(accountId);
    if (!ctx) return [];
    return (ctx.client.accounts || []).filter(function (a) { return a.id !== accountId; });
  };

  A.monthsWithContent = function (accountId) {
    var set = {};
    S.posts.forEach(function (p) { if (p.accountId === accountId) set[p.month] = 1; });
    return Object.keys(set).sort();
  };

  /* Current context shorthands */
  A.curClient = function () { return A.get(A.ui.clientId); };
  A.curAccount = function () { var c = A.accountCtx(A.ui.accountId); return c ? c.account : null; };
  A.curPosts = function () { return A.postsIn(A.ui.accountId, A.ui.month); };
  A.curStories = function () { return A.storiesIn(A.ui.accountId, A.ui.month); };
  A.curUgc = function () { return A.ugcIn(A.ui.accountId, A.ui.month); };

  /* Filters are lists: wanting to see "da approvare" and "in revisione"
     together is the normal question, not an edge case. An empty list means
     no constraint on that axis. */
  A.emptyFilters = function () { return { status: [], categoryId: [], paid: false, partner: false }; };

  A.filterCount = function () {
    var f = A.ui.filters;
    return (f.status || []).length + (f.categoryId || []).length + (f.paid ? 1 : 0) + (f.partner ? 1 : 0);
  };

  A.toggleFilter = function (axis, value) {
    var list = A.ui.filters[axis] || (A.ui.filters[axis] = []);
    var i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1); else list.push(value);
  };

  A.visiblePosts = function () {
    var f = A.ui.filters;
    return A.curPosts().filter(function (p) {
      if ((f.status || []).length && f.status.indexOf(p.status) < 0) return false;
      if ((f.categoryId || []).length && f.categoryId.indexOf(p.categoryId) < 0) return false;
      if (f.paid && !p.paid) return false;
      if (f.partner && !(p.partner || '').trim()) return false;
      return true;
    });
  };

  /* ── Mutations: posts ─────────────────────────────────── */

  function nextOrder(list) {
    return list.reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0) + 10;
  }

  A.addPost = function (kind, extra) {
    if (!A.ui.accountId) { A.toast('Scegli prima un account'); return null; }
    var list = A.curPosts();
    var p = Object.assign({
      id: A.uid('post'),
      accountId: A.ui.accountId,
      month: A.ui.month,
      order: nextOrder(list),
      kind: kind || 'foto',
      mediaUrl: '', coverUrl: '', slides: [],
      date: '', time: '', showDate: true, caption: '',
      categoryId: '', paid: false, partner: '',
      videoName: '', alsoOn: [], inStories: false, storyIds: [],
      editorial: { eyebrow: '', title: '', sub: '' },
      status: 'bozza', revisions: 0,
      internalNote: '', clientNote: '', clientNoteAt: '',
      history: [],
      createdAt: new Date().toISOString()
    }, extra || {});
    S.posts.push(p);
    A.ui.selectedPostId = p.id;
    A.commit();
    return p;
  };

  A.updatePost = function (id, patch, opts) {
    var p = A.get(id);
    if (!p) return;
    Object.assign(p, patch);
    if (p.inStories) A.syncMirror(id);
    A.commit(opts);
  };

  A.deletePost = function (id) {
    var i = S.posts.findIndex(function (p) { return p.id === id; });
    if (i < 0) return;
    var snap = S.posts[i];
    var mirror = A.mirrorOf(id);
    if (mirror) S.stories = S.stories.filter(function (x) { return x.id !== mirror.id; });
    S.posts.splice(i, 1);
    if (A.ui.selectedPostId === id) A.ui.selectedPostId = null;
    A.commit();
    A.toast('Post eliminato', {
      undo: function () { S.posts.push(snap); if (mirror) S.stories.push(mirror); A.commit(); }
    });
  };

  A.duplicatePost = function (id) {
    var p = A.get(id);
    if (!p) return;
    var copy = JSON.parse(JSON.stringify(p));
    copy.id = A.uid('post');
    copy.order = (p.order || 0) + 5;
    copy.status = 'bozza';
    copy.revisions = 0;
    copy.history = [];
    copy.clientNote = '';
    copy.inStories = false;
    copy.storyIds = [];
    copy.slides = (copy.slides || []).map(function (s) { return Object.assign({}, s, { id: A.uid('sl') }); });
    S.posts.push(copy);
    A.ui.selectedPostId = copy.id;
    A.commit();
    return copy;
  };

  /* "Pubblica anche nelle Stories" keeps one mirrored story per post. The
     mirror carries fromPostId, so it is always recognisable, always exactly
     one, and it follows the post's media and date instead of drifting into
     a stale duplicate. */
  A.mirrorOf = function (postId) {
    var hit = null;
    S.stories.forEach(function (st) { if (st.fromPostId === postId) hit = st; });
    return hit;
  };

  function mirrorTitle(p) {
    var line = (p.caption || '').split('\n')[0].trim();
    return line ? line.slice(0, 48) : (p.kind === 'reel' ? 'Reel dal feed' : 'Dal feed');
  }

  A.syncMirror = function (postId) {
    var p = A.get(postId);
    if (!p) return;
    var st = A.mirrorOf(postId);
    if (p.inStories) {
      if (!st) {
        st = {
          id: A.uid('st'), accountId: p.accountId, month: p.month,
          order: (A.storiesIn(p.accountId, p.month).reduce(function (m, r) { return Math.max(m, r.order || 0); }, 0)) + 10,
          kind: 'story', title: mirrorTitle(p), mediaUrl: '', frames: [],
          date: p.date, note: '', isUgc: false, status: 'bozza', fromPostId: p.id
        };
        S.stories.push(st);
        if ((p.storyIds || []).indexOf(st.id) < 0) p.storyIds = (p.storyIds || []).concat([st.id]);
      }
      st.accountId = p.accountId;
      st.month = p.month;
      st.date = p.date;
      st.title = mirrorTitle(p);
      st.mediaUrl = p.coverUrl || p.mediaUrl || (p.slides && p.slides[0] ? p.slides[0].url : '');
    } else if (st) {
      S.stories = S.stories.filter(function (x) { return x.id !== st.id; });
      p.storyIds = (p.storyIds || []).filter(function (id) { return id !== st.id; });
    }
  };

  A.setInStories = function (postId, on) {
    var p = A.get(postId);
    if (!p) return;
    p.inStories = !!on;
    A.syncMirror(postId);
    A.commit();
  };

  /* The single place a status ever changes. Every transition is written to
     the post's own history with who did it, so "chi ha approvato cosa" is
     answerable months later. */
  A.setStatus = function (id, status, actor, note) {
    var p = A.get(id);
    if (!p || p.status === status) return;
    var from = p.status;
    p.status = status;
    if (status === 'in_revisione') p.revisions = (p.revisions || 0) + 1;
    if (!p.history) p.history = [];
    p.history.push({
      id: A.uuid(),
      at: new Date().toISOString(),
      from: from, to: status,
      by: actor || 'studio',
      note: note || ''
    });
    if (actor === 'cliente' && note) { p.clientNote = note; p.clientNoteAt = new Date().toISOString(); }
    A.commit();
  };

  /* ── Mutations: stories ───────────────────────────────── */

  A.addStory = function (kind) {
    if (!A.ui.accountId) { A.toast('Scegli prima un account'); return null; }
    var s = {
      id: A.uid('st'),
      accountId: A.ui.accountId, month: A.ui.month,
      order: nextOrder(A.curStories()),
      kind: kind || 'story',
      title: kind === 'storyboard' ? 'Nuovo storyboard' : '',
      mediaUrl: '', frames: [], date: '', note: '', isUgc: false, status: 'bozza'
    };
    if (kind === 'storyboard') {
      s.frames = [
        { id: A.uid('fr'), url: '', note: 'Hook — primi 2 secondi' },
        { id: A.uid('fr'), url: '', note: 'Contenuto' },
        { id: A.uid('fr'), url: '', note: 'Call to action' }
      ];
    }
    S.stories.push(s);
    A.ui.selectedStoryId = s.id;
    A.commit();
    return s;
  };

  A.deleteStory = function (id) {
    var i = S.stories.findIndex(function (s) { return s.id === id; });
    if (i < 0) return;
    var snap = S.stories[i];
    S.stories.splice(i, 1);
    /* Unlink from every post that referenced it. Because the link is an id,
       this is a clean removal — with index links the remaining references
       would silently shift onto the wrong story. */
    S.posts.forEach(function (p) {
      if (p.storyIds && p.storyIds.indexOf(id) >= 0) {
        p.storyIds = p.storyIds.filter(function (x) { return x !== id; });
      }
    });
    S.highlights.forEach(function (h) {
      if (h.storyIds) h.storyIds = h.storyIds.filter(function (x) { return x !== id; });
    });
    if (snap.fromPostId) {
      var src = A.get(snap.fromPostId);
      if (src) src.inStories = false;
    }
    if (A.ui.selectedStoryId === id) A.ui.selectedStoryId = null;
    A.commit();
    A.toast('Story eliminata', {
      undo: function () {
        S.stories.push(snap);
        if (snap.fromPostId) { var s2 = A.get(snap.fromPostId); if (s2) s2.inStories = true; }
        A.commit();
      }
    });
  };

  /* ── Mutations: UGC ───────────────────────────────────── */

  A.addUgcSlot = function (date, extra) {
    if (!A.ui.accountId) { A.toast('Scegli prima un account'); return null; }
    var slot = Object.assign({
      id: A.uid('ugc'),
      accountId: A.ui.accountId,
      date: date || A.todayKey(),
      mode: 'autonoma', status: 'idea',
      brief: '', creatorId: '', note: ''
    }, extra || {});
    S.ugcSlots.push(slot);
    A.commit();
    return slot;
  };

  A.deleteUgcSlot = function (id) {
    var i = S.ugcSlots.findIndex(function (u) { return u.id === id; });
    if (i < 0) return;
    var snap = S.ugcSlots[i];
    S.ugcSlots.splice(i, 1);
    A.commit();
    A.toast('Slot eliminato', { undo: function () { S.ugcSlots.push(snap); A.commit(); } });
  };

  A.generateUgcMonth = function () {
    var days = S.prefs.ugcDays || [];
    if (!days.length) { A.toast('Scegli almeno un giorno della settimana'); return; }
    var mk = A.ui.month, p = mk.split('-');
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
    var last = new Date(y, m, 0).getDate();
    var taken = {};
    A.curUgc().forEach(function (u) { taken[u.date] = 1; });
    var made = 0;
    for (var d = 1; d <= last; d++) {
      var dt = new Date(y, m - 1, d);
      var dow = (dt.getDay() + 6) % 7;            // 0 = Monday
      var iso = mk + '-' + A.pad(d);
      if (days.indexOf(dow) >= 0 && !taken[iso]) {
        S.ugcSlots.push({
          id: A.uid('ugc'), accountId: A.ui.accountId, date: iso,
          mode: 'autonoma', status: 'idea', brief: '', creatorId: '', note: ''
        });
        made++;
      }
    }
    A.commit();
    A.toast(made ? made + ' slot aggiunti' : 'Nessuna data nuova da aggiungere');
  };

  A.clearEmptyUgc = function () {
    var before = S.ugcSlots.length;
    var removed = [];
    S.ugcSlots = S.ugcSlots.filter(function (u) {
      var empty = u.accountId === A.ui.accountId &&
        A.monthOfDay(u.date) === A.ui.month &&
        !u.brief.trim() && !u.creatorId && !u.note.trim() && u.status === 'idea';
      if (empty) removed.push(u);
      return !empty;
    });
    A.commit();
    A.toast((before - S.ugcSlots.length) + ' slot vuoti rimossi', {
      undo: function () { removed.forEach(function (u) { S.ugcSlots.push(u); }); A.commit(); }
    });
  };

  A.addCreator = function (clientId, data) {
    var c = Object.assign({
      id: A.uid('cr'), clientId: clientId,
      name: '', handle: '', followers: 0, fee: 0, status: 'contattato', note: ''
    }, data || {});
    S.creators.push(c);
    A.commit();
    return c;
  };

  A.deleteCreator = function (id) {
    S.creators = S.creators.filter(function (c) { return c.id !== id; });
    S.ugcSlots.forEach(function (u) { if (u.creatorId === id) u.creatorId = ''; });
    A.commit();
  };

  /* ── Mutations: clients, accounts, taxonomy ───────────
     Deleting anything that owns content removes that content
     explicitly and clears every reference to it. Nothing is
     left pointing at a record that no longer exists.
  ──────────────────────────────────────────────────────── */

  /* A file that lives with the studio (uploaded) rather than a link to
     somewhere else: a storage path, or inline data in browser-only mode. */
  A.isStoredMedia = function (ref) {
    return typeof ref === 'string' && ref !== '' && (/^data:/.test(ref) || !/^[a-z][a-z0-9+.-]*:/i.test(ref));
  };

  A.slugify = function (name) {
    return String(name || '').toLowerCase()
      .replace(/[àáâãä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  };

  /* The client link points at a different page. Building it in one
     place keeps the studio from ever handing out a URL that lands on
     the studio itself. */
  A.clientUrl = function (cl) {
    /* Resolved by the browser against this page, exactly as an
       <a href="cliente.html"> would be — string surgery on the path
       guesses wrong as soon as the host serves the page from a URL
       that does not end in a file name. */
    /* The token goes in the fragment: never sent to a server, so it
       never lands in an access log or a Referer header. */
    return new URL('cliente.html#c=' + encodeURIComponent(cl.shareToken), document.baseURI).href;
  };

  /* 192 bits from the browser's CSPRNG: a share link is a bearer
     secret, and the database refuses anything shorter than 32 chars. */
  A.newToken = function () {
    var b = new Uint8Array(24);
    window.crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };

  A.MARK_COLORS = ['#9A5B3C', '#4F5E4A', '#3F4F6B', '#6E4C57', '#7A6420', '#3D5B58'];
  A.markColor = function (id) {
    var h = 0, str = String(id);
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return A.MARK_COLORS[h % A.MARK_COLORS.length];
  };

  A.addClient = function (name, platform, handle) {
    var cl = {
      id: A.uid('cl'),
      name: name || 'Nuovo cliente',
      slug: A.slugify(name || 'nuovo-cliente'),
      shareToken: A.newToken(),
      status: 'attivo',
      note: '',
      goals: { post: 12, reel: 4, stories: 20, ugc: 8 },
      palette: { bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C', alt: '#6E6256' },
      accounts: [{
        id: A.uid('ac'),
        handle: handle || '@' + A.slugify(name || 'account'),
        platform: platform || 'Instagram',
        ratio: '', bio: '', followers: 0, following: 0, avatarUrl: ''
      }]
    };
    S.clients.push(cl);
    A.commit({ render: false });
    return cl;
  };

  A.updateClient = function (id, patch) {
    var cl = A.get(id);
    if (!cl) return;
    if (patch.name && patch.name !== cl.name && !cl.slugLocked) patch.slug = A.slugify(patch.name);
    Object.assign(cl, patch);
    A.commit();
  };

  /* Removing a client removes everything that belongs to it: its posts,
     stories, highlights, UGC slots, creators and categories. No post is
     left pointing at a category that went away with its client. */
  A.deleteClient = function (id) {
    var cl = A.get(id);
    if (!cl) return;
    var accIds = {};
    (cl.accounts || []).forEach(function (a) { accIds[a.id] = 1; });
    S.posts = S.posts.filter(function (p) { return !accIds[p.accountId]; });
    S.posts.forEach(function (p) {
      if (p.alsoOn) p.alsoOn = p.alsoOn.filter(function (id) { return !accIds[id]; });
    });
    S.stories = S.stories.filter(function (s2) { return !accIds[s2.accountId]; });
    S.highlights = S.highlights.filter(function (h) { return !accIds[h.accountId]; });
    S.ugcSlots = S.ugcSlots.filter(function (u) { return !accIds[u.accountId]; });
    S.creators = S.creators.filter(function (c) { return c.clientId !== id; });
    S.categories = S.categories.filter(function (c) { return c.clientId !== id; });
    S.clients = S.clients.filter(function (c) { return c.id !== id; });
    if (A.ui.clientId === id) { A.ui.clientId = null; A.ui.accountId = null; }
    if (A.ui.clientDetailId === id) A.ui.clientDetailId = null;
    A.commit();
  };

  A.addAccount = function (clientId, platform, handle) {
    var cl = A.get(clientId);
    if (!cl) return null;
    var acc = {
      id: A.uid('ac'),
      handle: handle || '@' + (cl.slug || A.slugify(cl.name)),
      platform: platform || 'Instagram',
      ratio: '', bio: '', followers: 0, following: 0, avatarUrl: ''
    };
    cl.accounts.push(acc);
    A.commit();
    return acc;
  };

  A.countAccountContent = function (accountId) {
    return {
      posts: S.posts.filter(function (p) { return p.accountId === accountId; }).length,
      stories: S.stories.filter(function (s2) { return s2.accountId === accountId; }).length,
      ugc: S.ugcSlots.filter(function (u) { return u.accountId === accountId; }).length
    };
  };

  A.deleteAccount = function (clientId, accountId) {
    var cl = A.get(clientId);
    if (!cl) return;
    cl.accounts = cl.accounts.filter(function (a) { return a.id !== accountId; });
    S.posts = S.posts.filter(function (p) { return p.accountId !== accountId; });
    S.posts.forEach(function (p) {
      if (p.alsoOn) p.alsoOn = p.alsoOn.filter(function (id) { return id !== accountId; });
    });
    S.stories = S.stories.filter(function (s2) { return s2.accountId !== accountId; });
    S.highlights = S.highlights.filter(function (h) { return h.accountId !== accountId; });
    S.ugcSlots = S.ugcSlots.filter(function (u) { return u.accountId !== accountId; });
    if (A.ui.accountId === accountId) A.ui.accountId = cl.accounts[0] ? cl.accounts[0].id : null;
    A.commit();
  };

  /* One classification list per client, defined by the client. Different
     studios and different clients cut their content differently, so the
     names are theirs; the product only guarantees there is exactly one
     axis, which is why it fits in a single corner of the card. */
  A.addCategory = function (clientId, name) {
    var used = A.categoriesOf(clientId).length;
    var c = {
      id: A.uid('cat'), clientId: clientId,
      name: name || 'Nuova categoria',
      color: A.MARK_COLORS[used % A.MARK_COLORS.length],
      description: ''
    };
    S.categories.push(c);
    A.commit();
    return c;
  };

  A.deleteCategory = function (id) {
    S.categories = S.categories.filter(function (r) { return r.id !== id; });
    S.posts.forEach(function (p) { if (p.categoryId === id) p.categoryId = ''; });
    A.ui.filters.categoryId = (A.ui.filters.categoryId || []).filter(function (x) { return x !== id; });
    A.commit();
  };

  A.usageOfCategory = function (id) {
    return S.posts.filter(function (p) { return p.categoryId === id; }).length;
  };

  /* Progress of one account against the client's monthly commitments. */
  A.progressOf = function (accountId, month, clientId) {
    var cl = A.get(clientId);
    var goals = (cl && cl.goals) || {};
    var posts = A.postsIn(accountId, month);
    var done = {
      post: posts.filter(function (p) { return p.kind !== 'reel'; }).length,
      reel: posts.filter(function (p) { return p.kind === 'reel'; }).length,
      stories: A.storiesIn(accountId, month).length,
      ugc: A.ugcIn(accountId, month).length
    };
    return A.GOALS.map(function (g) {
      return { key: g.key, label: g.label, done: done[g.key] || 0, goal: Number(goals[g.key]) || 0 };
    });
  };

  /* Everything that happened across the studio, newest first. */
  A.recentActivity = function (limit) {
    var out = [];
    S.posts.forEach(function (p) {
      (p.history || []).forEach(function (h) {
        out.push({ at: h.at, by: h.by, to: h.to, note: h.note, postId: p.id, accountId: p.accountId });
      });
    });
    out.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    return out.slice(0, limit || 8);
  };

  /* ── Export / import — full fidelity, no field whitelist ── */

  A.exportAll = function () {
    var payload = serialize();
    payload.exportedBy = 'Ideology Content';
    A.download('ideology-contenuti-' + A.todayKey() + '.json', JSON.stringify(payload, null, 2));
    A.toast('Backup esportato');
  };

  A.importAll = function (text) {
    var data = migrate(JSON.parse(text));
    if (A.remote && A.remote.on) throw new Error('Nello studio condiviso il ripristino da file va fatto da un proprietario, non da qui');
    assertShape(data);
    A.hydrate(data);
    var c = S.clients[0];
    A.ui.clientId = c ? c.id : null;
    A.ui.accountId = c && c.accounts[0] ? c.accounts[0].id : null;
    A.ui.selectedPostId = null;
    A.save({ quiet: true });
  };

  A.resetAll = function () {
    if (A.remote && A.remote.on) { A.toast('Non disponibile nello studio condiviso'); return; }
    try { localStorage.removeItem(KEY); } catch (e) {}
    A.seed();
    A.save({ quiet: true });
  };

  /* A dialog edits the live record so the grid behind it updates as you
     type, and keeps a snapshot so Annulla can put it back exactly. */
  A.snap = function (rec) { return JSON.stringify(rec); };
  A.restore = function (rec, snapshot) {
    if (!rec || !snapshot) return;
    var was = JSON.parse(snapshot);
    Object.keys(rec).forEach(function (k) { delete rec[k]; });
    Object.keys(was).forEach(function (k) { rec[k] = was[k]; });
  };
})(window.IDE);
