/* The client link's endpoint. A thin shell: credentials and network
   here, every rule in ../_shared/anteprima-core.ts and in Postgres.

   Deployed with JWT verification off (see config.toml): clients are
   not users and have no session. The share token in the request is
   their only credential, and the database checks it.

   The service-role key never leaves this function. It is injected by
   Supabase as an environment variable and is never sent to a browser. */

import { createClient } from '@supabase/supabase-js';
import { handle } from '../_shared/anteprima-core.ts';

const url = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

Deno.serve((req) =>
  handle(req, {
    rpc: async (fn, args) => {
      const { data, error } = await admin.rpc(fn, args);
      return { data, error };
    },
    sign: (paths, ttl) => admin.storage.from('media').createSignedUrls(paths, ttl),
    log: (...args) => console.error(...args)
  })
);
