/* ============================================================
   Ideology — where the data lives

   Empty (as shipped): everything stays in this browser. Good for
   trying the tool and for demos; nothing is shared.

   Filled in: the studio and the client link use the Supabase
   project below, shared by everyone on the team.

     supabaseUrl  Project Settings → API → Project URL
     supabaseKey  Project Settings → API Keys → the PUBLISHABLE key
                  (sb_publishable_…) or the legacy "anon" key

   Both values are public by design: they ship to every visitor's
   browser, and what they can do is limited by the database's
   Row Level Security. The SECRET / service_role key must never go
   here — the page refuses to start if it sees one.
   ============================================================ */

window.IDEOLOGY_CONFIG = Object.assign({
  supabaseUrl: '',
  supabaseKey: ''
}, window.IDEOLOGY_CONFIG || {});
