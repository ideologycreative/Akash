/* =====================================================================
   A stand-in for supabase-js, backed by the real database.

   Implements exactly the calls the studio makes — from().select /
   insert / update / delete with eq / in / order / range / single /
   maybeSingle, rpc(), storage upload and signing, realtime channels,
   and the auth calls used at sign-in — by translating each one into
   SQL run as the `authenticated` role with the user's JWT claims.

   So when the app saves, it is the migration's RLS policies, triggers
   and constraints that answer, not a mock. Rows come back through
   to_jsonb(), which is how PostgREST serialises them, so types arrive
   in the same shape a browser would see ("14:30:00", microsecond
   timestamps, jsonb with its own key order).

   Bulk inserts take their column list from the FIRST object, as
   PostgREST does, so a batch with uneven keys fails here as it would
   in production.
   ===================================================================== */

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(s) {
  if (!IDENT.test(s)) throw new Error('identifier rejected: ' + s);
  return s;
}

function pgError(e) {
  return { message: e.message, code: e.code || '', details: e.detail || null, hint: e.hint || null };
}

export function createHub() {
  const subs = new Set();
  return {
    subs,
    publish(ev) {
      for (const s of subs) s.deliver(ev);
    }
  };
}

export function makeSupabase({ dbx, hub, user, storage, network }) {
  network = network || { up: true };
  const session = () => (user.current ? { user: user.current, access_token: 'test' } : null);
  const authListeners = new Set();

  function down() {
    return network.up ? null : { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
  }
  /* optional latency, to widen race windows on purpose */
  const lag = () => (network.delay ? new Promise((r) => setTimeout(r, network.delay)) : Promise.resolve());

  class Query {
    constructor(table) {
      this.table = ident(table);
      this.op = 'select'; this.cols = '*'; this.filters = []; this.orders = [];
      this.rangeV = null; this.mode = null; this.returning = false; this.payload = null;
    }
    select(cols) {
      if (this.op === 'select') this.cols = cols || '*';
      else { this.returning = true; this.retCols = cols || '*'; }
      return this;
    }
    insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch) { this.op = 'update'; this.payload = patch; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push([ident(c), 'eq', v]); return this; }
    in(c, v) { this.filters.push([ident(c), 'in', v]); return this; }
    order(c, o) { this.orders.push([ident(c), o && o.ascending === false ? 'desc' : 'asc']); return this; }
    range(a, b) { this.rangeV = [a, b]; return this; }
    single() { this.mode = 'one'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(ok, ko) { return this.run().then(ok, ko); }

    where(params) {
      if (!this.filters.length) return '';
      return ' where ' + this.filters.map(([c, op, v]) => {
        params.push(v);
        return op === 'eq' ? `t.${c} = $${params.length}` : `t.${c} = any($${params.length})`;
      }).join(' and ');
    }

    projection(cols) {
      if (!cols || cols.trim() === '*') return 'to_jsonb(t)';
      const parts = cols.split(',').map((s) => s.trim()).filter(Boolean);
      const pairs = parts.map((p) => {
        const emb = /^([a-z_]+)\(([a-z_, ]+)\)$/.exec(p);
        if (emb) {
          const rel = ident(emb[1]);
          const inner = emb[2].split(',').map((s) => ident(s.trim()));
          /* the only embed the app uses: workspace_members → workspaces */
          return `'${rel}', (select jsonb_build_object(${inner.map((c) => `'${c}', r.${c}`).join(', ')})
                   from public.${rel} r where r.id = t.workspace_id)`;
        }
        return `'${ident(p)}', t.${ident(p)}`;
      });
      return `jsonb_build_object(${pairs.join(', ')})`;
    }

    async run() {
      await lag();
      const off = down(); if (off) return off;
      const uid = user.current && user.current.id;
      try {
        const rows = await dbx.as('authenticated', uid, async (q) => {
          const params = [];
          let sql;
          if (this.op === 'select') {
            sql = `select ${this.projection(this.cols)} as r from public.${this.table} t${this.where(params)}`;
            if (this.orders.length) sql += ' order by ' + this.orders.map(([c, d]) => `t.${c} ${d}`).join(', ');
            if (this.rangeV) sql += ` offset ${this.rangeV[0] | 0} limit ${(this.rangeV[1] - this.rangeV[0] + 1) | 0}`;
          } else if (this.op === 'insert') {
            const keys = Object.keys(this.payload[0] || {}).map(ident);
            params.push(JSON.stringify(this.payload));
            sql = `insert into public.${this.table} as t (${keys.join(', ')})
                   select ${keys.join(', ')} from jsonb_populate_recordset(null::public.${this.table}, $1)
                   returning ${this.projection(this.retCols)} as r`;
          } else if (this.op === 'update') {
            const keys = Object.keys(this.payload).map(ident);
            params.push(JSON.stringify(this.payload));
            sql = `update public.${this.table} t set ${keys.map((k) => `${k} = x.${k}`).join(', ')}
                   from jsonb_populate_record(null::public.${this.table}, $1) x` +
                  this.where(params).replace(' where ', ' where ') +
                  ` returning ${this.projection(this.retCols)} as r`;
          } else {
            sql = `delete from public.${this.table} t${this.where(params)} returning to_jsonb(t) as r`;
          }
          return (await q(sql, params)).rows.map((x) => x.r);
        }, this.op !== 'select');

        const data = (this.op === 'select' || this.returning) ? rows : null;
        if (this.mode === 'one') {
          if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
          return { data: rows[0], error: null };
        }
        if (this.mode === 'maybe') {
          if (rows.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } };
          return { data: rows[0] || null, error: null };
        }
        return { data, error: null };
      } catch (e) {
        return { data: null, error: pgError(e) };
      }
    }
  }

  const client = {
    from: (t) => new Query(t),

    async rpc(fn, args = {}) {
      await lag();
      const off = down(); if (off) return off;
      const keys = Object.keys(args).map(ident);
      /* PostgREST answers a set-returning function with an array of
         objects and a scalar one with the bare value. */
      try {
        const data = await dbx.as('authenticated', user.current && user.current.id, async (q) => {
          const set = (await q(`select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn])).rows[0];
          const rows = (await q(`select to_jsonb(x) as r from public.${ident(fn)}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) x`,
            keys.map((k) => args[k]))).rows.map((r) => r.r);
          return set && set.proretset ? rows : rows[0];
        }, true);
        return { data, error: null };
      } catch (e) { return { data: null, error: pgError(e) }; }
    },

    storage: {
      from(bucket) {
        return {
          /* The object row is written as the user, so storage RLS
             decides whether the path is allowed — as it does in
             Supabase Storage. */
          async upload(path, blob, opts) {
            const off = down(); if (off) return off;
            try {
              await dbx.as('authenticated', user.current && user.current.id, (q) =>
                q('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)',
                  [bucket, path, user.current.id, JSON.stringify({ mimetype: opts && opts.contentType, size: blob.size })]), true);
              storage.files.set(path, { type: opts && opts.contentType, size: blob.size });
              return { data: { path }, error: null };
            } catch (e) { return { data: null, error: pgError(e) }; }
          },
          async createSignedUrls(paths, ttl) {
            const off = down(); if (off) return off;
            const visible = await dbx.as('authenticated', user.current && user.current.id, async (q) =>
              new Set((await q('select name from storage.objects where bucket_id = $1 and name = any($2)', [bucket, paths])).rows.map((r) => r.name)));
            return {
              data: paths.map((p) => visible.has(p)
                ? { path: p, signedUrl: `https://storage.test/${p}?ttl=${ttl}`, error: null }
                : { path: p, signedUrl: null, error: 'Object not found' }),
              error: null
            };
          }
        };
      }
    },

    channel(name) {
      const handlers = [];
      const ch = {
        name,
        on(type, filter, cb) { handlers.push({ filter, cb }); return ch; },
        subscribe(cb) {
          hub.subs.add(ch);
          if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
          return ch;
        },
        deliver(ev) {
          for (const h of handlers) {
            const f = h.filter;
            if (f.table && f.table !== ev.table) continue;
            if (f.event && f.event !== '*' && f.event !== ev.type) continue;
            const row = ev.new || ev.old || {};
            const m = /^([a-z_]+)=eq\.(.+)$/.exec(f.filter || '');
            /* Supabase cannot filter DELETE events (they carry only the
               key), so every subscriber of the table gets them — the app
               must ignore ids it does not know. Reproduced here. */
            if (m && ev.type !== 'DELETE' && String(row[m[1]]) !== m[2]) continue;
            setTimeout(() => h.cb({ eventType: ev.type, table: ev.table, schema: 'public', new: ev.new || {}, old: ev.old || {} }), 0);
          }
        }
      };
      return ch;
    },
    removeChannel(ch) { hub.subs.delete(ch); },

    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      onAuthStateChange(cb) {
        authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
      },
      async signInWithPassword({ email, password }) {
        const u = (user.accounts || []).find((a) => a.email === email && a.password === password);
        if (!u) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        user.current = { id: u.id, email: u.email };
        authListeners.forEach((cb) => cb('SIGNED_IN', session()));
        return { data: { user: user.current, session: session() }, error: null };
      },
      async signOut() {
        user.current = null;
        authListeners.forEach((cb) => cb('SIGNED_OUT', null));
        return { error: null };
      },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser() { return { data: { user: user.current }, error: null }; }
    }
  };
  return client;
}
