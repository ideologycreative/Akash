/* =====================================================================
   A throwaway PostgreSQL with the Supabase stand-in and every
   migration applied. Shared by the database tests and the sync tests.

   All access goes through one connection guarded by a lock, so that
   concurrent callers (two simulated browsers, an Edge Function, the
   test itself) each get a whole transaction to themselves — the same
   isolation PostgREST gives each HTTP request.
   ===================================================================== */

import EmbeddedPostgres from 'embedded-postgres';
import pgPkg from 'pg';
import { readFileSync, readdirSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export async function startDb() {
  const base = mkdtempSync(join(tmpdir(), 'ideology-db-'));
  chmodSync(base, 0o777);
  const port = 54000 + Math.floor(Math.random() * 900);
  const pg = new EmbeddedPostgres({
    databaseDir: join(base, 'data'), user: 'postgres', password: 'postgres',
    port, persistent: false, onLog() {}, onError() {}
  });
  await pg.initialise();
  await pg.start();
  const db = pg.getPgClient();
  await db.connect();

  let chain = Promise.resolve();
  function locked(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {});
    return run;
  }

  /* One transaction as `role`, with the JWT claims PostgREST would set.
     Committed when keep is true, rolled back otherwise. */
  function as(role, sub, fn, keep = false) {
    return locked(async () => {
      await db.query('begin');
      try {
        await db.query(`set local role ${role}`);
        const claims = JSON.stringify(sub ? { sub, role } : { role });
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        const out = await fn((sql, params) => db.query(sql, params));
        await db.query(keep ? 'commit' : 'rollback');
        return out;
      } catch (e) {
        await db.query('rollback');
        throw e;
      }
    });
  }

  const raw = (sql, params) => locked(() => db.query(sql, params));

  async function setup() {
    await raw(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'));
    const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      try { await raw(readFileSync(join(root, 'migrations', f), 'utf8')); }
      catch (e) { throw new Error(f + ': ' + e.message); }
    }
    return files;
  }

  /* Realtime, emulated: a trigger on every published table NOTIFYs the
     row on commit, the way Supabase Realtime reads it from the WAL. */
  async function enableRealtime(onEvent) {
    await raw(`
      create or replace function public._rt() returns trigger language plpgsql as $$
      begin
        perform pg_notify('rt', json_build_object(
          'table', tg_table_name, 'type', tg_op,
          'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
          'old', case when tg_op = 'DELETE' then jsonb_build_object('id', old.id) else null end
        )::text);
        return null;
      end $$;
      do $$ declare t text; begin
        for t in select tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
          execute format('create trigger _rt after insert or update or delete on public.%I
                          for each row execute function public._rt()', t);
        end loop;
      end $$;`);
    const listener = new pgPkg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'postgres' });
    await listener.connect();
    await listener.query('listen rt');
    listener.on('notification', (n) => { try { onEvent(JSON.parse(n.payload)); } catch (e) { console.error(e); } });
    return listener;
  }

  async function stop(extra = []) {
    for (const c of extra) { try { await c.end(); } catch (e) {} }
    try { await db.end(); } catch (e) {}
    try { await pg.stop(); } catch (e) {}
    try { rmSync(base, { recursive: true, force: true }); } catch (e) {}
  }

  return { db, port, as, raw, locked, setup, enableRealtime, stop };
}
