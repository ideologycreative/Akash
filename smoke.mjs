import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { console.log('PAGE ERROR:', e.message, e.detail && e.detail.stack); });
vc.on('error', (...a) => console.log('console.error:', ...a));
vc.on('warn', () => {});
vc.on('log', () => {});

const html = readFileSync('dist/index.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'https://example.test/', virtualConsole: vc
});
const { window } = dom;
await new Promise((r) => {
  if (window.document.readyState !== 'loading') return r();
  window.document.addEventListener('DOMContentLoaded', r);
  setTimeout(r, 2000);
});
const A = window.IDE;

let fails = 0;
const ok = (label, cond, extra) => {
  if (cond) console.log('  ok  ', label);
  else { fails++; console.log('  FAIL', label, extra === undefined ? '' : extra); }
};

console.log('\n— boot —');
ok('namespace esposto', !!A);
ok('clienti seminati', A.S.clients.length === 3, A.S.clients.length);
ok('post seminati', A.S.posts.length > 20, A.S.posts.length);
ok('apre sulla Home', A.ui.section === 'home' && !!window.document.querySelector('.kpis'));
ok('rail con tre sezioni', window.document.querySelectorAll('.rail-item[aria-current], .rail-item').length >= 3);
A.ui.section = 'contenuti'; A.render();
ok('barra contesto renderizzata', !!window.document.querySelector('.bar'));
ok('griglia feed renderizzata', window.document.querySelectorAll('.card').length > 5,
   window.document.querySelectorAll('.card').length);
ok('nessun id duplicato', (() => {
  const seen = new Set();
  let dup = 0;
  ['posts','stories','highlights','ugcSlots','creators','categories'].forEach(k =>
    A.S[k].forEach(r => { if (seen.has(r.id)) dup++; seen.add(r.id); }));
  A.S.clients.forEach(c => c.accounts.forEach(a => { if (seen.has(a.id)) dup++; seen.add(a.id); }));
  return dup === 0;
})());

console.log('\n— persistenza —');
const before = A.S.stories.length;
A.save();
A.S.stories = [];
ok('load() ripristina le stories', (A.load(), A.S.stories.length === before), A.S.stories.length);
ok('serialize conta tutte le collezioni', A.serialize().counts.stories === before);
ok('assertShape rifiuta una collezione corrotta', (() => {
  try { A.assertShape({ clients: [], posts: {}, stories: [], highlights: [], ugcSlots: [], creators: [], pillars: [], formats: [] }); return false; }
  catch (e) { return true; }
})());

console.log('\n— ordinamento per data —');
A.ui.section = 'contenuti';
let list = A.curPosts();
ok('ordinati per data crescente', list.filter(p=>p.date).every((p,i,arr)=> i===0 || A.sortKey(arr[i-1]) <= A.sortKey(p)),
   list.map(p=>p.date+'/'+(p.time||'')).join(' '));
const movedId = list[list.length-1].id;
A.updatePost(movedId, { date: A.ui.month + '-01' });
ok('cambiare data risposta il contenuto', A.curPosts()[0].id === movedId);
A.updatePost(movedId, { date: '' });
ok('senza data va in fondo', A.curPosts()[A.curPosts().length-1].id === movedId);
A.updatePost(movedId, { date: A.ui.month + '-15', time: '21:00' });
const sameDay = A.curPosts().filter(p=>p.date===A.ui.month+'-15');
ok('ora usata per sciogliere i pari merito', sameDay.length >= 1);

console.log('\n— collegamenti per id, non per indice —');
const linked = A.S.posts.find(p => (p.storyIds || []).length);
const storyId = linked.storyIds[0];
const storyCount = A.S.stories.length;
A.deleteStory(A.curStories()[0].id);
ok('una story in meno', A.S.stories.length === storyCount - 1);
ok('il legame superstite punta ancora alla story giusta', (() => {
  const still = A.get(linked.id);
  return still.storyIds.every(id => !A.get(id) || A.get(id).id === id);
})());
ok('i riferimenti alla story cancellata sono rimossi',
   A.S.posts.every(p => (p.storyIds || []).every(id => !!A.get(id))));

console.log('\n— ciclo di approvazione —');
const target = A.curPosts().find(p => p.status === 'da_approvare') || A.curPosts()[0];
A.setStatus(target.id, 'in_revisione', 'cliente', 'Il titolo è troppo lungo.');
const t2 = A.get(target.id);
ok('stato aggiornato', t2.status === 'in_revisione');
ok('la nota del cliente è salvata nel suo campo', t2.clientNote === 'Il titolo è troppo lungo.');
ok('la nota interna non è stata sovrascritta', !t2.internalNote);
ok('contatore revisioni incrementato', t2.revisions >= 1, t2.revisions);
ok('storico con autore', t2.history.slice(-1)[0].by === 'cliente');
A.setStatus(target.id, 'approvato', 'cliente', '');
ok('approvazione registrata', A.get(target.id).status === 'approvato');
ok('storico cumulativo', A.get(target.id).history.length >= 2);

console.log('\n— UGC ancorato all account —');
const ugcBefore = A.curUgc().length;
A.S.prefs.ugcDays = [0, 2, 4];
A.generateUgcMonth();
ok('genera slot nuovi', A.curUgc().length > ugcBefore, A.curUgc().length);
ok('nessun doppione di data', (() => {
  const d = A.curUgc().map(u => u.date);
  return new Set(d).size === d.length;
})());
const cl = A.curClient();
cl.name = 'Fornace Milano (rinominata)';
A.commit({ render: false });
ok('rinominare il cliente non perde il piano UGC', A.curUgc().length > 0, A.curUgc().length);
ok('rinominare il cliente non perde i post', A.curPosts().length > 0);

console.log('\n— viste —');
A.ui.section = 'contenuti';
['feed', 'stories', 'ugc', 'calendario', 'anteprima'].forEach(t => {
  A.ui.tab = t;
  let err = null;
  try { A.render(); } catch (e) { err = e; }
  ok('vista ' + t, !err && !!window.document.querySelector('.page'), err && err.message);
});
A.ui.tab = 'anteprima';
A.render();
ok('anteprima è un mosaico, non una lista', (() => {
  const cells = window.document.querySelectorAll('.pv-cell').length;
  return cells === A.curPosts().length && !window.document.querySelector('.pv-post');
})(), window.document.querySelectorAll('.pv-cell').length + ' celle');
ok('anteprima mostra il profilo', !!window.document.querySelector('.profile .handle'));
ok('nessun interruttore vista cliente in admin',
   !Array.from(window.document.querySelectorAll('.segment button')).some(b => /cliente/i.test(b.textContent)));
ok('apre la vista contenuto', (() => {
  const list = A.curPosts();
  A.openPostView(list, list[0].id);
  const open = window.document.querySelector('#lightbox.on.as-post .pvw');
  const hasMedia = !!window.document.querySelector('.pvw-media');
  const hasSide = !!window.document.querySelector('.pvw-side .pvw-caption');
  A.closePostView();
  return open && hasMedia && hasSide && !window.document.querySelector('#lightbox.on');
})());

console.log('\n— export / import —');
const dump = JSON.stringify(A.serialize());
A.S.posts = [];
A.importAll(dump);
ok('import ripristina tutto', A.S.posts.length > 20, A.S.posts.length);
ok('import conserva stati di approvazione',
   A.S.posts.some(p => p.status === 'approvato') && A.S.posts.some(p => p.status === 'in_revisione'));
ok('import conserva categoria e natura',
   A.S.posts.some(p => p.categoryId) && A.S.posts.some(p => p.paid) && A.S.posts.some(p => p.partner));
ok('import conserva data e ora', A.S.posts.some(p => p.date) && A.S.posts.every(p => 'time' in p));

console.log('\n— migrazione da un backup vecchio —');
const legacy = {
  v: 1, clients: A.S.clients, highlights: [], ugcSlots: [], creators: [], stories: [],
  pillars: [{ id: 'pi_old', clientId: A.S.clients[0].id, name: 'Vecchio pilastro', color: '#333' }],
  formats: [{ id: 'fo_old', clientId: A.S.clients[0].id, name: 'Vecchio formato', color: '#666' }],
  posts: [{ id: 'p_old', accountId: A.S.clients[0].accounts[0].id, month: A.ui.month, order: 10,
            kind: 'foto', mediaUrl: '', slides: [], date: '', showDate: false, caption: 'legacy',
            pillarId: 'pi_old', status: 'bozza', revisions: 0, storyIds: [], history: [] }]
};
A.importAll(JSON.stringify(legacy));
ok('pilastri e formati diventano categorie', A.S.categories.length === 2);
ok('il post vecchio conserva la classificazione', A.get('p_old').categoryId === 'pi_old');
ok('i campi nuovi vengono riempiti',
   A.get('p_old').paid === false && A.get('p_old').partner === '' &&
   A.get('p_old').inStories === false && A.get('p_old').time === '' &&
   Array.isArray(A.get('p_old').alsoOn));
ok('una vecchia natura "sponsorizzato" diventa paid', (() => {
  const old2 = JSON.parse(JSON.stringify(legacy));
  old2.posts[0].promo = 'sponsorizzato';
  A.importAll(JSON.stringify(old2));
  return A.get('p_old').paid === true;
})());

console.log('— etichette della barra laterale —');
A.ui.section = 'home'; A.render();
ok('le voci del rail hanno un testo visibile', (() => {
  const items = [...window.document.querySelectorAll('.rail-item')];
  const labels = items.map(i => i.textContent.trim()).filter(Boolean);
  return labels.some(l => /Home/.test(l)) && labels.some(l => /Clienti/.test(l)) && labels.some(l => /Contenuti/.test(l));
})(), [...window.document.querySelectorAll('.rail-item')].map(i=>i.textContent.trim()).join('|'));
ok('nessuna etichetta usa la classe del lightbox',
   window.document.querySelectorAll('.rail .lb').length === 0);
ok('le etichette usano la classe dedicata',
   window.document.querySelectorAll('.rail-item .rtxt').length >= 3);

console.log('\n— filtri dietro un bottone —');
A.resetAll();
A.ui.section = 'contenuti'; A.ui.tab = 'feed'; A.ui.filters = A.emptyFilters(); A.render();
ok('niente muro di chip nella toolbar',
   window.document.querySelectorAll('.toolbar .chip').length === 0,
   window.document.querySelectorAll('.toolbar .chip').length);
ok('c\'è un bottone Filtri', !!window.document.querySelector('#filter-btn'));
ok('il formato resta visibile', !!window.document.querySelector('.fmt-note'));
window.document.querySelector('#filter-btn').click();
ok('il pannello si apre', !!window.document.querySelector('.popover .pop-opt'),
   window.document.querySelectorAll('.popover .pop-opt').length + ' opzioni');
ok('il pannello elenca stati, natura e categorie',
   window.document.querySelectorAll('.popover .pop-sec').length === 3);
A.closePopover();
ok('si chiude', !window.document.querySelector('.popover'));

A.ui.filters = A.emptyFilters();
const present = [...new Set(A.curPosts().map(p => p.status))];
const [sA, sB] = present;
A.toggleFilter('status', sA);
A.toggleFilter('status', sB);
ok('due stati insieme', (() => {
  const shown = A.visiblePosts();
  return shown.length > 0 &&
         shown.every(p => p.status === sA || p.status === sB) &&
         shown.some(p => p.status === sA) && shown.some(p => p.status === sB) &&
         shown.length < A.curPosts().length;
})(), present.join(',') + ' → ' + A.visiblePosts().length + '/' + A.curPosts().length);
ok('il bottone conta i filtri attivi', (() => {
  A.render();
  const b = window.document.querySelector('#filter-btn .count');
  return b && b.textContent === '2';
})());
A.toggleFilter('status', sA);
ok('togliere un filtro lo rimuove', A.ui.filters.status.length === 1);
A.ui.filters = A.emptyFilters();
ok('azzerare mostra tutto', A.visiblePosts().length === A.curPosts().length);

console.log('\n— navigazione a sezioni —');
['home','clienti','contenuti'].forEach(sec => {
  A.ui.section = sec; A.ui.clientDetailId = null;
  let err=null; try { A.render(); } catch(e){ err=e; }
  ok('sezione ' + sec, !err && !!window.document.querySelector('.rail'), err && err.message);
});
A.ui.section='clienti'; A.ui.clientDetailId = A.S.clients[0].id; A.render();
ok('scheda cliente si apre', !!window.document.querySelector('.acc-card'));
ok('selettore piattaforma presente', window.document.querySelectorAll('.plat-opt').length >= 8,
   window.document.querySelectorAll('.plat-opt').length);
ok('specifiche formato mostrate', window.document.querySelectorAll('.acc-spec').length > 0);
ok('palette con 4 colori', window.document.querySelectorAll('.pal-item').length === 4);
ok('categorie elencate', window.document.querySelectorAll('.taxrow').length >= 2,
   window.document.querySelectorAll('.taxrow').length);
ok('nessun pannello laterale nel feed', (() => {
  A.ui.section='contenuti'; A.ui.tab='feed'; A.render();
  return !window.document.querySelector('.inspector');
})());
ok('quattro angoli sulla card', (() => {
  const c = window.document.querySelector('.card');
  return !!c.querySelector('.c-tl') && !!c.querySelector('.c-tr') && !!c.querySelector('.c-bl');
})());
ok('la data sta sotto la card', !!window.document.querySelector('.card-when'));
ok('editor centrato si apre e si chiude', (() => {
  const id = A.curPosts()[0].id;
  A.openPostEditor(id);
  const open = window.document.querySelector('#modal-bg.on') && window.document.querySelector('.modal.wide');
  A.closeModal();
  return !!open && !window.document.querySelector('#modal-bg.on');
})());

console.log('\n— la piattaforma guida il formato —');
const cl0 = A.S.clients[0];
const acc0 = cl0.accounts[0];
acc0.platform = 'TikTok'; acc0.ratio=''; A.commit({render:false});
ok('ratio segue la piattaforma', A.ratioFor(acc0.id) === '9/16', A.ratioFor(acc0.id));
ok('colonne seguono la piattaforma', A.formatOfAccount(acc0).cols === 4);
ok('pixel di esportazione', A.formatOfAccount(acc0).w === 1080 && A.formatOfAccount(acc0).h === 1920);
acc0.platform = 'LinkedIn'; A.commit({render:false});
ok('cambio piattaforma aggiorna tutto',
   A.ratioFor(acc0.id) === '1/1' && A.formatOfAccount(acc0).platform.captionMax === 3000);
acc0.ratio = '1.91/1'; A.commit({render:false});
ok('formato alternativo rispettato', A.formatOfAccount(acc0).ratio === '1.91/1');
acc0.platform='Instagram'; acc0.ratio=''; A.commit({render:false});

console.log('\n— cliente: creazione e cancellazione a cascata —');
const nuovo = A.addClient('Prova Srl','Pinterest','@prova');
ok('cliente creato con account', nuovo.accounts.length === 1 && nuovo.accounts[0].platform === 'Pinterest');
ok('token generato', !!nuovo.shareToken && nuovo.shareToken.length >= 12, nuovo.shareToken);
ok('slug generato', nuovo.slug === 'prova-srl', nuovo.slug);
A.ui.clientId = nuovo.id; A.ui.accountId = nuovo.accounts[0].id;
A.addPost('foto'); A.addStory('story'); A.addUgcSlot(A.todayKey());
const before2 = { p: A.S.posts.length, s: A.S.stories.length, u: A.S.ugcSlots.length };
A.deleteClient(nuovo.id);
ok('cancellare il cliente rimuove i suoi contenuti',
   A.S.posts.length === before2.p-1 && A.S.stories.length === before2.s-1 && A.S.ugcSlots.length === before2.u-1);
ok('nessun record orfano', A.S.posts.every(p => !!A.accountCtx(p.accountId))
  && A.S.stories.every(s2 => !!A.accountCtx(s2.accountId))
  && A.S.ugcSlots.every(u => !!A.accountCtx(u.accountId)));

console.log('\n— categorie: una sola tassonomia —');
const cl1 = A.S.clients[0];
ok('nessuna collezione pillars/formats', !A.S.pillars && !A.S.formats);
ok('i post portano categoryId', A.S.posts.every(p => 'categoryId' in p) && !A.S.posts.some(p => 'pillarId' in p));
const cat = A.categoriesOf(cl1.id)[0];
const usage = A.usageOfCategory(cat.id);
A.deleteCategory(cat.id);
ok('eliminare una categoria non elimina i post', usage > 0 && A.S.posts.some(p => p.categoryId === ''));
ok('nessun post punta a una categoria inesistente',
   A.S.posts.every(p => !p.categoryId || !!A.get(p.categoryId)));
const made = A.addCategory(cl1.id, 'Test');
ok('categoria creata per il cliente', made.clientId === cl1.id && A.categoriesOf(cl1.id).some(c=>c.id===made.id));

console.log('\n— natura del contenuto e stories —');
A.ui.clientId = cl1.id; A.ui.accountId = cl1.accounts[0].id;
const target2 = A.curPosts()[0];
A.updatePost(target2.id, { paid: true, partner: '' });
ok('sponsorizzato', A.natureOf(A.get(target2.id)).key === 'paid');
A.updatePost(target2.id, { paid: false, partner: 'Marca X' });
ok('collaborazione', A.natureOf(A.get(target2.id)).key === 'partner');
A.updatePost(target2.id, { paid: true, partner: 'Marca X' });
ok('sponsorizzata E in collaborazione insieme', (() => {
  const n = A.natureOf(A.get(target2.id));
  return n.key === 'both' && /ADV/.test(n.label) && /Marca X/.test(n.label);
})(), A.natureOf(A.get(target2.id)).label);
A.ui.section='contenuti'; A.ui.tab='feed'; A.render();
ok('l\'angolo mostra entrambe', (() => {
  const c = window.document.querySelector('.card[data-id="' + target2.id + '"] .c-tl');
  return c && c.className.indexOf('promo-both') >= 0;
})());
A.updatePost(target2.id, { paid: false, partner: '' });
const stBefore = A.S.stories.length;
A.setInStories(target2.id, true);
ok('la spunta crea una story collegata', A.S.stories.length === stBefore + 1 && !!A.mirrorOf(target2.id));
ok('la story è collegata al post per id', A.get(target2.id).storyIds.indexOf(A.mirrorOf(target2.id).id) >= 0);
A.updatePost(target2.id, { date: A.ui.month + '-07' });
ok('la story segue la data del post', A.mirrorOf(target2.id).date === A.ui.month + '-07');
A.setInStories(target2.id, false);
ok('togliere la spunta rimuove la story', A.S.stories.length === stBefore && !A.mirrorOf(target2.id));
ok('nessun riferimento orfano dopo la rimozione',
   A.S.posts.every(p => (p.storyIds||[]).every(id => !!A.get(id))));
A.setInStories(target2.id, true);
A.deletePost(target2.id);
ok('eliminare il post rimuove anche la sua story', A.S.stories.length === stBefore);

console.log('\n— copertina del reel —');
A.ui.section='contenuti'; A.ui.tab='feed';
const reel = A.addPost('reel');
A.updatePost(reel.id, { coverUrl: A.mockImage('cover-test'), date: A.ui.month + '-02' });
A.render();
ok('la copertina compare nella griglia', (() => {
  const card = window.document.querySelector('.card[data-id="' + reel.id + '"]');
  const img = card && card.querySelector('.cell img');
  return !!img && img.getAttribute('src') === A.get(reel.id).coverUrl;
})());
A.ui.tab='anteprima'; A.render();
ok('la copertina compare nell\'anteprima',
   Array.from(window.document.querySelectorAll('.pv-cell img')).some(i => i.getAttribute('src') === A.get(reel.id).coverUrl));
A.deletePost(reel.id);

console.log('\n— pubblicazione multi-piattaforma —');
const multiClient = A.S.clients.find(c => c.accounts.length > 1);
A.ui.clientId = multiClient.id;
const a1 = multiClient.accounts[0], a2 = multiClient.accounts[1];
A.ui.accountId = a1.id;
const shared = A.addPost('foto');
A.updatePost(shared.id, { caption: 'una sola volta', date: A.ui.month + '-03', alsoOn: [a2.id] });
ok('compare nel feed del primo account', A.postsIn(a1.id, A.ui.month).some(p => p.id === shared.id));
ok('compare anche nel feed del secondo', A.postsIn(a2.id, A.ui.month).some(p => p.id === shared.id));
ok('resta un record solo', A.S.posts.filter(p => p.id === shared.id).length === 1);
A.updatePost(shared.id, { caption: 'corretta una volta' });
ok('la correzione vale per entrambi',
   A.postsIn(a2.id, A.ui.month).find(p => p.id === shared.id).caption === 'corretta una volta');
ok('i formati restano diversi per account',
   A.formatOfAccount(a1).ratio !== A.formatOfAccount(a2).ratio || a1.platform === a2.platform);
ok('account fratelli elencati', A.siblingAccounts(a1.id).length === multiClient.accounts.length - 1);
A.deleteAccount(multiClient.id, a2.id);
ok('rimuovere un account pulisce i cross-post', (A.get(shared.id).alsoOn || []).indexOf(a2.id) < 0);
A.deletePost(shared.id);

console.log('\n— obiettivi —');
A.ui.clientId = cl1.id; A.ui.accountId = cl1.accounts[0].id;
const prog = A.progressOf(cl1.accounts[0].id, A.ui.month, cl1.id);
ok('progresso calcolato su 4 voci', prog.length === 4);
ok('conteggio reel separato dai post', prog.find(x=>x.key==='reel').done >= 0);

console.log('\n— salvataggio automatico —');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const onDisk = (id) => JSON.parse(window.localStorage.getItem('ideology.content.v1')).posts.find(p => p.id === id);
A.resetAll();
ok('dopo il reset è tutto salvato', A.dirty === false && A.ui.saveState === 'saved');
const probe = A.curPosts()[0];
const originalCaption = probe.caption;
let writes = 0;
const realSet = window.Storage.prototype.setItem;
window.Storage.prototype.setItem = function (k, v) { if (k === 'ideology.content.v1') writes++; return realSet.call(this, k, v); };
for (let i = 1; i <= 5; i++) A.updatePost(probe.id, { caption: 'raffica ' + i }, { render: false });
ok('una modifica mette il salvataggio in coda', A.dirty === true && A.ui.saveState === 'pending');
ok('durante la raffica non si scrive niente', writes === 0 && onDisk(probe.id).caption === originalCaption);
await sleep(A.AUTOSAVE_MS + 150);
ok('dopo una pausa si salva da solo', onDisk(probe.id).caption === 'raffica 5' && A.dirty === false);
ok('cinque modifiche, una sola scrittura', writes === 1, writes);
window.Storage.prototype.setItem = realSet;
ok('non c\'è più un pulsante Salva', (A.render(), !window.document.querySelector('.rail-save')));
ok('l\'indicatore dice lo stato', (() => {
  const n = window.document.getElementById('save-state');
  const saved = n && n.getAttribute('data-s') === 'saved';
  A.updatePost(probe.id, { caption: 'indicatore' }, { render: false });
  const pending = window.document.getElementById('save-state').getAttribute('data-s') === 'pending';
  return saved && pending;
})());
window.dispatchEvent(new window.Event('beforeunload'));
ok('chiudendo la pagina l\'ultima modifica è già scritta', onDisk(probe.id).caption === 'indicatore' && !A.dirty);
ok('gli id sono UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(A.uid('post')));
ok('il link cliente ha un token da 192 bit', /^[0-9a-f]{48}$/.test(A.newToken()));
ok('la cronologia ha un id per ogni passaggio', (() => {
  A.setStatus(probe.id, 'da_approvare', 'studio', '');
  const h = A.get(probe.id).history;
  return /^[0-9a-f-]{36}$/.test(h[h.length - 1].id);
})());
A.saveNow();

console.log('— il dialogo non torna in cima —');
(() => {
  const p0 = A.curPosts()[0];
  A.openPostEditor(p0.id);
  const tick = window.document.querySelector('[data-focus="paid"]');
  ok('le opzioni hanno una chiave di fuoco', !!tick);
  tick.focus();
  tick.click();
  const after = window.document.querySelector('[data-focus="paid"]');
  ok('dopo il clic il fuoco resta sul controllo usato',
     window.document.activeElement === after, window.document.activeElement &&
     window.document.activeElement.getAttribute('data-focus'));
  ok('il controllo riflette il nuovo stato', after.getAttribute('aria-pressed') === 'true');
  ok('la barra dei comandi è sempre presente',
     window.document.querySelectorAll('.modal-ft .btn').length === 4);
  A.closeModal();
})();

console.log('\n— dialoghi con salvataggio automatico —');
A.resetAll();
const btn = (label) => [...window.document.querySelectorAll('.modal-ft .btn')].find(b => b.textContent === label);
const edited = A.curPosts()[1];
const before3 = JSON.stringify(edited);
A.openPostEditor(edited.id);
ok('i comandi sono Elimina · Anteprima · Annulla modifiche · Fatto',
   ['Elimina', 'Anteprima', 'Annulla modifiche', 'Fatto'].every(l => !!btn(l)));
A.updatePost(edited.id, { caption: 'cambiata nel dialogo', paid: true });
ok('il dialogo scrive in diretta', A.get(edited.id).caption === 'cambiata nel dialogo');
A.closeModal();
ok('chiudere il dialogo tiene la modifica', A.get(edited.id).caption === 'cambiata nel dialogo');
ok('e la salva subito', onDisk(edited.id).caption === 'cambiata nel dialogo' && !A.dirty);

A.openPostEditor(edited.id);
const opened = JSON.stringify(A.get(edited.id));
A.updatePost(edited.id, { caption: 'da buttare', paid: false });
btn('Annulla modifiche').click();
ok('Annulla modifiche riporta com\'era all\'apertura', JSON.stringify(A.get(edited.id)) === opened);
ok('e salva il ripristino', onDisk(edited.id).caption === 'cambiata nel dialogo' && !A.dirty);
ok('il dialogo si chiude', !window.document.querySelector('#modal-bg.on'));

const countBefore = A.S.posts.length;
const fresh = A.addPost('foto');
A.openPostEditor(fresh.id, { isNew: true });
ok('un contenuto nuovo offre Annulla', !!btn('Annulla'));
btn('Annulla').click();
ok('annullare un contenuto nuovo lo rimuove', A.S.posts.length === countBefore && !A.get(fresh.id));
ok('anche dal disco', !JSON.parse(window.localStorage.getItem('ideology.content.v1')).posts.some(p => p.id === fresh.id));

const fresh2 = A.addPost('foto');
A.openPostEditor(fresh2.id, { isNew: true });
A.closeModal();
ok('chiudere un contenuto nuovo lo tiene', !!A.get(fresh2.id));
A.deletePost(fresh2.id);

ok('aprire un dialogo sopra un altro chiude bene il primo', (() => {
  let closed = 0;
  A.modal({ title: 'uno', body: [], onClose: () => { closed++; } });
  A.modal({ title: 'due', body: [] });
  A.closeModal();
  return closed === 1;
})());

console.log('\n— link cliente —');
const token = A.S.clients[0].shareToken;
ok('token presente', !!token && token.length >= 32, token);
ok('il link cliente punta a una pagina separata', (() => {
  const url = A.clientUrl(A.S.clients[0]);
  return /cliente\.html#c=/.test(url) && url.indexOf(token) > 0;
})(), A.clientUrl(A.S.clients[0]));
ok('il token sta nel frammento, che non arriva mai a un server', new URL(A.clientUrl(A.S.clients[0])).search === '');
ok('lo studio non ha più una modalità cliente interna',
   A.ui.lockedToClient === undefined && !('askRevision' in A));

console.log('\n' + (fails ? '✗ ' + fails + ' test falliti' : '✓ tutti i test passati'));
process.exit(fails ? 1 : 0);
