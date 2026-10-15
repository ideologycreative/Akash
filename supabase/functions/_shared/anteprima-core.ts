/* =====================================================================
   The client link's HTTP surface — runtime-independent core.

   Deno runs it inside the `anteprima` Edge Function; Node runs it in
   functions.test.mjs. Everything that touches the network is passed
   in as `deps`, so the rules here are tested without a server.

     POST /anteprima  {op: 'read', token}     → what this client may see
     POST /anteprima  {op: 'review', token, postId, action, note}
                                              → approve / ask for a change / take back

   Both are POST so the token travels in the body: a query string ends
   up in access logs, a body does not. (The client page itself keeps the
   token in the URL fragment — #c=… — which browsers never send.)

   The rules themselves live in Postgres (client_preview,
   client_review). This layer validates input before anything reaches
   the database, turns storage paths into short-lived signed URLs,
   and maps internal error codes onto answers that reveal nothing.
   ===================================================================== */

export const SIGNED_URL_TTL = 60 * 60;              // seconds; the page refreshes before this
export const MAX_BODY_BYTES = 16 * 1024;

const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['approva', 'revisione', 'annulla'];

export type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type SignResult = {
  data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null;
  error: { message?: string } | null;
};
export type Deps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  sign: (paths: string[], ttl: number) => Promise<SignResult>;
  log?: (...args: unknown[]) => void;
};

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400'
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

/* Database error codes → what the client page is told. Unknown token,
   unknown post, someone else's post and a draft all produce the same
   404, so the endpoint cannot be used to discover what exists. */
const KNOWN: Record<string, [number, string]> = {
  invalid_token:      [404, 'Link non valido o scaduto'],
  not_found:          [404, 'Contenuto non disponibile'],
  note_required:      [400, 'Serve un messaggio'],
  invalid_transition: [409, 'Questo contenuto non si può più modificare da qui'],
  invalid_action:     [400, 'Azione non riconosciuta']
};

function fromDbError(err: { message?: string } | null, log?: Deps['log']): Response {
  const key = (err && err.message || '').trim();
  const hit = KNOWN[key];
  if (hit) return reply(hit[0], { ok: false, error: hit[1], code: key });
  if (log) log('[anteprima] unexpected database error', err);
  return reply(500, { ok: false, error: 'Errore del server, riprova tra poco' });
}

/* A storage path is a reference without a scheme. Links pasted by the
   studio (https://…) are passed through untouched. */
export function isStoragePath(ref: unknown): ref is string {
  return typeof ref === 'string' && ref !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

type Preview = {
  client: Record<string, unknown>;
  accounts: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown> & { slides?: Array<Record<string, unknown>> }>;
};

export function collectPaths(p: Preview): string[] {
  const set = new Set<string>();
  const add = (v: unknown) => { if (isStoragePath(v)) set.add(v); };
  for (const a of p.accounts || []) add(a.avatar);
  for (const post of p.posts || []) {
    add(post.media); add(post.cover);
    for (const s of post.slides || []) add(s.url);
  }
  return [...set];
}

/* Rename to the client page's contract (mediaUrl, coverUrl, avatarUrl)
   and swap every storage path for its signed URL. A path that could not
   be signed becomes '' — the page shows a placeholder, never a raw path. */
export function resolveMedia(p: Preview, signed: Map<string, string>): Preview {
  const url = (v: unknown) => (isStoragePath(v) ? signed.get(v) || '' : typeof v === 'string' ? v : '');
  return {
    client: p.client,
    accounts: (p.accounts || []).map(({ avatar, ...a }) => ({ ...a, avatarUrl: url(avatar) })),
    posts: (p.posts || []).map(({ media, cover, slides, ...post }) => ({
      ...post,
      mediaUrl: url(media),
      coverUrl: url(cover),
      slides: (slides || []).map((s) => ({ id: s.id, url: url(s.url) }))
    }))
  };
}

async function read(token: string, deps: Deps): Promise<Response> {
  if (!TOKEN_RE.test(token)) return reply(404, { ok: false, error: KNOWN.invalid_token[1], code: 'invalid_token' });

  const { data, error } = await deps.rpc('client_preview', { p_token: token });
  if (error) return fromDbError(error, deps.log);

  const preview = data as Preview;
  const paths = collectPaths(preview);
  const signed = new Map<string, string>();
  if (paths.length) {
    const res = await deps.sign(paths, SIGNED_URL_TTL);
    if (res.error && deps.log) deps.log('[anteprima] signing failed', res.error);
    for (const row of res.data || []) {
      if (row.path && row.signedUrl && !row.error) signed.set(row.path, row.signedUrl);
    }
  }
  return reply(200, { ok: true, expiresIn: SIGNED_URL_TTL, ...resolveMedia(preview, signed) });
}

async function post(req: Request, deps: Deps): Promise<Response> {
  const type = req.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(type)) return reply(415, { ok: false, error: 'Formato non supportato' });

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'Richiesta troppo grande' });

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'Richiesta non valida' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { ok: false, error: 'Richiesta non valida' });

  const token = typeof body.token === 'string' ? body.token : '';
  const op = body.op === undefined ? (body.action !== undefined ? 'review' : 'read') : body.op;
  if (op === 'read') return read(token, deps);
  if (op !== 'review') return reply(400, { ok: false, error: 'Richiesta non valida' });

  const postId = typeof body.postId === 'string' ? body.postId : '';
  const action = typeof body.action === 'string' ? body.action : '';
  const note = typeof body.note === 'string' ? body.note : '';

  if (!TOKEN_RE.test(token)) return reply(404, { ok: false, error: KNOWN.invalid_token[1], code: 'invalid_token' });
  if (!UUID_RE.test(postId)) return reply(404, { ok: false, error: KNOWN.not_found[1], code: 'not_found' });
  if (ACTIONS.indexOf(action) < 0) return reply(400, { ok: false, error: KNOWN.invalid_action[1], code: 'invalid_action' });
  if (action === 'revisione' && !note.trim()) return reply(400, { ok: false, error: KNOWN.note_required[1], code: 'note_required' });
  if (note.length > 4000) return reply(400, { ok: false, error: 'Messaggio troppo lungo' });

  const { data, error } = await deps.rpc('client_review', {
    p_token: token, p_post_id: postId, p_action: action, p_note: note
  });
  if (error) return fromDbError(error, deps.log);
  return reply(200, { ok: true, ...(data as Record<string, unknown>) });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method === 'POST') return await post(req, deps);
    return reply(405, { ok: false, error: 'Metodo non consentito' });
  } catch (e) {
    if (deps.log) deps.log('[anteprima] unhandled', e);
    return reply(500, { ok: false, error: 'Errore del server, riprova tra poco' });
  }
}
