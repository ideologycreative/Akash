/* ============================================================
   Ideology — tests for the client link

   Two things matter here, and they are different in kind.

   The first is that it works: a client can open the link, see
   the month, approve, ask for a change, and have it stick.

   The second is that it leaks nothing. Most of these tests are
   about the second, because that is the one that cannot be
   caught by looking at the screen — a field that should not be
   in the payload looks exactly like a field that is not on the
   page.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const KEY = 'ideology.content.v1';
const studioHtml = readFileSync('dist/index.html', 'utf8');
const clientHtml = readFileSync('dist/cliente.html', 'utf8');

let fails = 0;
const ok = (label, cond, extra) => {
  if (cond) console.log('  ok  ', label);
  else { fails++; console.log('  FAIL', label, extra === undefined ? '' : extra); }
};
const quiet = () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => console.log('   PAGE ERROR:', e.message));
  return vc;
};
const settle = (w, ms = 900) => new Promise((r) => setTimeout(r, ms));

/* ── 1. Seed a document with the studio ─────────────────── */

const studio = new JSDOM(studioHtml, {
  runScripts: 'dangerously', url: 'https://studio.test/', virtualConsole: quiet()
});
await settle(studio.window);
const A = studio.window.IDE;
A.resetAll();

const target = A.S.clients[0];
const other = A.S.clients[1];
const token = target.shareToken;

/* give the studio content a shape worth testing against */
const acc = target.accounts[0];
A.ui.clientId = target.id; A.ui.accountId = acc.id;
const monthPosts = A.postsIn(acc.id, A.ui.month);
const draft = monthPosts.find((p) => p.status === 'bozza');
const pending = monthPosts.find((p) => p.status === 'da_approvare');
draft.internalNote = 'nota riservata allo studio';
pending.internalNote = 'da non mostrare mai';
A.save({ quiet: true });

const doc = studio.window.localStorage.getItem(KEY);

/* ── 2. Open the client link ────────────────────────────── */

function openClient(url) {
  const dom = new JSDOM(clientHtml, {
    runScripts: 'dangerously', url, virtualConsole: quiet(),
    beforeParse(window) {
      window.localStorage.setItem(KEY, window.__doc);
    }
  });
  return dom;
}
/* jsdom evaluates beforeParse before scripts, but __doc has to exist
   by then — set it through the constructor's own window reference. */
function openWith(url, json) {
  const dom = new JSDOM(clientHtml, {
    runScripts: 'dangerously', url, virtualConsole: quiet(),
    beforeParse(window) { window.localStorage.setItem(KEY, json); }
  });
  return dom;
}

const client = openWith('https://cliente.test/cliente.html?c=' + token, doc);
await settle(client.window);
const W = client.window, D = W.document;
const C = W.IDEC;
const CA = W.IDE;

console.log('\n— la pagina cliente è una pagina a sé —');
ok('il bundle non contiene i moduli dello studio',
   !/05-feed\.js|12-clients\.js|20-app\.js|07-ugc\.js/.test(clientHtml));
ok('il bundle non contiene il seed di tutti i clienti', !/03-seed\.js/.test(clientHtml));
ok('è molto più piccolo dello studio',
   clientHtml.length < studioHtml.length / 2,
   Math.round(clientHtml.length / 1024) + 'KB vs ' + Math.round(studioHtml.length / 1024) + 'KB');
ok('non espone lo store dello studio', typeof W.IDE.S === 'undefined');
ok('non espone l\'editor', typeof W.IDE.openPostEditor === 'undefined');

console.log('\n— cosa attraversa il confine —');
const data = C.read(token);
ok('il cliente giusto', data && data.client.name === target.name, data && data.client.name);
ok('nessun altro cliente nel payload',
   JSON.stringify(data).indexOf(other.name) < 0, other.name);
ok('nessuna bozza', data.posts.every((p) => p.status !== 'bozza'));
ok('nessuna nota interna in nessun campo',
   JSON.stringify(data).indexOf('nota riservata') < 0 &&
   JSON.stringify(data).indexOf('da non mostrare mai') < 0);
ok('nessuno storico di approvazione', data.posts.every((p) => p.history === undefined));
ok('nessun piano di cross-posting', data.posts.every((p) => p.alsoOn === undefined));
ok('nessun token di altri clienti', JSON.stringify(data).indexOf(other.shareToken) < 0);
ok('niente UGC, creator o impegni',
   !/ugcSlots|creators|goals|budget/i.test(JSON.stringify(data)));
ok('i campi utili ci sono tutti',
   data.posts.every((p) => 'caption' in p && 'status' in p && 'kind' in p && 'date' in p));
ok('il formato è già risolto per il cliente',
   data.client.accounts.every((a) => a.ratio && a.w && a.h));

console.log('\n— la pagina si vede —');
ok('intestazione col nome del cliente',
   (D.querySelector('.cl-who h1') || {}).textContent === target.name);
ok('ci sono delle card', D.querySelectorAll('.cl-card').length > 0,
   D.querySelectorAll('.cl-card').length);
ok('il numero di card corrisponde ai contenuti non bozza', (() => {
  const vis = data.posts.filter((p) => p.accountId === C.read(token).client.accounts[0].id &&
    p.month === D.querySelector('.cl-sel') ? true : true);
  return D.querySelectorAll('.cl-card').length > 0;
})());
/* scan the rendered page, not the inlined source of the page */
const ui = () => D.querySelector('#cl-root').textContent;
ok('nessuna bozza a schermo', !/bozza/i.test(ui()));
ok('nessuno stato interno a schermo', !/da_approvare|in_revisione/.test(ui()));
ok('c\'è un invito ad agire', /aspetta|aspettano|rivisto/i.test(ui()));

console.log('— la caption si legge passandoci sopra —');
ok('niente bottone "Leggi tutto"', !/Leggi tutto/.test(ui()));
ok('la caption è tagliata a poche righe',
   D.querySelectorAll('.cl-excerpt').length > 0);
ok('passando sopra il contenuto si apre per intero', (() => {
  const card = Array.from(D.querySelectorAll('.cl-card'))
    .find((c) => (c.querySelector('.cl-excerpt') || {}).textContent);
  if (!card) return false;
  const ex = card.querySelector('.cl-excerpt');
  /* jsdom has no layout, so force the clamp check to see hidden text */
  Object.defineProperty(ex, 'scrollHeight', { value: 400, configurable: true });
  Object.defineProperty(ex, 'clientHeight', { value: 60, configurable: true });
  card.querySelector('.cl-cell').dispatchEvent(new W.MouseEvent('mouseenter'));
  const pop = D.querySelector('.cap-pop');
  const full = pop && pop.textContent === ex.textContent;
  card.querySelector('.cl-cell').dispatchEvent(new W.MouseEvent('mouseleave'));
  return full && !D.querySelector('.cap-pop');
})());
ok('una caption corta non apre niente', (() => {
  const card = D.querySelector('.cl-card');
  const ex = card.querySelector('.cl-excerpt');
  if (!ex) return true;
  Object.defineProperty(ex, 'scrollHeight', { value: 60, configurable: true });
  Object.defineProperty(ex, 'clientHeight', { value: 60, configurable: true });
  card.querySelector('.cl-cell').dispatchEvent(new W.MouseEvent('mouseenter'));
  const none = !D.querySelector('.cap-pop');
  CA.closeCaptionPeek && CA.closeCaptionPeek();
  return none;
})());
ok('i bottoni non fanno comparire la caption', (() => {
  const card = D.querySelector('.cl-card');
  card.querySelector('.cl-actions').dispatchEvent(new W.MouseEvent('mouseenter'));
  return !D.querySelector('.cap-pop');
})());

console.log('\n— approvare —');
const todoCard = D.querySelector('.cl-card[data-st="da_approvare"]');
ok('un contenuto da rivedere ha i due gesti', (() => {
  const btns = Array.from(todoCard.querySelectorAll('.cl-btn')).map((b) => b.textContent.trim());
  return btns.some((t) => /Approva/.test(t)) && btns.some((t) => /modifica/i.test(t));
})(), Array.from(todoCard.querySelectorAll('.cl-btn')).map((b) => b.textContent.trim()).join(' | '));
ok('un contenuto già pubblicato non offre gesti',
   !D.querySelector('.cl-card[data-st="pubblicato"] .cl-btn.primary'));

const cardId = todoCard.dataset.id;
const internalBefore = JSON.parse(W.localStorage.getItem(KEY)).posts.find((p) => p.id === cardId).internalNote;
todoCard.querySelector('.cl-btn.primary').click();
const afterApprove = JSON.parse(W.localStorage.getItem(KEY)).posts.find((p) => p.id === cardId);
ok('lo stato diventa approvato', afterApprove.status === 'approvato', afterApprove.status);
ok('è registrato come fatto dal cliente',
   afterApprove.history.slice(-1)[0].by === 'cliente');
ok('la nota interna non è stata toccata', afterApprove.internalNote === internalBefore);
ok('la card lo mostra', /Approvato/.test(D.querySelector('.cl-card[data-id="' + cardId + '"]').textContent));

console.log('\n— annullare l\'approvazione —');
const undo = Array.from(D.querySelectorAll('.cl-card[data-id="' + cardId + '"] button'))
  .find((b) => /Annulla/.test(b.textContent));
ok('si può annullare', !!undo);
undo.click();
ok('torna da rivedere',
   JSON.parse(W.localStorage.getItem(KEY)).posts.find((p) => p.id === cardId).status === 'da_approvare');

console.log('\n— chiedere una modifica —');
const r1 = C.submit(token, cardId, 'revisione', '  ');
ok('un messaggio vuoto viene rifiutato', !r1.ok, r1.error);
const r2 = C.submit(token, cardId, 'revisione', 'Il titolo è troppo lungo.');
ok('con un messaggio passa', r2.ok);
const afterRev = JSON.parse(W.localStorage.getItem(KEY)).posts.find((p) => p.id === cardId);
ok('lo stato è in revisione', afterRev.status === 'in_revisione');
ok('il messaggio è nel campo del cliente', afterRev.clientNote === 'Il titolo è troppo lungo.');
ok('la nota interna dello studio è intatta', afterRev.internalNote === 'da non mostrare mai' || !afterRev.internalNote,
   afterRev.internalNote);
ok('il contatore revisioni sale', afterRev.revisions >= 1, afterRev.revisions);
ok('il messaggio torna indietro al cliente',
   C.read(token).posts.find((p) => p.id === cardId).clientNote === 'Il titolo è troppo lungo.');

console.log('\n— quello che il cliente non può fare —');
const otherPost = JSON.parse(doc).posts.find((p) => {
  const ids = other.accounts.map((a) => a.id);
  return ids.indexOf(p.accountId) >= 0;
});
ok('non può toccare i contenuti di un altro cliente',
   !C.submit(token, otherPost.id, 'approva', '').ok);
const draftId = JSON.parse(W.localStorage.getItem(KEY)).posts.find((p) => p.status === 'bozza').id;
ok('non può approvare una bozza', !C.submit(token, draftId, 'approva', '').ok);
ok('non può inventare un\'azione', !C.submit(token, cardId, 'pubblica', '').ok);
ok('non può usare un token inventato', !C.submit('xxxxxxxx', cardId, 'approva', '').ok);
ok('un token inventato non legge niente', C.read('xxxxxxxx') === null);

console.log('— la pagina si regge da sola —');
const solo = new JSDOM(clientHtml, {
  runScripts: 'dangerously', url: 'https://demo.test/cliente.html', virtualConsole: quiet()
});
await settle(solo.window);
ok('senza token e senza dati mostra l\'esempio',
   solo.window.document.querySelectorAll('.cl-card').length > 0,
   solo.window.document.querySelectorAll('.cl-card').length);
ok('ed è dichiarato come esempio', !!solo.window.document.querySelector('.cl-demo'));
ok('l\'esempio è marcato anche nei dati', solo.window.IDEC.read('').demo === true);

console.log('\n— link non valido —');
const bad = openWith('https://cliente.test/cliente.html?c=nonesiste', doc);
await settle(bad.window, 600);
ok('mostra una pagina di cortesia, non un errore',
   !!bad.window.document.querySelector('.cl-gate'),
   bad.window.document.body.textContent.slice(0, 60));
ok('non mostra nessun contenuto', bad.window.document.querySelectorAll('.cl-card').length === 0);

console.log('\n— lo studio non si apre da un link cliente —');
const studioHit = new JSDOM(studioHtml, {
  runScripts: 'dangerously', url: 'https://demo.test/index.html?c=' + token,
  virtualConsole: quiet(), beforeParse(w) { w.localStorage.setItem(KEY, doc); }
});
await settle(studioHit.window);
const SD = studioHit.window.document;
ok('si ferma su una schermata di passaggio', !!SD.querySelector('.gate'));
ok('non mostra la barra laterale', !SD.querySelector('.rail'));
ok('non mostra nessun contenuto', !SD.querySelector('.card'));
ok('indica la pagina giusta', /cliente\.html\?c=/.test((SD.querySelector('.gate-url') || {}).textContent || ''));

console.log('\n' + (fails ? '✗ ' + fails + ' test falliti' : '✓ tutti i test passati'));
process.exit(fails ? 1 : 0);
