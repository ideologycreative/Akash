/* ============================================================
   Ideology — demo document generator

   The client link reads a document the studio wrote. Opened on
   its own — a fresh browser, a standalone demo, a host that
   serves the two pages from different origins — there is no
   document to read, and the page would have nothing to show but
   an error.

   So the build bakes one in. This script runs the studio, seeds
   the example studio, and writes the result out as a file the
   client bundle carries as a fallback. It is used only when
   there is no real document present, and the page says so.

   Run it when the seed changes:  node make-demo.mjs
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => console.log('ERRORE PAGINA:', e.message));

const dom = new JSDOM(readFileSync('dist/index.html', 'utf8'), {
  runScripts: 'dangerously', url: 'https://demo.test/', virtualConsole: vc
});

await new Promise((r) => setTimeout(r, 1200));

const A = dom.window.IDE;
if (!A) throw new Error('lo studio non si è avviato');

A.resetAll();

/* A demo is more useful mid-flow than pristine: send the drafts
   for approval so whoever opens the client link has something to
   actually do. */
A.S.clients.forEach((cl) => {
  (cl.accounts || []).forEach((acc) => {
    A.postsIn(acc.id, A.thisMonth()).forEach((p) => {
      if (p.status === 'bozza') A.setStatus(p.id, 'da_approvare', 'studio', '');
    });
  });
});
A.save({ quiet: true });

const doc = dom.window.localStorage.getItem('ideology.content.v1');
if (!doc) throw new Error('nessun documento prodotto');

const parsed = JSON.parse(doc);
mkdirSync('src/data', { recursive: true });
writeFileSync(
  'src/data/demo.js',
  '/* Generato da make-demo.mjs — non modificare a mano.\n' +
  '   Documento di esempio usato dalla pagina cliente solo quando\n' +
  '   non ne esiste uno vero in questo browser. */\n' +
  'window.__IDEOLOGY_DEMO__ = ' + JSON.stringify(parsed) + ';\n',
  'utf8'
);

const tokens = parsed.clients.map((c) => c.name + ' → ' + c.shareToken);
console.log('src/data/demo.js scritto —',
  parsed.clients.length, 'clienti,',
  parsed.posts.length, 'contenuti,',
  (JSON.stringify(parsed).length / 1024).toFixed(0) + ' KB');
tokens.forEach((t) => console.log('  ·', t));
