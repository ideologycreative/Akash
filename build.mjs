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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

/* Modules the client link must never contain: they carry the
   studio's editing, its planning tools and every client's data. */
const STUDIO_ONLY = [
  '02-store.js', '03-seed.js', '04-grid.js', '05-feed.js', '06-stories.js',
  '07-ugc.js', '08-calendar.js', '09-preview.js', '11-home.js', '12-clients.js',
  '20-app.js', 'app.css'
];

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
