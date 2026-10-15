/* =====================================================================
   Shared studio — end to end against the real database.

     node --experimental-strip-types --no-warnings smoke-sync.mjs

   Two colleagues (two browser windows) and one client work on the
   same studio at once. Every save goes through the migration's real
   RLS, triggers and constraints (see supabase/tests/postgrest-shim.mjs);
   live updates come from the database itself (NOTIFY), not from the
   test. The client link goes through the real Edge Function code.
   ===================================================================== */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { startDb } from './supabase/tests/pg.mjs';
import { createHub, makeSupabase } from './supabase/tests/postgrest-shim.mjs';
import * as core from './supabase/functions/_shared/anteprima-core.ts';

const studioHtml = readFileSync('dist/index.html', 'utf8');
const clientHtml = readFileSync('dist/cliente.html', 'utf8');

let fails = 0;
const ok = (label, cond, extra) => {
  if (cond) console.log('  ok  ', label);
  else { fails++; console.log('  FAIL', label, extra === undefined ? '' : extra); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return true; } catch (e) { /* not yet */ }
    await sleep(25);
  }
  return false;
}

/* ── database ───────────────────────────────────────────────────── */

const dbx = await startDb();
await dbx.setup();
const hub = createHub();
const listener = await dbx.enableRealtime((ev) => hub.publish(ev));
const storage = { files: new Map() };
const svc = (sql, params) => dbx.as('service_role', null, async (q) => (await q(sql, params)).rows, true);

const U = {
  alice: { id: randomUUID(), email: 'alice@ideology.it', password: 'pw-alice-1234' },
  bob:   { id: randomUUID(), email: 'bob@ideology.it',   password: 'pw-bob-123456' }
};
await dbx.raw(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, now())`,
  [U.alice.id, U.alice.email, U.bob.id, U.bob.email]);

/* ── windows ────────────────────────────────────────────────────── */

const pageErrors = [];
function console_(label) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) pageErrors.push(label + ': ' + e.message); });
  vc.on('error', (...a) => {
    const m = a.map(String).join(' ');
    if (!/server ha rifiutato|salvataggio|immagine non caricata/.test(m)) pageErrors.push(label + ' console.error: ' + m);
  });
  vc.on('warn', () => {}); vc.on('log', () => {});
  return vc;
}

function openStudio(label, who, opts = {}) {
  const user = { current: who ? { id: who.id, email: who.email } : null, accounts: [U.alice, U.bob] };
  const network = { up: true };
  const dom = new JSDOM(studioHtml, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://studio.test/', virtualConsole: console_(label),
    beforeParse(w) {
      w.IDEOLOGY_CONFIG = { supabaseUrl: 'https://proj.supabase.co', supabaseKey: opts.key || 'sb_publishable_test' };
      Object.defineProperty(w, 'supabase', {
        value: { createClient: () => makeSupabase({ dbx, hub, user, storage, network }) },
        writable: false, configurable: false
      });
      if (opts.local) w.localStorage.setItem('ideology.content.v1', JSON.stringify(opts.local));
    }
  });
  const w = dom.window;
  /* #root only: body.textContent would include the inlined script source */
  return { w, A: w.IDE, D: w.document, user, network, text: () => (w.document.getElementById('root') || {}).textContent || '' };
}

const edgeDeps = {
  rpc: async (fn, args) => {
    const keys = Object.keys(args);
    try {
      const data = await dbx.as('service_role', null, async (q) =>
        (await q(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k]))).rows[0].r, true);
      return { data, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  },
  sign: async (paths, ttl) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://storage.test/${p}?ttl=${ttl}`, error: null })), error: null })
};

function openClient(token, opts = {}) {
  const dom = new JSDOM(clientHtml, {
    runScripts: 'dangerously', pretendToBeVisual: true,
    url: 'https://studio.test/cliente.html' + (opts.query ? '?c=' : '#c=') + token, virtualConsole: console_('cliente'),
    beforeParse(w) {
      w.IDEOLOGY_CONFIG = { supabaseUrl: 'https://proj.supabase.co', supabaseKey: opts.key || 'sb_publishable_test' };
      w.fetch = async (url, init = {}) => {
        ok.calls = (ok.calls || []).concat([url]);
        if (!String(url).startsWith('https://proj.supabase.co/functions/v1/anteprima')) throw new Error('unexpected fetch ' + url);
        const res = await core.handle(new Request(url, { method: init.method || 'GET', headers: init.headers, body: init.body }), edgeDeps);
        const text = await res.text();
        return { ok: res.ok, status: res.status, json: async () => JSON.parse(text) };
      };
    }
  });
  return { w: dom.window, D: dom.window.document, C: dom.window.IDEC };
}

const clickText = (D, sel, re) => {
  const b = [...D.querySelectorAll(sel)].find((x) => re.test(x.textContent));
  if (!b) throw new Error('nessun pulsante ' + re);
  b.click();
  return b;
};

/* The browser-only document a studio already had, to be brought over.
   It still carries old-style ids and short share tokens. */
const demoCtx = {};
new Function('window', readFileSync('src/data/demo.js', 'utf8'))(demoCtx);
/* Written by an older build: readable ids, 64-bit share tokens. */
const legacy = {};
let n = 0;
const localDoc = JSON.parse(JSON.stringify(demoCtx.__IDEOLOGY_DEMO__)
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (m) => legacy[m] || (legacy[m] = 'old_' + (n++).toString(36)))
  .replace(/"shareToken":"[0-9a-f]+"/g, () => '"shareToken":"' + 'ab12'.repeat(4) + (n++) + '"'));
delete localDoc.__demo;
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
localDoc.posts[0].mediaUrl = JPEG;
localDoc.posts[0].coverUrl = '';
localDoc.posts[0].caption = 'Post con foto vera';
const oldIds = localDoc.posts.map((p) => p.id);

/* ── first login ────────────────────────────────────────────────── */

console.log('\n— primo accesso —');
const a = openStudio('alice', U.alice, { local: localDoc });
ok('senza studio, propone di crearne uno', await until(() => /Non fai ancora parte di uno studio/.test(a.text())));
a.D.querySelector('.gate-form input').value = 'Ideology Test';
a.D.querySelector('.gate-form').dispatchEvent(new a.w.Event('submit', { cancelable: true }));
ok('studio creato, vuoto: chiede da dove partire', await until(() => /Lo studio è vuoto/.test(a.text())));
const ws = (await svc('select id from public.workspaces'))[0].id;
ok('alice ne è proprietaria', (await svc('select role from public.workspace_members where user_id = $1', [U.alice.id]))[0].role === 'owner');

clickText(a.D, '.gate-box button', /Porta qui il lavoro di questo browser/);
ok('il lavoro del browser arriva nello studio',
  await until(() => a.D.querySelector('.rail') && a.A.ui.saveState === 'saved', 15000), a.A.ui.saveState);

const dbPosts = await svc('select * from public.posts where workspace_id = $1', [ws]);
ok('tutti i contenuti sono nel database', dbPosts.length === localDoc.posts.length, dbPosts.length + ' / ' + localDoc.posts.length);
ok('tutti i clienti e gli account',
  (await svc('select count(*)::int n from public.clients'))[0].n === localDoc.clients.length &&
  (await svc('select count(*)::int n from public.accounts'))[0].n === localDoc.clients.reduce((n, c) => n + c.accounts.length, 0));
ok('gli id sono diventati UUID', dbPosts.every((p) => /^[0-9a-f-]{36}$/.test(p.id)) && !dbPosts.some((p) => oldIds.includes(p.id)));
ok('i riferimenti seguono i nuovi id', (await svc(`select count(*)::int n from public.posts p
  where p.category_id is not null and not exists (select 1 from public.categories c where c.id = p.category_id)`))[0].n === 0);
const shareTokens = await svc('select share_token from public.clients');
ok('i link cliente hanno token nuovi e lunghi', shareTokens.every((r) => r.share_token.length >= 48));
const photo = dbPosts.find((p) => p.caption === 'Post con foto vera');
ok('la foto è finita in Storage, nella cartella dello studio', photo && photo.media.startsWith(ws + '/') && storage.files.has(photo.media), photo && photo.media);
ok('nessuna immagine inline nel database', (await svc(`select count(*)::int n from public.posts where media like 'data:%' or cover like 'data:%'`))[0].n === 0);
ok('la cronologia è stata portata', (await svc('select count(*)::int n from public.post_events'))[0].n > 0);
ok('il documento del browser resta lì come copia', !!a.w.localStorage.getItem('ideology.content.v1'));

/* ── a colleague ────────────────────────────────────────────────── */

console.log('\n— un collega —');
a.A.session.openTeam();
ok('il team mostra alice proprietaria', await until(() => /Proprietario/.test(a.D.querySelector('.modal').textContent)));
a.D.querySelector('.modal input[type="email"]').value = 'bob@ideology.it';
clickText(a.D, '.modal button', /^Invita$/);
ok('invito registrato', await until(async () => (await svc('select count(*)::int n from public.workspace_invites'))[0].n === 1));
a.A.closeModal();

const b = openStudio('bob', U.bob);
ok('bob vede l\'invito: studio, ruolo, chi lo manda', await until(() =>
  /Hai un invito/.test(b.text()) && /Ideology Test/.test(b.text()) && /alice@ideology\.it/.test(b.text())));
ok('e non è ancora dentro', (await svc('select count(*)::int n from public.workspace_members where user_id = $1', [U.bob.id]))[0].n === 0);
clickText(b.D, '.invite-row button', /Accetta/);
ok('accetta: entra e vede lo stesso studio', await until(() => b.A.S.posts.length === dbPosts.length && b.D.querySelector('.rail'), 10000), b.A.S.posts.length);
ok('l\'invito è stato usato', (await svc('select count(*)::int n from public.workspace_invites'))[0].n === 0);
ok('bob è editor', b.A.remote.role === 'editor');

/* ── autosave and live updates ──────────────────────────────────── */

console.log('\n— salvataggio automatico e aggiornamenti dal vivo —');
const P = a.A.S.posts.find((p) => p.caption === 'Post con foto vera');
a.A.updatePost(P.id, { caption: 'Scritta da Alice' }, { render: false });
ok('alice: in attesa di salvare', a.A.ui.saveState === 'pending');
ok('salvato nel database da solo', await until(async () => (await svc('select caption from public.posts where id = $1', [P.id]))[0].caption === 'Scritta da Alice'));
ok('bob lo vede senza ricaricare', await until(() => b.A.get(P.id).caption === 'Scritta da Alice'));
const v = (await svc('select version, updated_by from public.posts where id = $1', [P.id]))[0];
ok('versione aumentata, firmata da alice', v.version >= 2 && v.updated_by === U.alice.id, JSON.stringify(v));

const before = (await svc('select count(*)::int n from public.posts'))[0].n;
b.A.ui.clientId = b.A.clientOfAccount(P.accountId).id; b.A.ui.accountId = P.accountId;
const added = b.A.addPost('foto');
b.A.updatePost(added.id, { caption: 'Nuovo da Bob' }, { render: false });
ok('un nuovo contenuto di bob arriva ad alice', await until(() => a.A.get(added.id) && a.A.get(added.id).caption === 'Nuovo da Bob'));
ok('una sola riga nuova', (await svc('select count(*)::int n from public.posts'))[0].n === before + 1);

a.A.deletePost(added.id);
ok('alice lo elimina: sparisce anche da bob', await until(() => !b.A.get(added.id)));
ok('e dal database', await until(async () => (await svc('select count(*)::int n from public.posts where id = $1', [added.id]))[0].n === 0));

/* ── two people, one post ───────────────────────────────────────── */

console.log('\n— due persone sullo stesso contenuto —');
const Q = a.A.S.posts.find((p) => p.status !== 'bozza' && p.id !== P.id) || a.A.S.posts[1];
await until(() => a.A.ui.saveState === 'saved' && b.A.ui.saveState === 'saved');
a.A.updatePost(Q.id, { caption: 'Didascalia di Alice' }, { render: false });
b.A.updatePost(Q.id, { partner: 'Marchio Partner' }, { render: false });
a.A.saveNow(); b.A.saveNow();
ok('campi diversi: si fondono senza chiedere niente', await until(async () => {
  const r = (await svc('select caption, partner from public.posts where id = $1', [Q.id]))[0];
  return r.caption === 'Didascalia di Alice' && r.partner === 'Marchio Partner';
}));
ok('nessuno vede una domanda', !a.D.getElementById('conflict-bar') && !b.D.getElementById('conflict-bar'));
ok('le due finestre convergono', await until(() =>
  a.A.get(Q.id).partner === 'Marchio Partner' && b.A.get(Q.id).caption === 'Didascalia di Alice'));

await until(() => a.A.ui.saveState === 'saved' && b.A.ui.saveState === 'saved');
a.A.updatePost(Q.id, { caption: 'Versione A' }, { render: false });
b.A.updatePost(Q.id, { caption: 'Versione B' }, { render: false });
await a.A.saveNow();
await b.A.saveNow();
ok('stesso campo: chi arriva secondo deve scegliere', await until(() => b.D.getElementById('conflict-bar')),
  a.A.ui.saveState + ' / ' + b.A.ui.saveState);
ok('la domanda dice chi e cosa', /alice@ideology\.it/.test(b.D.getElementById('conflict-bar').textContent) &&
  /Didascalia/.test(b.D.getElementById('conflict-bar').textContent), b.D.getElementById('conflict-bar') && b.D.getElementById('conflict-bar').textContent);
ok('niente è stato sovrascritto in silenzio', (await svc('select caption from public.posts where id = $1', [Q.id]))[0].caption === 'Versione A');
ok('lo stato lo segnala', b.A.ui.saveState === 'conflict');
clickText(b.D, '#conflict-bar button', /Tieni la mia/);
ok('"Tieni la mia" salva la scelta', await until(async () => (await svc('select caption from public.posts where id = $1', [Q.id]))[0].caption === 'Versione B'));
ok('e alice la riceve', await until(() => a.A.get(Q.id).caption === 'Versione B'));

await until(() => a.A.ui.saveState === 'saved' && b.A.ui.saveState === 'saved');
a.A.updatePost(Q.id, { caption: 'Ancora A' }, { render: false });
b.A.updatePost(Q.id, { caption: 'Ancora B' }, { render: false });
await a.A.saveNow();
await b.A.saveNow();
await until(() => b.D.getElementById('conflict-bar'));
clickText(b.D, '#conflict-bar button', /Usa la loro versione/);
ok('"Usa la loro versione" prende quella del collega', b.A.get(Q.id).caption === 'Ancora A');
ok('e non riscrive niente', await until(() => b.A.ui.saveState === 'saved') &&
  (await svc('select caption from public.posts where id = $1', [Q.id]))[0].caption === 'Ancora A');

/* ── vocabularies ───────────────────────────────────────────────── */

console.log('\n— il database accetta ogni valore che l\'app usa —');
{
  const A0 = a.A;
  const post = A0.S.posts[0], story = A0.S.stories[0], slot = A0.S.ugcSlots[0];
  const client = A0.S.clients[0], acc = client.accounts[0], creator = A0.S.creators[0];
  const lists = [
    ['posts', 'status', post.id, A0.STATUS.map((x) => x.key)],
    ['posts', 'kind', post.id, A0.KINDS.map((x) => x.key)],
    ['stories', 'status', story.id, A0.STATUS.map((x) => x.key)],
    ['stories', 'kind', story.id, ['story', 'storyboard']],
    ['ugc_slots', 'status', slot.id, A0.UGC_STATUS.map((x) => x.key)],
    ['ugc_slots', 'mode', slot.id, A0.UGC_MODES.map((x) => x.key)],
    ['clients', 'status', client.id, A0.CLIENT_STATUS.map((x) => x.key)],
    ['creators', 'status', creator.id, A0.CREATOR_STATUS.map((x) => x.key)],
    ['accounts', 'platform', acc.id, Object.keys(A0.PLATFORMS)],
    ['accounts', 'ratio', acc.id, [''].concat(...Object.values(A0.PLATFORMS).map((p) => [p.ratio].concat((p.alts || []).map((x) => x.ratio))))]
  ];
  for (const [table, col, id, values] of lists) {
    const refused = [];
    for (const val of values) {
      try {
        await dbx.as('authenticated', U.alice.id, (q) => q(`update public.${table} set ${col} = $1 where id = $2`, [val, id]));
      } catch (e) { refused.push(val + ' (' + e.message + ')'); }
    }
    ok(`${table}.${col}: ${values.length} valori`, refused.length === 0, refused.join(', '));
  }
}

/* ── history ────────────────────────────────────────────────────── */

console.log('\n— cronologia —');
const draft = a.A.S.posts.find((p) => p.status === 'da_approvare' && p.id !== Q.id && p.id !== P.id);
a.A.setStatus(draft.id, 'bozza', 'studio', '');
a.A.setStatus(draft.id, 'da_approvare', 'studio', 'pronto');
ok('il passaggio di stato è registrato, firmato da chi l\'ha fatto', await until(async () => {
  const e = await svc(`select * from public.post_events where post_id = $1 and to_status = 'da_approvare' and note = 'pronto'`, [draft.id]);
  return e.length === 1 && e[0].actor_user === U.alice.id && e[0].actor === 'studio';
}));
ok('bob vede lo stato e la cronologia', await until(() => b.A.get(draft.id).status === 'da_approvare' &&
  b.A.get(draft.id).history.some((h) => h.note === 'pronto')));

/* ── the client link ────────────────────────────────────────────── */

console.log('\n— il link cliente, dal server —');
const cl = a.A.clientOfAccount(draft.accountId);
const tok = cl.shareToken;
const c = openClient(tok);
ok('la pagina cliente carica dal server', await until(() => c.D.querySelectorAll('.cl-card').length > 0, 8000));
ok('passa dall\'Edge Function, senza token nell\'indirizzo', (ok.calls || []).length > 0 &&
  (ok.calls || []).every((u) => u === 'https://proj.supabase.co/functions/v1/anteprima'));
ok('nessuna bozza arriva al cliente', !c.D.querySelector('.cl-card[data-st="bozza"]'));
ok('nessuna nota interna nella pagina', !/NOTA INTERNA/i.test(c.D.getElementById('cl-root').textContent));
const card = c.D.querySelector('.cl-card[data-id="' + draft.id + '"]') || c.D.querySelector('.cl-card[data-st="da_approvare"]');
const cardId = card.dataset.id;
card.querySelector('.cl-btn.primary').click();
ok('il cliente approva: il database lo registra', await until(async () =>
  (await svc('select status from public.posts where id = $1', [cardId]))[0].status === 'approvato'));
ok('come evento del cliente', (await svc(`select count(*)::int n from public.post_events where post_id = $1 and actor = 'cliente'`, [cardId]))[0].n === 1);
ok('lo studio lo vede dal vivo, con la cronologia', await until(() =>
  a.A.get(cardId).status === 'approvato' && a.A.get(cardId).history.some((h) => h.by === 'cliente')));
ok('la pagina mostra l\'approvazione', await until(() => /Approvato/.test(c.D.querySelector('.cl-card[data-id="' + cardId + '"]').textContent)));

/* review finding: "Annulla modifiche" must undo my edits, not the client's */
{
  const X = a.A.S.posts.find((p) => p.status === 'da_approvare' && p.id !== cardId && a.A.clientOfAccount(p.accountId).id === cl.id);
  const capBefore = X.caption;
  a.A.openPostEditor(X.id);
  a.A.updatePost(X.id, { caption: 'bozza di Alice' }, { render: false });
  await until(() => a.A.ui.saveState === 'saved');
  await c.C.send(tok, X.id, 'approva', '');
  ok('mentre il dialogo è aperto, l\'approvazione del cliente arriva', await until(() => a.A.get(X.id).status === 'approvato'));
  clickText(a.D, '.modal-ft .btn', /^Annulla modifiche$/);
  ok('"Annulla modifiche" toglie la mia modifica', a.A.get(X.id).caption === capBefore);
  ok('ma non l\'approvazione del cliente', a.A.get(X.id).status === 'approvato');
  ok('e nel database resta approvato', await until(async () => {
    const r = (await svc('select status, caption from public.posts where id = $1', [X.id]))[0];
    return r.status === 'approvato' && r.caption === capBefore;
  }));
}

/* review finding: the client's words are theirs */
{
  await c.C.send(tok, cardId, 'revisione', 'Più luce, per favore');
  ok('la richiesta del cliente arriva allo studio', await until(() => a.A.get(cardId).clientNote === 'Più luce, per favore'));
  await until(() => a.A.ui.saveState === 'saved');
  a.A.get(cardId).clientNote = 'riscritta dallo studio';
  a.A.commit({ render: false });
  ok('lo studio non può riscriverla: torna quella del cliente', await until(() =>
    a.A.ui.saveState === 'saved' && a.A.get(cardId).clientNote === 'Più luce, per favore'));
  const v1 = (await svc('select version from public.posts where id = $1', [cardId]))[0].version;
  await sleep(2500);
  const v2 = (await svc('select version from public.posts where id = $1', [cardId]))[0].version;
  ok('e non resta in un giro di salvataggi', v1 === v2, v1 + ' → ' + v2);
  ok('nel database c\'è ancora la sua', (await svc('select client_note from public.posts where id = $1', [cardId]))[0].client_note === 'Più luce, per favore');
}

a.A.updateClient(cl.id, { shareEnabled: false });
ok('il link si spegne dalla scheda cliente', await until(async () =>
  (await svc('select share_enabled from public.clients where id = $1', [cl.id]))[0].share_enabled === false));
const off = openClient(tok);
ok('spento, il cliente vede "link non valido"', await until(() => /Link non valido/.test(off.D.getElementById('cl-root').textContent)));
a.A.updateClient(cl.id, { shareEnabled: true });
await until(async () => (await svc('select share_enabled from public.clients where id = $1', [cl.id]))[0].share_enabled === true);

const bad = openClient('f'.repeat(48));
ok('un token sconosciuto: link non valido', await until(() => /Link non valido/.test(bad.D.getElementById('cl-root').textContent)));
const slug = openClient(cl.slug || 'cliente');
ok('lo slug del cliente non apre niente', await until(() => /Link non valido/.test(slug.D.getElementById('cl-root').textContent)));

/* ── media ──────────────────────────────────────────────────────── */

console.log('\n— media —');
const img = b.A.el('img', { src: photo.media });
ok('un file in Storage diventa un link firmato', await until(() => /^https:\/\/storage\.test\//.test(img.getAttribute('src'))), img.getAttribute('src'));
const link = b.A.el('img', { src: 'https://cdn.example.com/x.jpg' });
ok('un link esterno resta com\'è', link.getAttribute('src') === 'https://cdn.example.com/x.jpg');
b.A.ui.clientId = cl.id;
const up = await b.A.storeMedia(JPEG);
ok('un caricamento va nella cartella dello studio e del cliente', up.startsWith(ws + '/' + cl.id + '/') && /\.jpg$/.test(up), up);

/* ── failures ───────────────────────────────────────────────────── */

console.log('\n— quando qualcosa va storto —');
await until(() => a.A.ui.saveState === 'saved');
a.network.up = false;
a.A.updatePost(P.id, { caption: 'Scritta offline' }, { render: false });
ok('senza rete: offline, e riprova da solo', await until(() => a.A.ui.saveState === 'offline'));
ok('l\'indicatore lo dice', a.D.getElementById('save-state').getAttribute('data-s') === 'offline');
a.network.up = true;
a.w.dispatchEvent(new a.w.Event('online'));
ok('tornata la rete, salva', await until(async () =>
  (await svc('select caption from public.posts where id = $1', [P.id]))[0].caption === 'Scritta offline' && a.A.ui.saveState === 'saved', 10000));

a.A.get(P.id).mediaUrl = 'data:image/png;base64,AAAA';
a.A.commit({ render: false });
ok('una riga che il database rifiuta: "non salvato"', await until(() => a.A.ui.saveState === 'error'));
ok('il resto continua a salvarsi', (() => { a.A.updatePost(Q.id, { caption: 'Dopo il rifiuto' }, { render: false }); return true; })() &&
  await until(async () => (await svc('select caption from public.posts where id = $1', [Q.id]))[0].caption === 'Dopo il rifiuto'));
a.A.get(P.id).mediaUrl = photo.media;
a.A.commit({ render: false });
ok('corretta, torna "salvato"', await until(() => a.A.ui.saveState === 'saved'));

ok('lasciando la pagina con modifiche in sospeso, il browser chiede', (() => {
  a.A.updatePost(P.id, { caption: 'ultima' }, { render: false });
  const ev = new a.w.Event('beforeunload', { cancelable: true });
  a.w.dispatchEvent(ev);
  return ev.defaultPrevented;
})());
await until(() => a.A.ui.saveState === 'saved');

/* ── scale ──────────────────────────────────────────────────────── */

console.log('\n— tanti dati —');
await dbx.raw(`insert into public.ugc_slots (workspace_id, account_id, slot_date)
  select $1, $2, date '2026-01-01' + g from generate_series(1, 1100) g`, [ws, P.accountId]);
const a2 = openStudio('alice-2', U.alice);
ok('oltre 1000 righe: carica tutto, a pagine', await until(() => a2.A.S.ugcSlots.length >= 1100, 15000), a2.A.S.ugcSlots.length);

/* ── switching studio in the middle of a save ───────────────────── */

console.log('\n— cambiare studio mentre salva —');
{
  const ws2 = await dbx.as('authenticated', U.alice.id, async (q) => (await q(`select public.create_workspace('Secondo Studio') as id`)).rows[0].id, true);
  const c2 = (await svc(`insert into public.clients (workspace_id, name) values ($1, 'Cliente B') returning id`, [ws2]))[0].id;
  const ac2 = (await svc(`insert into public.accounts (workspace_id, client_id, handle) values ($1, $2, '@b') returning id`, [ws2, c2]))[0].id;
  await svc(`insert into public.posts (workspace_id, account_id, month, caption) select $1, $2, '2026-11', 'B ' || g from generate_series(1, 12) g`, [ws2, ac2]);
  const before2 = (await svc('select count(*)::int n from public.posts where workspace_id = $1', [ws2]))[0].n;

  const s = openStudio('alice-switch', U.alice);
  await until(() => s.D.querySelector('.rail') && s.A.remote.ws === ws, 10000);
  s.network.delay = 120;                                  // slow network: the save is still running when we switch
  const mine = s.A.S.posts.slice(0, 30);                  // a save that outlasts the switch
  mine.forEach((p, i) => s.A.updatePost(p.id, { caption: 'prima del cambio ' + i }, { render: false }));
  s.A.saveNow();
  s.A.session.openTeam();
  await until(() => s.D.querySelector('.modal select'));
  const sel = s.D.querySelector('.modal select');
  sel.value = ws2;
  sel.dispatchEvent(new s.w.Event('change'));
  ok('apre il secondo studio', await until(() => s.A.remote.ws === ws2 && s.A.S.clients.some((x) => x.name === 'Cliente B') && s.D.querySelector('.rail'), 15000));
  s.network.delay = 0;
  /* the first save made in the new studio is where a stale key would do damage */
  const bPost = s.A.S.posts.find((p) => /^B /.test(p.caption));
  s.A.updatePost(bPost.id, { caption: 'B modificato' }, { render: false });
  await until(() => s.A.ui.saveState === 'saved' && s.A.remote.ws === ws2);
  await sleep(800);
  ok('il secondo studio è intatto', (await svc('select count(*)::int n from public.posts where workspace_id = $1', [ws2]))[0].n === before2);
  ok('nessun contenuto del primo è finito nel secondo', (await svc(`select count(*)::int n from public.posts where workspace_id = $1 and caption like 'prima del cambio%'`, [ws2]))[0].n === 0);
  ok('le modifiche nel primo sono state salvate prima di cambiare', (await svc(`select count(*)::int n from public.posts where workspace_id = $1 and caption like 'prima del cambio%'`, [ws]))[0].n === mine.length);
  ok('il primo studio ha ancora tutti i suoi contenuti', (await svc('select count(*)::int n from public.posts where workspace_id = $1', [ws]))[0].n >= dbPosts.length);
  try { s.w.close(); } catch (e) {}
}

/* ── configuration guards ───────────────────────────────────────── */

console.log('\n— chiavi —');
const leak = openStudio('secret', U.alice, { key: 'sb_secret_abc123' });
ok('lo studio rifiuta una chiave segreta', await until(() => /Configurazione da correggere/.test(leak.text())));
const legacyJwt = 'x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.y';
const leak2 = openStudio('secret2', U.alice, { key: legacyJwt });
ok('anche una service_role in formato JWT', await until(() => /Configurazione da correggere/.test(leak2.text())));
const cleak = openClient(tok, { key: 'sb_secret_abc123' });
ok('la pagina cliente la rifiuta e non chiama nessuno', await until(() => /Pagina da configurare/.test(cleak.D.getElementById('cl-root').textContent)));

/* ── done ───────────────────────────────────────────────────────── */

ok('nessun errore nelle pagine', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));

for (const win of [a, b, c, off, bad, slug, a2, leak, leak2, cleak]) { try { win.w.close(); } catch (e) {} }
await dbx.stop([listener]);
console.log('\n' + (fails ? '✗ ' + fails + ' test falliti' : '✓ tutti i test passati'));
process.exit(fails ? 1 : 0);
