/* ============================================================
   Ideology — build

   Two pages come out of one source tree:

     dist/index.html    the studio
     dist/cliente.html  the client link

   Each inlines only the files its own entry point references, so
   the separation is not a convention — it is enforced by the
   build. If the client page ever loads an editor module, it will
   be visible right here in the output list.

   Usage: node build.mjs
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

/* Modules the client link must never contain: they carry the
   studio's editing, its planning tools and every client's data. */
const STUDIO_ONLY = [
  '02-store.js', '03-seed.js', '04-grid.js', '05-feed.js', '06-stories.js',
  '07-ugc.js', '08-calendar.js', '09-preview.js', '11-home.js', '12-clients.js',
  '15-sync.js', '16-session.js', '20-app.js', 'app.css', 'supabase-2.117.2.js'
];

/* Content-Security-Policy, written into each page. Every script is
   inlined by this build, so instead of allowing inline script in
   general the policy lists the SHA-256 of exactly the scripts it
   produced: anything injected later does not match and does not run.
   The network is limited to the page itself and Supabase. */
function supabaseOrigin() {
  const m = /supabaseUrl:\s*'([^']*)'/.exec(read('src/js/00-config.js'));
  try { return m && m[1] ? new URL(m[1]).origin : ''; } catch { return ''; }
}

function csp(hashes) {
  const sb = supabaseOrigin();
  const https = sb ? `${sb} https://*.supabase.co` : 'https://*.supabase.co';
  const wss = (sb ? sb.replace(/^https:/, 'wss:') + ' ' : '') + 'wss://*.supabase.co';
  return [
    "default-src 'self'",
    `script-src ${hashes.map((h) => `'sha256-${h}'`).join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self' ${https} ${wss}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; ');
}

function bundle(entry, out) {
  let html = read(entry);
  const inlined = [];

  html = html.replace(/[ \t]*<link rel="stylesheet" href="(src\/[^"]+)">\n?/g, (_, src) => {
    inlined.push(src);
    return `<style>\n/* ${src} */\n${read(src).trim()}\n</style>\n`;
  });

  html = html.replace(/[ \t]*<script src="(src\/[^"]+)"><\/script>\n?/g, (_, src) => {
    inlined.push(src);
    return `<script>\n/* ${src} */\n${read(src).trim()}\n</script>\n`;
  });

  const left = html.match(/(src|href)="src\//);
  if (left) throw new Error(`${entry}: un riferimento locale non è stato incorporato (${left[0]})`);

  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => createHash('sha256').update(m[1], 'utf8').digest('base64'));
  html = html.replace('<meta charset="utf-8">',
    `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp(hashes)}">`);

  if (out === 'dist/cliente.html') {
    const leak = inlined.filter((f) => STUDIO_ONLY.some((s) => f.endsWith(s)));
    if (leak.length) {
      throw new Error('La pagina cliente non deve caricare moduli dello studio: ' + leak.join(', '));
    }
  }

  mkdirSync(join(here, 'dist'), { recursive: true });
  writeFileSync(join(here, out), html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`${out} — ${kb} KB, ${inlined.length} file incorporati:`);
  inlined.forEach((f) => console.log('  ·', f));
}

bundle('index.html', 'dist/index.html');
console.log('');
bundle('cliente.html', 'dist/cliente.html');

/* Vercel serves dist/ as the project root, so its config travels with
   the pages: headers a <meta> tag cannot set (framing, HSTS). */
copyFileSync(join(here, 'vercel.json'), join(here, 'dist', 'vercel.json'));
console.log('\ndist/vercel.json — intestazioni di sicurezza');
