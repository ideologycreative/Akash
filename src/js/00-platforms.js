/* ============================================================
   Ideology — platform catalogue

   Reference data, shared by both surfaces. The studio app reads
   it to size the composer; the client link reads it to size the
   preview the client is looking at. It carries no behaviour, so
   sharing it creates no path between the two apps — and keeping
   one copy is the whole point: a second table of aspect ratios
   is a second table to forget to update.
   ============================================================ */

window.IDE = window.IDE || {};

(function (A) {
  'use strict';

  /* ── Platform catalogue ───────────────────────────────
     Choosing a platform on an account is the only place the
     studio ever sets a size. Everything downstream reads from
     here: the aspect ratio of the grid cells, how many columns
     the feed is drawn in, the export dimensions quoted to the
     designer, the caption counter, and the story format. There
     is no second list of "formats" to keep in step.
  ──────────────────────────────────────────────────────── */

  A.PLATFORMS = {
    Instagram: {
      key: 'Instagram', label: 'Instagram', color: '#C13584', cols: 3,
      ratio: '4/5', w: 1080, h: 1350, sizeLabel: '4:5',
      alts: [{ ratio: '1/1', w: 1080, h: 1080, label: '1:1 quadrato' },
             { ratio: '1.91/1', w: 1080, h: 566, label: '1.91:1 orizzontale' }],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
      captionMax: 2200, hashtagMax: 30,
      note: 'Griglia a 3 colonne. Il 4:5 occupa più schermo del quadrato.'
    },
    TikTok: {
      key: 'TikTok', label: 'TikTok', color: '#00C3C8', cols: 4,
      ratio: '9/16', w: 1080, h: 1920, sizeLabel: '9:16',
      alts: [],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
      captionMax: 2200, hashtagMax: 10,
      note: 'Verticale pieno. Tieni testo e logo lontani dai bordi inferiori.'
    },
    Facebook: {
      key: 'Facebook', label: 'Facebook', color: '#1877F2', cols: 3,
      ratio: '1/1', w: 1080, h: 1080, sizeLabel: '1:1',
      alts: [{ ratio: '4/5', w: 1080, h: 1350, label: '4:5 verticale' }],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
      captionMax: 63206, hashtagMax: 0,
      note: 'I primi 125 caratteri sono quelli che si leggono senza aprire.'
    },
    LinkedIn: {
      key: 'LinkedIn', label: 'LinkedIn', color: '#0A66C2', cols: 3,
      ratio: '1/1', w: 1200, h: 1200, sizeLabel: '1:1',
      alts: [{ ratio: '1.91/1', w: 1200, h: 627, label: '1.91:1 link' }],
      story: null,
      captionMax: 3000, hashtagMax: 5,
      note: 'Il testo si tronca a 210 caratteri: metti la tesi all\'inizio.'
    },
    YouTube: {
      key: 'YouTube', label: 'YouTube', color: '#FF0033', cols: 2,
      ratio: '16/9', w: 1920, h: 1080, sizeLabel: '16:9',
      alts: [{ ratio: '9/16', w: 1080, h: 1920, label: '9:16 Shorts' }],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16 Shorts' },
      captionMax: 5000, hashtagMax: 15,
      note: 'La miniatura va letta a 120 px di larghezza.'
    },
    Pinterest: {
      key: 'Pinterest', label: 'Pinterest', color: '#BD081C', cols: 4,
      ratio: '2/3', w: 1000, h: 1500, sizeLabel: '2:3',
      alts: [{ ratio: '9/16', w: 1080, h: 1920, label: '9:16 Idea Pin' }],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
      captionMax: 500, hashtagMax: 20,
      note: 'Pin verticali: il 2:3 è il formato che la piattaforma premia.'
    },
    X: {
      key: 'X', label: 'X', color: '#111114', cols: 3,
      ratio: '16/9', w: 1600, h: 900, sizeLabel: '16:9',
      alts: [{ ratio: '1/1', w: 1080, h: 1080, label: '1:1' }],
      story: null,
      captionMax: 280, hashtagMax: 3,
      note: 'Il testo conta più dell\'immagine. 280 caratteri.'
    },
    Altro: {
      key: 'Altro', label: 'Altro', color: '#8A8A93', cols: 3,
      ratio: '4/5', w: 1080, h: 1350, sizeLabel: '4:5',
      alts: [{ ratio: '1/1', w: 1080, h: 1080, label: '1:1' },
             { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
             { ratio: '16/9', w: 1920, h: 1080, label: '16:9' }],
      story: { ratio: '9/16', w: 1080, h: 1920, label: '9:16' },
      captionMax: 2200, hashtagMax: 30,
      note: 'Canale generico: scegli tu il formato di riferimento.'
    }
  };
  A.PLATFORM_LIST = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', 'Pinterest', 'X', 'Altro'];
  A.platformOf = function (p) { return A.PLATFORMS[p] || A.PLATFORMS.Instagram; };

  /* An account may override the platform default with one of its
     declared alternatives; everything still comes from one source. */
  A.formatOfAccount = function (acc) {
    var plat = A.platformOf(acc && acc.platform);
    if (acc && acc.ratio) {
      var hit = null;
      (plat.alts || []).forEach(function (a) { if (a.ratio === acc.ratio) hit = a; });
      if (hit) return { ratio: hit.ratio, w: hit.w, h: hit.h, sizeLabel: hit.label, cols: plat.cols, platform: plat };
    }
    return { ratio: plat.ratio, w: plat.w, h: plat.h, sizeLabel: plat.sizeLabel, cols: plat.cols, platform: plat };
  };
})(window.IDE);
