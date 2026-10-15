/* =====================================================================
   Database tests — every migration, against a real PostgreSQL.

     node supabase/tests/db.test.mjs

   Starts a throwaway PostgreSQL 17 (embedded-postgres, no Docker),
   loads the Supabase stand-in, applies every file in
   supabase/migrations in order, then checks the security rules by
   acting as real users through the same roles and JWT claims that
   PostgREST uses.
   ===================================================================== */

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startDb } from './pg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ── runner ─────────────────────────────────────────────────────── */

let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; failures.push([name, e]); console.log('  ✗ ' + name + '\n      ' + (e && e.message)); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
async function rejects(promise, pattern, msg) {
  try { await promise; } catch (e) {
    const text = (e.message || '') + ' ' + (e.code || '');
    if (pattern && !pattern.test(text)) throw new Error((msg || 'wrong error') + ': ' + text);
    return e;
  }
  throw new Error(msg || 'expected an error, got none');
}

/* ── database ───────────────────────────────────────────────────── */

const dbx = await startDb();
const db = { query: (sql, params) => dbx.raw(sql, params) };
const as = dbx.as;
const asUser = (uid, fn, keep) => as('authenticated', uid, fn, keep);
const asAnon = (fn) => as('anon', null, fn);
const asService = (fn, keep) => as('service_role', null, fn, keep);
const cleanup = () => dbx.stop();

/* ── setup ──────────────────────────────────────────────────────── */

console.log('\nDatabase\n');

const migrations = readdirSync(join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
await t(`the Supabase stand-in loads and ${migrations.length} migration(s) apply cleanly`, async () => {
  ok(migrations.length > 0, 'no migrations found');
  await dbx.setup();
});

const U = {
  alice:   randomUUID(),   // owner of studio A
  bob:     randomUUID(),   // invited to A as editor
  carol:   randomUUID(),   // owner of studio B
  mallory: randomUUID(),   // logged in, belongs to nothing
  eve:     randomUUID()    // signed up with an address she never confirmed
};
await db.query(`insert into auth.users (id, email, email_confirmed_at) values
  ($1, 'alice@ideology.it', now()), ($2, 'bob@ideology.it', now()),
  ($3, 'carol@altro.it', now()),    ($4, 'mallory@x.it', now()),
  ($5, 'victim@ideology.it', null)`,
  [U.alice, U.bob, U.carol, U.mallory, U.eve]);

let WA, WB;          // workspaces
const A = {}, B = {}; // their rows

/* ── default deny ───────────────────────────────────────────────── */

console.log('\nDefault deny');

await t('row level security is on for every table in public', async () => {
  const r = await db.query(`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  eq(r.rows.length, 0, 'tables without RLS: ' + r.rows.map(x => x.relname).join(', '));
});

await t('anon has no privilege on any table in public', async () => {
  const r = await db.query(`
    select c.relname, p.priv from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
    where n.nspname = 'public' and c.relkind in ('r','v','m')
      and has_table_privilege('anon', c.oid, p.priv)`);
  eq(r.rows.length, 0, 'anon can: ' + r.rows.map(x => x.relname + ':' + x.priv).join(', '));
});

await t('anon can execute no function in public', async () => {
  const r = await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`);
  eq(r.rows.length, 0, 'anon can call: ' + r.rows.map(x => x.proname).join(', '));
});

await t('only the service role can call the client-link functions', async () => {
  for (const fn of ['client_preview(text)', 'client_review(text,uuid,text,text)']) {
    const r = await db.query(`select
      has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') as auth,
      has_function_privilege('service_role',  'public.${fn}', 'EXECUTE') as svc`);
    eq(r.rows[0].auth, false, fn + ' callable by authenticated');
    eq(r.rows[0].svc, true, fn + ' not callable by service_role');
  }
});

await t('anon reading posts is refused outright', async () => {
  await rejects(asAnon(q => q('select * from public.posts')), /permission denied/);
});

await t('a table added by a later migration is not exposed by default', async () => {
  await db.query('create table public._later (id int)');
  const r = await db.query(`select
    has_table_privilege('anon', 'public._later', 'SELECT') as anon,
    has_table_privilege('authenticated', 'public._later', 'SELECT') as auth`);
  await db.query('drop table public._later');
  eq(r.rows[0].anon, false, 'anon');
  eq(r.rows[0].auth, false, 'authenticated');
});

/* ── studios ────────────────────────────────────────────────────── */

console.log('\nStudios and membership');

await t('first login creates a studio and makes you its owner', async () => {
  WA = await asUser(U.alice, async q => (await q(`select public.create_workspace('Ideology') as id`)).rows[0].id, true);
  WB = await asUser(U.carol, async q => (await q(`select public.create_workspace('Altro Studio') as id`)).rows[0].id, true);
  const m = await db.query('select role, email from public.workspace_members where workspace_id = $1', [WA]);
  eq(m.rows.length, 1); eq(m.rows[0].role, 'owner'); eq(m.rows[0].email, 'alice@ideology.it');
});

await t('a member cannot be inserted directly, only through an invite', async () => {
  await rejects(asUser(U.mallory, q => q(
    'insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, $3)',
    [WA, U.mallory, 'owner'])), /permission denied/);
});

/* seed both studios through the API path, as their owners */
async function seedStudio(uid, ws, out) {
  await asUser(uid, async q => {
    out.client = (await q(`insert into public.clients (workspace_id, name) values ($1, 'Cliente') returning *`, [ws])).rows[0];
    out.other  = (await q(`insert into public.clients (workspace_id, name) values ($1, 'Secondo') returning *`, [ws])).rows[0];
    out.acc    = (await q(`insert into public.accounts (workspace_id, client_id, handle) values ($1, $2, '@uno') returning *`, [ws, out.client.id])).rows[0];
    out.acc2   = (await q(`insert into public.accounts (workspace_id, client_id, handle, platform) values ($1, $2, '@uno.tt', 'TikTok') returning *`, [ws, out.client.id])).rows[0];
    out.accO   = (await q(`insert into public.accounts (workspace_id, client_id, handle) values ($1, $2, '@secondo') returning *`, [ws, out.other.id])).rows[0];
    out.cat    = (await q(`insert into public.categories (workspace_id, client_id, name, color) values ($1, $2, 'Prodotto', '#4F5E4A') returning *`, [ws, out.client.id])).rows[0];
    out.creator= (await q(`insert into public.creators (workspace_id, client_id, name) values ($1, $2, 'Marta') returning *`, [ws, out.client.id])).rows[0];
    const post = (status, extra = {}) => q(
      `insert into public.posts (workspace_id, account_id, month, status, caption, internal_note, category_id, also_on, publish_date)
       values ($1, $2, '2026-10', $3, $4, 'NOTA INTERNA SEGRETA', $5, $6, $7) returning *`,
      [ws, extra.account || out.acc.id, status, extra.caption || 'Caption ' + status, extra.cat === undefined ? out.cat.id : extra.cat,
       extra.alsoOn || '{}', extra.date || null]).then(r => r.rows[0]);
    out.draft     = await post('bozza');
    out.pending   = await post('da_approvare', { date: '2026-10-20' });
    out.pending2  = await post('da_approvare', { date: '2026-10-05' });
    out.published = await post('pubblicato');
    out.cross     = await post('da_approvare', { account: out.acc2.id, alsoOn: '{' + out.acc.id + '}' });
    out.otherPost = await post('da_approvare', { account: out.accO.id, cat: null, caption: 'ALTRO CLIENTE' });
    out.ugc   = (await q(`insert into public.ugc_slots (workspace_id, account_id, slot_date, creator_id) values ($1, $2, '2026-10-03', $3) returning *`, [ws, out.acc.id, out.creator.id])).rows[0];
    out.story = (await q(`insert into public.stories (workspace_id, account_id, month, from_post_id) values ($1, $2, '2026-10', $3) returning *`, [ws, out.acc.id, out.pending.id])).rows[0];
    await q(`insert into public.post_events (workspace_id, post_id, from_status, to_status, actor) values ($1, $2, 'bozza', 'da_approvare', 'studio')`, [ws, out.pending.id]);
  }, true);
}

await t('owners create clients, accounts, posts in their own studio', async () => {
  await seedStudio(U.alice, WA, A);
  await seedStudio(U.carol, WB, B);
  eq(A.client.version, 1, 'version starts at 1');
  ok(/^[0-9a-f]{48}$/.test(A.client.share_token), 'share token is 192-bit hex: ' + A.client.share_token);
  eq(A.client.updated_by, U.alice, 'updated_by is the writer');
});

/* ── tenant isolation ───────────────────────────────────────────── */

console.log('\nIsolation between studios');

const CONTENT = ['clients', 'accounts', 'categories', 'creators', 'posts', 'stories', 'highlights', 'ugc_slots', 'post_events'];

await t("another studio's owner sees none of your rows, in any table", async () => {
  await asUser(U.carol, async q => {
    for (const tbl of CONTENT) {
      const r = await q(`select count(*)::int as n from public.${tbl} where workspace_id = $1`, [WA]);
      eq(r.rows[0].n, 0, tbl);
    }
    eq((await q('select count(*)::int as n from public.workspaces where id = $1', [WA])).rows[0].n, 0, 'workspaces');
    eq((await q('select count(*)::int as n from public.workspace_members where workspace_id = $1', [WA])).rows[0].n, 0, 'members');
  });
});

await t('a logged-in stranger sees nothing at all', async () => {
  await asUser(U.mallory, async q => {
    for (const tbl of CONTENT.concat(['workspaces', 'workspace_members', 'workspace_invites'])) {
      eq((await q(`select count(*)::int as n from public.${tbl}`)).rows[0].n, 0, tbl);
    }
  });
});

await t("updating or deleting another studio's post silently affects nothing", async () => {
  await asUser(U.carol, async q => {
    eq((await q(`update public.posts set caption = 'hacked' where id = $1`, [A.pending.id])).rowCount, 0, 'update');
    eq((await q(`delete from public.posts where id = $1`, [A.pending.id])).rowCount, 0, 'delete');
  });
  eq((await db.query('select caption from public.posts where id = $1', [A.pending.id])).rows[0].caption, 'Caption da_approvare');
});

await t("writing into another studio is refused", async () => {
  await rejects(asUser(U.carol, q => q(
    `insert into public.clients (workspace_id, name) values ($1, 'intruso')`, [WA])), /row-level security/);
});

await t("a post cannot point at another studio's account, even knowing its id", async () => {
  await rejects(asUser(U.carol, q => q(
    `insert into public.posts (workspace_id, account_id, month) values ($1, $2, '2026-10')`, [WB, A.acc.id])),
    /foreign key/);
});

await t('a row cannot be moved to another studio', async () => {
  await rejects(asUser(U.alice, q => q(
    `update public.clients set workspace_id = $1 where id = $2`, [WB, A.client.id])), /row-level security|immutable/);
});

/* ── concurrency ────────────────────────────────────────────────── */

console.log('\nVersions and conflicts');

await t('every update bumps the version and stamps who did it', async () => {
  const r = await asUser(U.alice, q => q(
    `update public.posts set caption = 'v2', version = 1 where id = $1 and version = 1 returning version, updated_by`,
    [A.draft.id]), true);
  eq(r.rows[0].version, 2); eq(r.rows[0].updated_by, U.alice);
});

await t('a stale write filtered by version changes nothing', async () => {
  const r = await asUser(U.alice, q => q(
    `update public.posts set caption = 'stale' where id = $1 and version = 1`, [A.draft.id]));
  eq(r.rowCount, 0);
});

await t('a stale write that sends its version is rejected as a conflict', async () => {
  await rejects(asUser(U.alice, q => q(
    `update public.posts set caption = 'stale', version = 1 where id = $1`, [A.draft.id])), /version_conflict|40001/);
});

await t('clients cannot forge version, created_at or updated_by', async () => {
  const r = await asUser(U.alice, q => q(
    `insert into public.categories (workspace_id, client_id, name, version, updated_by, created_at)
     values ($1, $2, 'x', 99, $3, '2999-01-01') returning version, updated_by, created_at`,
    [WA, A.client.id, U.carol]));
  eq(r.rows[0].version, 1); eq(r.rows[0].updated_by, U.alice);
  ok(new Date(r.rows[0].created_at) < new Date('2100-01-01'), 'future created_at accepted');
});

/* ── integrity ──────────────────────────────────────────────────── */

console.log('\nIntegrity');

await t('inline base64 media is refused, in every media column', async () => {
  const data = 'data:image/jpeg;base64,AAAA';
  await rejects(asUser(U.alice, q => q(`update public.posts set media = $1 where id = $2`, [data, A.pending.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set slides = $1 where id = $2`,
    [JSON.stringify([{ id: 's', url: data }]), A.pending.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.accounts set avatar = $1 where id = $2`, [data, A.acc.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set cover = 'javascript:alert(1)' where id = $1`, [A.pending.id])), /check constraint/);
});

await t('storage paths in your own folder and https links are accepted', async () => {
  await asUser(U.alice, q => q(`update public.posts set media = $1, cover = $2 where id = $3`,
    [`${WA}/${A.client.id}/abc.jpg`, 'https://cdn.example.com/x.jpg', A.pending2.id]));
});

await t("a path into another studio's folder is refused (the client link would sign it)", async () => {
  await rejects(asUser(U.alice, q => q(`update public.posts set media = $1 where id = $2`,
    [`${WB}/x/stolen.jpg`, A.pending2.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set slides = $1 where id = $2`,
    [JSON.stringify([{ id: 's', url: `${WB}/x/stolen.jpg` }]), A.pending2.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set media = $1 where id = $2`,
    [`${WA}/../${WB}/stolen.jpg`, A.pending2.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set media = 'ftp://x/y.jpg' where id = $1`,
    [A.pending2.id])), /check constraint/);
});

await t('vocabularies are enforced', async () => {
  await rejects(asUser(U.alice, q => q(`update public.posts set status = 'boh' where id = $1`, [A.pending.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.accounts set platform = 'MySpace' where id = $1`, [A.acc.id])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.posts set month = '2026-13' where id = $1`, [A.pending.id])), /check constraint/);
});

await t('a post can have only one Stories mirror', async () => {
  await rejects(asUser(U.alice, q => q(
    `insert into public.stories (workspace_id, account_id, month, from_post_id) values ($1, $2, '2026-10', $3)`,
    [WA, A.acc.id, A.pending.id])), /duplicate key/);
});

await t("the client's own words cannot be changed by a studio update", async () => {
  await asService(q => q(`update public.posts set client_note = 'Parole del cliente', client_note_at = now() where id = $1`, [A.pending2.id]), true);
  const r = await asUser(U.alice, q => q(
    `update public.posts set client_note = 'falso', client_note_at = null, caption = 'ok' where id = $1 returning client_note, client_note_at, caption`,
    [A.pending2.id]));
  eq(r.rows[0].client_note, 'Parole del cliente'); ok(r.rows[0].client_note_at, 'timestamp cleared'); eq(r.rows[0].caption, 'ok');
});

await t('free-form fields have a size limit', async () => {
  await rejects(asUser(U.alice, q => q(`update public.workspaces set prefs = $1 where id = $2`,
    [JSON.stringify({ x: 'y'.repeat(20000) }), WA])), /check constraint/);
  await rejects(asUser(U.alice, q => q(`update public.clients set palette = $1 where id = $2`,
    [JSON.stringify({ bg: 'z'.repeat(5000) }), A.client.id])), /check constraint/);
});

await t('deleting a category un-categorises its posts instead of deleting them', async () => {
  await asUser(U.alice, async q => {
    await q('delete from public.categories where id = $1', [A.cat.id]);
    const r = await q('select category_id from public.posts where id = $1', [A.pending.id]);
    eq(r.rows.length, 1, 'post survived'); eq(r.rows[0].category_id, null);
  });
});

await t('deleting a creator frees their UGC slots', async () => {
  await asUser(U.alice, async q => {
    await q('delete from public.creators where id = $1', [A.creator.id]);
    eq((await q('select creator_id from public.ugc_slots where id = $1', [A.ugc.id])).rows[0].creator_id, null);
  });
});

await t('deleting a client removes everything it owns, and nothing else', async () => {
  await asUser(U.alice, async q => {
    await q('delete from public.clients where id = $1', [A.client.id]);
    for (const [tbl, id] of [['accounts', A.acc.id], ['posts', A.pending.id], ['stories', A.story.id], ['ugc_slots', A.ugc.id]]) {
      eq((await q(`select count(*)::int as n from public.${tbl} where id = $1`, [id])).rows[0].n, 0, tbl + ' left behind');
    }
    eq((await q('select count(*)::int as n from public.post_events where post_id = $1', [A.pending.id])).rows[0].n, 0, 'history left behind');
    eq((await q('select count(*)::int as n from public.posts where id = $1', [A.otherPost.id])).rows[0].n, 1, 'other client touched');
  });
});

/* ── invites and roles ──────────────────────────────────────────── */

console.log('\nInvites and roles');

await t('only owners can invite', async () => {
  await rejects(asUser(U.mallory, q => q(
    `insert into public.workspace_invites (workspace_id, email) values ($1, 'x@y.it')`, [WA])), /row-level security/);
  await asUser(U.alice, q => q(
    `insert into public.workspace_invites (workspace_id, email) values ($1, 'bob@ideology.it'), ($1, 'victim@ideology.it')`, [WA]), true);
});

await t('an invite is never accepted automatically', async () => {
  await asUser(U.bob, async q => {
    eq((await q('select count(*)::int as n from public.posts where workspace_id = $1', [WA])).rows[0].n, 0, 'sees data before accepting');
    const p = (await q('select * from public.pending_invites()')).rows;
    eq(p.length, 1); eq(p[0].workspace_name, 'Ideology'); eq(p[0].invited_by_email, 'alice@ideology.it'); eq(p[0].role, 'editor');
  });
});

await t('accepting joins the studio, with the invited role', async () => {
  await asUser(U.bob, q => q('select public.accept_invite($1)', [WA]), true);
  await asUser(U.bob, async q => {
    ok((await q('select count(*)::int as n from public.posts where workspace_id = $1', [WA])).rows[0].n > 0, 'no data after joining');
    eq((await q('select role from public.workspace_members where user_id = $1', [U.bob])).rows[0].role, 'editor');
    eq((await q('select count(*)::int as n from public.pending_invites()')).rows[0].n, 0, 'invite still pending');
  });
});

await t("you cannot accept a studio you were not invited to", async () => {
  await rejects(asUser(U.mallory, q => q('select public.accept_invite($1)', [WA])), /no_invite/);
});

await t('an unconfirmed address sees and accepts nothing, even if invited', async () => {
  eq(await asUser(U.eve, async q => (await q('select count(*)::int as n from public.pending_invites()')).rows[0].n), 0);
  await rejects(asUser(U.eve, q => q('select public.accept_invite($1)', [WA])), /not_authenticated/);
});

await t('declining removes the invite and joins nothing', async () => {
  await asUser(U.alice, q => q(`insert into public.workspace_invites (workspace_id, email) values ($1, 'mallory@x.it')`, [WA]), true);
  eq(await asUser(U.mallory, async q => (await q('select public.decline_invite($1) as r', [WA])).rows[0].r, true), true);
  eq((await db.query('select count(*)::int as n from public.workspace_invites where email = $1', ['mallory@x.it'])).rows[0].n, 0);
  eq((await db.query('select count(*)::int as n from public.workspace_members where user_id = $1', [U.mallory])).rows[0].n, 0);
});

await t('editors cannot invite, change roles or remove people', async () => {
  await rejects(asUser(U.bob, q => q(
    `insert into public.workspace_invites (workspace_id, email) values ($1, 'z@y.it')`, [WA])), /row-level security/);
  eq((await asUser(U.bob, q => q(`update public.workspace_members set role = 'owner' where user_id = $1`, [U.bob]))).rowCount, 0, 'self-promotion');
  eq((await asUser(U.bob, q => q(`delete from public.workspace_members where user_id = $1`, [U.alice]))).rowCount, 0, 'removed the owner');
});

await t('the last owner cannot leave; after handing over, they can', async () => {
  await rejects(asUser(U.alice, q => q(`delete from public.workspace_members where user_id = $1 and workspace_id = $2`, [U.alice, WA])), /last_owner/);
  await asUser(U.alice, async q => {
    await q(`update public.workspace_members set role = 'owner' where user_id = $1 and workspace_id = $2`, [U.bob, WA]);
    eq((await q(`delete from public.workspace_members where user_id = $1 and workspace_id = $2`, [U.alice, WA])).rowCount, 1);
  });
});

/* ── history ────────────────────────────────────────────────────── */

console.log('\nApproval history');

await t('a studio event is always signed by whoever is logged in', async () => {
  const r = await asUser(U.alice, q => q(
    `insert into public.post_events (workspace_id, post_id, to_status, actor, actor_user, at)
     values ($1, $2, 'approvato', 'studio', $3, '2999-01-01') returning actor_user, at`,
    [WA, A.otherPost.id, U.carol]));
  eq(r.rows[0].actor_user, U.alice, 'forged signer');
  ok(new Date(r.rows[0].at) < new Date('2100-01-01'), 'future-dated event');
});

await t('members cannot write an event in the client\'s name', async () => {
  await rejects(asUser(U.alice, q => q(
    `insert into public.post_events (workspace_id, post_id, to_status, actor) values ($1, $2, 'approvato', 'cliente')`,
    [WA, A.otherPost.id])), /row-level security/);
});

await t('history cannot be edited or deleted through the API', async () => {
  await rejects(asUser(U.alice, q => q(`update public.post_events set note = 'x'`)), /permission denied/);
  await rejects(asUser(U.alice, q => q(`delete from public.post_events`)), /permission denied/);
});

/* ── the client link ────────────────────────────────────────────── */

console.log('\nClient link (service role, as the Edge Function calls it)');

const preview = (token) => asService(async q => (await q('select public.client_preview($1) as j', [token])).rows[0].j);
const review = (token, post, action, note) =>
  asService(async q => (await q('select public.client_review($1, $2, $3, $4) as j', [token, post, action, note || ''])).rows[0].j, true);

await t('an unknown token reveals nothing', async () => {
  await rejects(preview('f'.repeat(48)), /invalid_token/);
});

await t('a valid token returns that client only, without drafts or internal notes', async () => {
  const j = await preview(B.client.share_token);
  const text = JSON.stringify(j);
  eq(j.client.name, 'Cliente');
  ok(!text.includes('NOTA INTERNA'), 'internal note leaked');
  ok(!text.includes('ALTRO CLIENTE'), "another client's post leaked");
  ok(!text.includes(B.draft.id), 'draft leaked');
  ok(!text.includes('share_token') && !text.includes(B.client.share_token), 'token echoed');
  ok(!text.includes(WB), 'workspace id leaked');
  eq(j.accounts.length, 2);
  const ids = j.posts.map(p => p.id);
  ok(ids.includes(B.pending.id) && ids.includes(B.published.id) && ids.includes(B.cross.id), 'visible posts missing');
  for (const p of j.posts) for (const a of p.accountIds) ok([B.acc.id, B.acc2.id].includes(a), 'foreign account id');
  ok(j.posts.findIndex(p => p.id === B.pending2.id) < j.posts.findIndex(p => p.id === B.pending.id), 'not ordered by date');
  eq(j.posts.find(p => p.id === B.pending.id).category.name, 'Prodotto');
});

await t('the palette is an allow-list too: extra keys stay in the studio', async () => {
  await asUser(U.carol, q => q(`update public.clients set palette = palette || '{"segreto":"x"}' where id = $1`, [B.client.id]), true);
  const j = await preview(B.client.share_token);
  eq(Object.keys(j.client.palette).sort().join(','), 'accent,alt,bg,ink');
});

await t('a cross-posted post carries every one of the client\'s accounts it appears on', async () => {
  const j = await preview(B.client.share_token);
  const p = j.posts.find(x => x.id === B.cross.id);
  eq(p.accountIds.length, 2);
});

await t('turning the link off revokes it immediately', async () => {
  await asUser(U.carol, q => q('update public.clients set share_enabled = false where id = $1', [B.client.id]), true);
  await rejects(preview(B.client.share_token), /invalid_token/);
  await asUser(U.carol, q => q('update public.clients set share_enabled = true where id = $1', [B.client.id]), true);
});

await t('approve writes the status and a client event, nothing else', async () => {
  const before = (await db.query('select * from public.posts where id = $1', [B.pending.id])).rows[0];
  const j = await review(B.client.share_token, B.pending.id, 'approva');
  eq(j.status, 'approvato'); eq(j.changed, true);
  const after = (await db.query('select * from public.posts where id = $1', [B.pending.id])).rows[0];
  eq(after.internal_note, before.internal_note); eq(after.caption, before.caption);
  eq(after.version, before.version + 1, 'version bump lets the studio see it changed');
  const ev = (await db.query(`select * from public.post_events where post_id = $1 and actor = 'cliente'`, [B.pending.id])).rows;
  eq(ev.length, 1); eq(ev[0].from_status, 'da_approvare'); eq(ev[0].to_status, 'approvato'); eq(ev[0].actor_user, null);
});

await t('approving twice is harmless', async () => {
  const j = await review(B.client.share_token, B.pending.id, 'approva');
  eq(j.changed, false);
  eq((await db.query(`select count(*)::int as n from public.post_events where post_id = $1 and actor = 'cliente'`, [B.pending.id])).rows[0].n, 1);
});

await t('a change request needs a message, and lands in the client field only', async () => {
  await rejects(review(B.client.share_token, B.pending2.id, 'revisione', '   '), /note_required/);
  const j = await review(B.client.share_token, B.pending2.id, 'revisione', 'Più luce nella foto');
  eq(j.status, 'in_revisione'); eq(j.clientNote, 'Più luce nella foto'); eq(j.revisions, 1);
  const p = (await db.query('select internal_note, client_note_at from public.posts where id = $1', [B.pending2.id])).rows[0];
  eq(p.internal_note, 'NOTA INTERNA SEGRETA'); ok(p.client_note_at);
});

await t('taking an answer back returns the post to "da approvare"', async () => {
  eq((await review(B.client.share_token, B.pending2.id, 'annulla')).status, 'da_approvare');
});

await t('a draft, another client\'s post and a missing post all answer "not found"', async () => {
  await rejects(review(B.client.share_token, B.draft.id, 'approva'), /not_found/);
  await rejects(review(B.client.share_token, B.otherPost.id, 'approva'), /not_found/);
  await rejects(review(B.client.share_token, randomUUID(), 'approva'), /not_found/);
  await rejects(review(B.client.share_token, A.otherPost.id, 'approva'), /not_found/, "another studio's post");
});

await t('published content cannot be re-opened from the client link', async () => {
  await rejects(review(B.client.share_token, B.published.id, 'revisione', 'cambia'), /invalid_transition/);
  await rejects(review(B.client.share_token, B.published.id, 'annulla'), /invalid_transition/);
});

await t('unknown actions are refused', async () => {
  await rejects(review(B.client.share_token, B.pending.id, 'pubblica'), /invalid_action/);
});

await t('a change request is capped at 2000 characters', async () => {
  const j = await review(B.client.share_token, B.cross.id, 'revisione', 'x'.repeat(5000));
  eq(j.clientNote.length, 2000);
});

/* ── storage ────────────────────────────────────────────────────── */

console.log('\nStorage');

await t('the media bucket is private and refuses SVG', async () => {
  const b = (await db.query(`select * from storage.buckets where id = 'media'`)).rows[0];
  eq(b.public, false);
  ok(!b.allowed_mime_types.includes('image/svg+xml'), 'svg allowed');
});

await t('members upload under their studio folder only', async () => {
  await asUser(U.carol, q => q(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${WB}/c/1.jpg`]), true);
  await rejects(asUser(U.carol, q => q(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${WA}/c/1.jpg`])), /row-level security/);
  await rejects(asUser(U.carol, q => q(`insert into storage.objects (bucket_id, name) values ('media', 'senza-cartella.jpg')`)), /row-level security/);
});

await t('object names must look like database media paths', async () => {
  for (const bad of [`${WB}/../${WA}/x.jpg`, `${WB}/%2e%2e/x.jpg`, `${WB}/a b.jpg`, `${WB.toUpperCase()}/x.jpg`]) {
    await rejects(asUser(U.carol, q => q(`insert into storage.objects (bucket_id, name) values ('media', $1)`, [bad])),
      /row-level security/, bad);
  }
});

await t("another studio's files are invisible", async () => {
  await asUser(U.bob, async q => {
    eq((await q(`select count(*)::int as n from storage.objects where name like $1`, [WB + '/%'])).rows[0].n, 0);
  });
  await asAnon(async q => {
    eq((await q(`select count(*)::int as n from storage.objects`)).rows[0].n, 0, 'anon');
  });
});

/* ── the Edge Function, end to end ──────────────────────────────── */

console.log('\nEdge Function → database');

const core = await import('../functions/_shared/anteprima-core.ts');
let rpcCalls = 0;
const deps = {
  /* the same call PostgREST makes for supabase.rpc(), as the service role */
  rpc: async (fn, args) => {
    rpcCalls++;
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    try {
      const data = await asService(async q => (await q(sql, keys.map(k => args[k]))).rows[0].r, true);
      return { data, error: null };
    } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
  },
  sign: async (paths, ttl) => ({
    data: paths.map(p => ({ path: p, signedUrl: `https://signed.test/${p}?ttl=${ttl}`, error: null })),
    error: null
  }),
  log() {}
};
const call = async (method, opts = {}) => {
  const url = 'https://fn.test/anteprima';
  const init = { method, headers: opts.headers || {} };
  if (opts.body !== undefined) {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    init.headers['content-type'] = init.headers['content-type'] || 'application/json';
  }
  const res = await core.handle(new Request(url, init), deps);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
};
const tok = () => B.client.share_token;

await t('preflight answers with CORS headers', async () => {
  const r = await call('OPTIONS');
  eq(r.status, 204); eq(r.headers.get('access-control-allow-origin'), '*');
});

await t('reading is POST only: a token never goes in a URL', async () => {
  eq((await call('GET')).status, 405);
});

await t('a malformed token is turned away before reaching the database', async () => {
  const before = rpcCalls;
  const r = await call('POST', { body: { op: 'read', token: "x' or 1=1 --" } });
  eq(r.status, 404); eq(r.json.code, 'invalid_token'); eq(rpcCalls, before, 'database was called');
});

await t('an unknown token gets the same 404', async () => {
  const r = await call('POST', { body: { op: 'read', token: 'a'.repeat(48) } });
  eq(r.status, 404); eq(r.json.code, 'invalid_token');
});

await t('storage paths come back as signed URLs; links pass through; nothing raw leaks', async () => {
  await asService(q => q(`update public.posts set media = $1, cover = $2, slides = $3 where id = $4`,
    [`${WB}/c/a.jpg`, 'https://cdn.example.com/c.jpg', JSON.stringify([{ id: 's1', url: `${WB}/c/s1.jpg`, caption: 'segreta' }]), B.pending2.id]), true);
  const r = await call('POST', { body: { op: 'read', token: tok() } });
  eq(r.status, 200);
  eq(r.headers.get('cache-control'), 'no-store');
  const p = r.json.posts.find(x => x.id === B.pending2.id);
  eq(p.mediaUrl, `https://signed.test/${WB}/c/a.jpg?ttl=${core.SIGNED_URL_TTL}`);
  eq(p.coverUrl, 'https://cdn.example.com/c.jpg');
  eq(p.slides[0].url, `https://signed.test/${WB}/c/s1.jpg?ttl=${core.SIGNED_URL_TTL}`);
  ok(!('caption' in p.slides[0]), 'slide caption leaked');
  ok(!('media' in p) && !('cover' in p), 'raw fields leaked');
  ok(!r.text.includes('NOTA INTERNA'), 'internal note leaked');
});

await t('POST refuses anything that is not JSON, too big, or malformed', async () => {
  eq((await call('POST', { body: 'a=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
  eq((await call('POST', { body: JSON.stringify({ note: 'x'.repeat(20000) }) })).status, 413);
  eq((await call('POST', { body: '{not json' })).status, 400);
  eq((await call('POST', { body: '[]' })).status, 400);
});

await t('POST validates every field before the database sees it', async () => {
  const before = rpcCalls;
  eq((await call('POST', { body: { token: 'short', postId: B.pending2.id, action: 'approva' } })).status, 404);
  eq((await call('POST', { body: { token: tok(), postId: 'not-a-uuid', action: 'approva' } })).status, 404);
  eq((await call('POST', { body: { token: tok(), postId: B.pending2.id, action: 'delete' } })).status, 400);
  eq((await call('POST', { body: { token: tok(), postId: B.pending2.id, action: 'revisione', note: '  ' } })).status, 400);
  eq(rpcCalls, before, 'database was called');
});

await t('POST approve works end to end', async () => {
  const r = await call('POST', { body: { token: tok(), postId: B.pending2.id, action: 'approva' } });
  eq(r.status, 200); eq(r.json.ok, true); eq(r.json.status, 'approvato');
});

await t('a draft and a post that does not exist answer identically', async () => {
  const a = await call('POST', { body: { token: tok(), postId: B.draft.id, action: 'approva' } });
  const b = await call('POST', { body: { token: tok(), postId: randomUUID(), action: 'approva' } });
  eq(a.status, 404); eq(a.text, b.text);
});

await t('published content answers 409', async () => {
  eq((await call('POST', { body: { token: tok(), postId: B.published.id, action: 'annulla' } })).status, 409);
});

await t('an unexpected database error is a generic 500 that reveals nothing', async () => {
  const bad = { ...deps, rpc: async () => ({ data: null, error: { message: 'relation "secret_table" does not exist' } }) };
  const res = await core.handle(new Request('https://fn.test/anteprima', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'read', token: tok() }) }), bad);
  const text = await res.text();
  eq(res.status, 500); ok(!text.includes('secret_table'), 'internal error leaked');
});

await t('other methods and unknown operations are refused', async () => {
  eq((await call('POST', { body: { op: 'delete', token: tok() } })).status, 400);
  eq((await call('PUT', { body: {} })).status, 405);
  eq((await call('DELETE')).status, 405);
});

/* ── lifecycle ──────────────────────────────────────────────────── */

console.log('\nLifecycle');

await t('realtime publishes every content table', async () => {
  const r = await db.query(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
  const names = r.rows.map(x => x.tablename);
  for (const tbl of ['workspaces', 'posts', 'stories', 'clients', 'accounts', 'post_events']) ok(names.includes(tbl), tbl);
  ok(!names.includes('workspace_invites'), 'invites should not be broadcast');
});

await t('deleting a login removes its memberships without tripping the owner rule', async () => {
  await db.query('delete from auth.users where id = $1', [U.carol]);
  eq((await db.query('select count(*)::int as n from public.workspace_members where user_id = $1', [U.carol])).rows[0].n, 0);
});

await t('deleting a studio removes all of its content', async () => {
  await db.query('delete from public.workspaces where id = $1', [WB]);
  for (const tbl of CONTENT) {
    eq((await db.query(`select count(*)::int as n from public.${tbl} where workspace_id = $1`, [WB])).rows[0].n, 0, tbl);
  }
});

/* ── done ───────────────────────────────────────────────────────── */

await cleanup();
console.log('\n' + passed + ' passati, ' + failed + ' falliti');
if (failed) {
  for (const [n, e] of failures) console.error('\n✗ ' + n + '\n' + (e && e.stack));
  process.exit(1);
}
console.log('✓ tutti i test del database passati');
