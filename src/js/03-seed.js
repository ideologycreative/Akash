/* ============================================================
   Ideology — demo data + offline imagery

   The tool never fetches an image from the network: media is
   either uploaded by the user (downscaled to a data URL) or,
   for the demo content, drawn as a deterministic SVG from the
   post's own id. So the grid reads as a real feed with nothing
   to load and nothing to break.
   ============================================================ */

(function (A) {
  'use strict';

  var PALETTES = [
    ['#C9B9A6', '#7E6B59', '#F2ECE4'],
    ['#A9B7A0', '#4F5E4A', '#EEF1E9'],
    ['#C2A8AE', '#6E4C57', '#F4EBED'],
    ['#A3B1C6', '#3F4F6B', '#EAEEF5'],
    ['#D6C06A', '#7A6420', '#F7F1DD'],
    ['#B8A6C9', '#55436B', '#F0EAF5'],
    ['#CDA18A', '#7A4A34', '#F6E8E0'],
    ['#9FB8B5', '#3D5B58', '#E7F0EF']
  ];

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  /* Deterministic abstract visual — same seed always gives the same image. */
  A.mockImage = function (seed, w, h) {
    w = w || 400; h = h || 500;
    var n = hash(String(seed));
    var pal = PALETTES[n % PALETTES.length];
    var variant = (n >> 5) % 6;
    var a = pal[0], b = pal[1], c = pal[2];
    var r1 = ((n >> 11) % 60) / 100 + .2;
    var r2 = ((n >> 17) % 50) / 100 + .25;
    var body = '';

    if (variant === 0) {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/>' +
        '<circle cx="' + (w * r1) + '" cy="' + (h * .42) + '" r="' + (w * .36) + '" fill="' + a + '"/>' +
        '<rect y="' + (h * .68) + '" width="' + w + '" height="' + (h * .32) + '" fill="' + b + '"/>';
    } else if (variant === 1) {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + a + '"/>' +
        '<path d="M0 ' + (h * r1) + ' L' + w + ' ' + (h * (r1 - .22)) + ' L' + w + ' ' + (h * (r1 + .18)) + ' L0 ' + (h * (r1 + .4)) + 'Z" fill="' + b + '"/>' +
        '<path d="M0 ' + (h * .86) + ' L' + w + ' ' + (h * .74) + ' L' + w + ' ' + h + ' L0 ' + h + 'Z" fill="' + c + '"/>';
    } else if (variant === 2) {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/>' +
        '<path d="M' + (w * .22) + ' ' + h + ' L' + (w * .22) + ' ' + (h * .45) +
        ' A' + (w * .28) + ' ' + (w * .28) + ' 0 0 1 ' + (w * .78) + ' ' + (h * .45) + ' L' + (w * .78) + ' ' + h + 'Z" fill="' + b + '"/>' +
        '<circle cx="' + (w * .5) + '" cy="' + (h * .58) + '" r="' + (w * .14) + '" fill="' + a + '"/>';
    } else if (variant === 3) {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + b + '"/>' +
        '<rect x="' + (w * .1) + '" y="' + (h * .12) + '" width="' + (w * .8) + '" height="' + (h * .34) + '" rx="' + (w * .04) + '" fill="' + c + '"/>' +
        '<rect x="' + (w * .1) + '" y="' + (h * .52) + '" width="' + (w * .52) + '" height="' + (h * .3) + '" rx="' + (w * .04) + '" fill="' + a + '"/>';
    } else if (variant === 4) {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + c + '"/>' +
        '<circle cx="' + (w * .5) + '" cy="' + (h * .5) + '" r="' + (w * .46) + '" fill="none" stroke="' + a + '" stroke-width="' + (w * .09) + '"/>' +
        '<circle cx="' + (w * .5) + '" cy="' + (h * .5) + '" r="' + (w * .27) + '" fill="none" stroke="' + b + '" stroke-width="' + (w * .07) + '"/>' +
        '<circle cx="' + (w * .5) + '" cy="' + (h * .5) + '" r="' + (w * .09) + '" fill="' + b + '"/>';
    } else {
      body = '<rect width="' + w + '" height="' + h + '" fill="' + a + '"/>' +
        '<ellipse cx="' + (w * r2) + '" cy="' + (h * .36) + '" rx="' + (w * .42) + '" ry="' + (h * .28) +
        '" fill="' + c + '" transform="rotate(-18 ' + (w * r2) + ' ' + (h * .36) + ')"/>' +
        '<ellipse cx="' + (w * .68) + '" cy="' + (h * .74) + '" rx="' + (w * .34) + '" ry="' + (h * .2) + '" fill="' + b + '"/>';
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  /* Uploads are downscaled in the browser. A planning tool fills up fast
     with full-resolution exports; 1100px wide is plenty for a grid cell
     and keeps the saved document small enough to survive. */
  A.readImage = function (file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('nessun file'));
      if (!/^image\//.test(file.type)) return reject(new Error('serve un file immagine'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('lettura non riuscita')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('immagine non valida')); };
        img.onload = function () {
          var max = 1100;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          try { resolve(cv.toDataURL('image/jpeg', 0.78)); }
          catch (e) { resolve(fr.result); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* A video upload is handled differently from an image. A montaggio is
     far too big to live inside the saved document, so we always pull a
     poster frame out of it — that is what the grid needs — and keep the
     clip itself inline only when it is small enough to be harmless. */
  A.VIDEO_INLINE_MAX = 3.5 * 1024 * 1024;

  A.readVideo = function (file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('nessun file'));
      if (!/^video\//.test(file.type)) return reject(new Error('serve un file video'));

      var objUrl = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;

      var done = false;
      function finish(poster) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(objUrl);
        var out = { name: file.name, sizeBytes: file.size, poster: poster || '', dataUrl: '' };
        if (file.size <= A.VIDEO_INLINE_MAX) {
          var fr = new FileReader();
          fr.onload = function () { out.dataUrl = fr.result; resolve(out); };
          fr.onerror = function () { resolve(out); };
          fr.readAsDataURL(file);
        } else {
          resolve(out);
        }
      }

      v.addEventListener('error', function () { finish(''); });
      v.addEventListener('loadeddata', function () {
        try { v.currentTime = Math.min(0.6, (v.duration || 1) * 0.1); }
        catch (e) { grab(); }
      });
      v.addEventListener('seeked', grab);

      function grab() {
        try {
          var max = 900;
          var scale = Math.min(1, max / Math.max(v.videoWidth || max, v.videoHeight || max));
          var cv = document.createElement('canvas');
          cv.width = Math.round((v.videoWidth || 720) * scale);
          cv.height = Math.round((v.videoHeight || 1280) * scale);
          cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
          finish(cv.toDataURL('image/jpeg', 0.78));
        } catch (e) { finish(''); }
      }

      setTimeout(function () { finish(''); }, 8000);
      v.src = objUrl;
    });
  };

  A.humanSize = function (bytes) {
    var mb = (Number(bytes) || 0) / 1024 / 1024;
    return mb >= 1 ? mb.toFixed(1) + ' MB' : Math.round((Number(bytes) || 0) / 1024) + ' KB';
  };

  /* ── Demo studio ──────────────────────────────────────── */

  A.seed = function () {
    var S = A.S;
    var now = A.thisMonth();
    var prev = A.shiftMonth(now, -1);
    var yr = now.split('-')[0];
    var mo = now.split('-')[1];

    S.clients = []; S.posts = []; S.stories = []; S.highlights = [];
    S.ugcSlots = []; S.creators = []; S.categories = [];
    S.prefs = { ugcDays: [1, 3, 5] };

    function client(name, slug, accounts) {
      var c = {
        id: A.uid('cl'), name: name, slug: slug,
        shareToken: A.newToken(),
        status: 'attivo', note: '',
        goals: { post: 12, reel: 4, stories: 20, ugc: 8 },
        accounts: accounts.map(function (a) {
          return {
            id: A.uid('ac'), handle: a.h, platform: a.p, ratio: '',
            bio: a.bio || '', followers: a.f || 0, following: a.g || 0, avatarUrl: ''
          };
        }),
        palette: { bg: '#F2ECE4', ink: '#241E19', accent: '#9A5B3C', alt: '#6E6256' }
      };
      S.clients.push(c);
      return c;
    }

    function cat(cl, name, color, description) {
      var c = { id: A.uid('cat'), clientId: cl.id, name: name, color: color, description: description || '' };
      S.categories.push(c); return c;
    }

    /* — Fornace Milano — ceramics studio, the fully worked example — */
    var forn = client('Fornace Milano', 'fornace-milano', [
      { h: '@fornacemilano', p: 'Instagram', bio: 'Ceramica fatta a mano in Porta Venezia.\nPezzi unici, piccole serie, corsi il sabato.', f: 18400, g: 312 },
      { h: '@fornacemilano', p: 'TikTok', bio: 'Il tornio, visto da vicino.', f: 7100, g: 54 }
    ]);
    var pProd  = cat(forn, 'Prodotto', '#9A5B3C', 'Pezzi, serie, nuovi smalti');
    var pDietro= cat(forn, 'Dietro le quinte', '#4F5E4A', 'Bottega, processo, mani al lavoro');
    var pComm  = cat(forn, 'Community', '#3F4F6B', 'Corsi, clienti, domande e risposte');
    var pCult  = cat(forn, 'Cultura materiale', '#6E4C57', 'Perché la ceramica si fa così');

    var ig = forn.accounts[0];
    var tk = forn.accounts[1];

    var demo = [
      { k: 'foto', st: 'pubblicato', pi: pProd, d: 2,
        cap: 'La serie Terra esce dal forno dopo 11 ore a 1240°.\nSmalto a cenere di faggio, ogni pezzo vira in modo diverso.\n\nDisponibile in bottega da sabato.' },
      { k: 'carosello', st: 'pubblicato', pi: pCult, d: 4, slides: 4,
        cap: 'Come riconoscere un pezzo tornito a mano in quattro dettagli.\nSalva il carosello, portalo con te la prossima volta che compri ceramica.' },
      { k: 'reel', st: 'approvato', pi: pDietro, d: 6,
        cap: 'Centrare l\'argilla è il gesto più noioso e il più importante.\nNove secondi, nessun taglio.' },
      { k: 'foto', st: 'approvato', pi: pProd, d: 8, paid: true, t: '18:30',
        cap: 'Tazza Noce, 220 ml.\nFatta per stare in mano, non per stare in vetrina.' },
      { k: 'editoriale', st: 'approvato', pi: pCult, d: 10,
        ed: { eyebrow: 'Cultura materiale', title: 'Una ciotola non è mai finita quando esce dal tornio', sub: 'Essiccazione, prima cottura, smalto, seconda cottura. Tre settimane prima di poterla chiamare oggetto.' },
        cap: 'Quanto tempo serve davvero per una ciotola.\nTre settimane, quattro passaggi, due cotture.' },
      { k: 'reel', st: 'in_revisione', pi: pComm, d: 12, partner: 'Scuola Arti Grafiche',
        cap: 'Il corso del sabato visto dal fondo della stanza.\nOtto persone, due torni, zero esperienza richiesta.',
        clientNote: 'Il reel è bello ma non si capisce che il corso è aperto ai principianti. Potete aggiungere una scritta nei primi secondi?' },
      { k: 'foto', st: 'da_approvare', pi: pProd, d: 14,
        cap: 'Le mani di Giulia dopo una giornata di tornio.\nQuesta è la parte che non finisce mai nelle foto di prodotto.' },
      { k: 'carosello', st: 'da_approvare', pi: pDietro, d: 17, slides: 3,
        cap: 'Il nostro forno ha 34 anni ed è ancora quello giusto.\nTre cose che abbiamo imparato a non toccare.' },
      { k: 'foto', st: 'da_approvare', pi: pProd, d: 19, paid: true,
        cap: 'Nuovo smalto, nome provvisorio: Nebbia.\nDitecelo voi come si dovrebbe chiamare.' },
      { k: 'reel', st: 'bozza', pi: pComm, d: 22, paid: true, partner: 'Marta Bellini',
        cap: '' },
      { k: 'editoriale', st: 'bozza', pi: pCult, d: 24,
        ed: { eyebrow: 'Dalla bottega', title: 'Perché non vendiamo pezzi perfetti', sub: 'La variazione non è un difetto di produzione: è la prova che dietro c\'è una persona.' },
        cap: '' },
      { k: 'foto', st: 'bozza', pi: pProd, d: 27, cap: '' }
    ];

    demo.forEach(function (x, i) {
      var id = A.uid('post');
      var p = {
        id: id, accountId: ig.id, month: now, order: (i + 1) * 10,
        kind: x.k, mediaUrl: '', coverUrl: '', slides: [],
        date: now + '-' + A.pad(x.d), time: x.t || '', showDate: true,
        caption: x.cap || '',
        categoryId: x.pi.id, paid: !!x.paid, partner: x.partner || '', videoName: '',
        alsoOn: [], inStories: false, storyIds: [],
        editorial: x.ed || { eyebrow: '', title: '', sub: '' },
        status: x.st, revisions: x.st === 'in_revisione' ? 1 : 0,
        internalNote: '', clientNote: x.clientNote || '',
        clientNoteAt: x.clientNote ? new Date().toISOString() : '',
        history: [], createdAt: new Date().toISOString()
      };
      if (x.k !== 'editoriale') p.mediaUrl = A.mockImage(id);
      /* a reel's cover is a separate image from the clip itself */
      if (x.k === 'reel') { p.coverUrl = A.mockImage(id + ':cover'); p.mediaUrl = ''; }
      if (x.k === 'carosello') {
        for (var s = 0; s < (x.slides || 3); s++) {
          var sid = A.uid('sl');
          p.slides.push({ id: sid, url: A.mockImage(id + ':' + s), caption: '' });
        }
        p.mediaUrl = p.slides[0].url;
      }
      if (x.clientNote) {
        p.history.push({ at: new Date().toISOString(), from: 'da_approvare', to: 'in_revisione', by: 'cliente', note: x.clientNote });
      }
      S.posts.push(p);
    });

    /* previous month, so the month navigation has somewhere to go */
    ['foto', 'reel', 'carosello', 'foto', 'foto', 'reel'].forEach(function (k, i) {
      var id = A.uid('post');
      S.posts.push({
        id: id, accountId: ig.id, month: prev, order: (i + 1) * 10,
        kind: k, mediaUrl: A.mockImage(id), coverUrl: '', slides: [],
        date: prev + '-' + A.pad(3 + i * 4), showDate: true,
        caption: 'Archivio ' + A.monthLabel(prev).toLowerCase() + '.',
        categoryId: [pProd, pDietro, pCult][i % 3].id, paid: false, partner: '', videoName: '',
        alsoOn: [], inStories: false, storyIds: [],
        editorial: { eyebrow: '', title: '', sub: '' },
        status: 'pubblicato', revisions: 0, internalNote: '', clientNote: '', clientNoteAt: '',
        history: [], createdAt: new Date().toISOString()
      });
    });

    /* TikTok account — thinner, to prove the switcher does something */
    ['reel', 'reel', 'reel', 'reel'].forEach(function (k, i) {
      var id = A.uid('post');
      S.posts.push({
        id: id, accountId: tk.id, month: now, order: (i + 1) * 10,
        kind: k, mediaUrl: A.mockImage(id, 360, 640), coverUrl: '', slides: [],
        date: now + '-' + A.pad(5 + i * 6), showDate: true,
        caption: ['Il tornio in 15 secondi.', 'Smalto che cambia colore in cottura.',
                  'Risposta: sì, si può imparare da adulti.', 'Il suono della bottega alle 7 del mattino.'][i],
        categoryId: pDietro.id, paid: false, partner: '', videoName: '', alsoOn: [], inStories: false, storyIds: [],
        editorial: { eyebrow: '', title: '', sub: '' },
        status: i < 2 ? 'approvato' : 'bozza', revisions: 0,
        internalNote: '', clientNote: '', clientNoteAt: '', history: [], createdAt: new Date().toISOString()
      });
    });

    /* stories + storyboards */
    var stDefs = [
      { kind: 'story', title: 'Forno aperto', d: 2 },
      { kind: 'story', title: 'Nuovo smalto', d: 8 },
      { kind: 'storyboard', title: 'Corso del sabato — 5 frame', d: 12, ugc: false },
      { kind: 'story', title: 'Domande e risposte', d: 15 },
      { kind: 'storyboard', title: 'Unboxing cliente (UGC)', d: 19, ugc: true },
      { kind: 'story', title: 'Ultimi pezzi', d: 24 }
    ];
    var madeStories = [];
    stDefs.forEach(function (x, i) {
      var id = A.uid('st');
      var s = {
        id: id, accountId: ig.id, month: now, order: (i + 1) * 10,
        kind: x.kind, title: x.title, mediaUrl: '',
        frames: [], date: now + '-' + A.pad(x.d), note: '', isUgc: !!x.ugc,
        status: i < 3 ? 'approvato' : 'bozza'
      };
      if (x.kind === 'storyboard') {
        var labels = ['Hook', 'Contesto', 'Dettaglio', 'Prova', 'Call to action'];
        for (var f = 0; f < 5; f++) {
          s.frames.push({ id: A.uid('fr'), url: A.mockImage(id + ':' + f, 270, 480), note: labels[f] });
        }
        s.mediaUrl = s.frames[0].url;
      } else {
        s.mediaUrl = A.mockImage(id, 270, 480);
      }
      S.stories.push(s);
      madeStories.push(s);
    });

    /* one post published in stories too, through the same mirror the
       interface uses — not a hand-written duplicate. The index has to be
       built first: syncMirror resolves the post by id like everything else. */
    A.index();
    /* and one reel published on both accounts, from a single record */
    S.posts[2].alsoOn = [tk.id];
    S.posts[3].inStories = true;
    A.syncMirror(S.posts[3].id);

    /* link stories to posts by id */
    S.posts[2].storyIds = [madeStories[0].id, madeStories[1].id];
    S.posts[5].storyIds = [madeStories[2].id];
    S.posts[6].storyIds = [madeStories[4].id];

    ['Corsi', 'Bottega', 'Smalti'].forEach(function (t, i) {
      S.highlights.push({
        id: A.uid('hl'), accountId: ig.id, title: t,
        coverUrl: A.mockImage('hl:' + t, 160, 160), storyIds: []
      });
    });

    /* creators + UGC month */
    var cr1 = A.addCreatorSilent(forn.id, { name: 'Marta Bellini', handle: '@martabellini', followers: 24300, fee: 450, status: 'accordo', note: 'Preferisce girare di mattina, luce naturale.' });
    var cr2 = A.addCreatorSilent(forn.id, { name: 'Dario Lupo', handle: '@dariolupo', followers: 9800, fee: 220, status: 'contattato', note: 'Risposto alla prima mail, in attesa di tariffa.' });

    var ugcPlan = [
      { d: 3,  mode: 'autonoma', status: 'consegnato', brief: 'Cliente che scarta il pacco' },
      { d: 7,  mode: 'creator',  status: 'girato',     brief: 'Colazione con la tazza Noce', cr: cr1.id },
      { d: 10, mode: 'autonoma', status: 'brief',      brief: 'Recensione in 15 secondi' },
      { d: 14, mode: 'creator',  status: 'brief',      brief: 'Il corso del sabato, visto da chi partecipa', cr: cr1.id },
      { d: 18, mode: 'autonoma', status: 'idea',       brief: '' },
      { d: 21, mode: 'template', status: 'idea',       brief: 'Template "la mia prima ciotola"' },
      { d: 25, mode: 'creator',  status: 'idea',       brief: 'Da definire con Dario', cr: cr2.id },
      { d: 28, mode: 'autonoma', status: 'idea',       brief: '' }
    ];
    ugcPlan.forEach(function (x) {
      S.ugcSlots.push({
        id: A.uid('ugc'), accountId: ig.id, date: now + '-' + A.pad(x.d),
        mode: x.mode, status: x.status, brief: x.brief || '', creatorId: x.cr || '', note: ''
      });
    });

    /* — Two lighter clients, so the switcher is real — */
    forn.goals = { post: 12, reel: 5, stories: 24, ugc: 8 };

    var bott = client('Bottega Verdi', 'bottega-verdi', [
      { h: '@bottegaverdi', p: 'Instagram', bio: 'Cucina lombarda, menù corto.\nVia Melzo 14, Milano.', f: 9200, g: 188 }
    ]);
    var bp1 = cat(bott, 'Piatti', '#7A4A34', 'Il menù, i singoli piatti');
    cat(bott, 'Persone in cucina', '#4F5E4A', 'Brigata, fornitori, servizio');
    cat(bott, 'Sala', '#3F4F6B', 'Ambiente, serate, eventi');
    ['foto', 'foto', 'reel', 'foto', 'carosello'].forEach(function (k, i) {
      var id = A.uid('post');
      var p = {
        id: id, accountId: bott.accounts[0].id, month: now, order: (i + 1) * 10,
        kind: k, mediaUrl: A.mockImage(id), coverUrl: '', slides: [],
        date: now + '-' + A.pad(4 + i * 5), showDate: true,
        caption: ['Risotto allo zafferano, versione corta: riso, brodo, pazienza.',
                  'Il menù di questa settimana è scritto a mano ogni lunedì.',
                  'Mezzanotte in cucina, si prepara il brodo del giorno dopo.',
                  'Mondeghili. Nove su dieci li ordinano due volte.',
                  'Come nasce il menù: tre passaggi, nessun software.'][i],
        categoryId: bp1.id, paid: i === 2, partner: '', videoName: '',
        alsoOn: [], inStories: false, storyIds: [],
        editorial: { eyebrow: '', title: '', sub: '' },
        status: ['pubblicato', 'approvato', 'da_approvare', 'da_approvare', 'bozza'][i],
        revisions: 0, internalNote: '', clientNote: '', clientNoteAt: '',
        history: [], createdAt: new Date().toISOString()
      };
      if (k === 'carosello') {
        for (var s = 0; s < 3; s++) p.slides.push({ id: A.uid('sl'), url: A.mockImage(id + ':' + s), caption: '' });
        p.mediaUrl = p.slides[0].url;
      }
      S.posts.push(p);
    });

    bott.palette = { bg: '#1E2420', ink: '#F2EFE7', accent: '#C8A96E', alt: '#7E8C76' };
    bott.goals = { post: 8, reel: 2, stories: 12, ugc: 4 };

    var atel = client('Atelier Noto', 'atelier-noto', [
      { h: '@ateliernoto', p: 'Instagram', bio: 'Gioielli in argento riciclato.\nSu appuntamento.', f: 4800, g: 97 },
      { h: 'Atelier Noto', p: 'LinkedIn', bio: 'Design e produzione orafa, Milano.', f: 1200, g: 0 }
    ]);
    cat(atel, 'Collezioni', '#55436B', 'Pezzi e linee');
    cat(atel, 'Processo orafo', '#3D5B58', 'Banco, fusione, finitura');
    atel.palette = { bg: '#F4F2F6', ink: '#24202B', accent: '#55436B', alt: '#A89BB8' };
    atel.goals = { post: 6, reel: 2, stories: 8, ugc: 0 };
    atel.status = 'pausa';

    A.ui.clientId = forn.id;
    A.ui.accountId = ig.id;
    A.ui.month = now;
    A.index();
  };

  /* seed-time helper that does not trigger a render */
  A.addCreatorSilent = function (clientId, data) {
    var c = Object.assign({
      id: A.uid('cr'), clientId: clientId, name: '', handle: '',
      followers: 0, fee: 0, status: 'contattato', note: ''
    }, data || {});
    A.S.creators.push(c);
    return c;
  };
})(window.IDE);
