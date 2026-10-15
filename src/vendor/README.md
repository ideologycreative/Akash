# Vendored libraries

| File | Package | Version | License | sha256 |
|---|---|---|---|---|
| `supabase-2.117.2.js` | `@supabase/supabase-js` (`dist/umd/supabase.js`) | 2.117.2 | MIT | `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd` |

Copied into the repo rather than loaded from a CDN, so the studio runs with no
third-party script at runtime and the exact bytes are reviewable in git.

Only the studio loads it. The client link talks to the Edge Function with plain
`fetch` and carries no Supabase library at all.

To upgrade: pick a release at least two weeks old, then

```sh
npm install --save-dev @supabase/supabase-js@<version>
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js src/vendor/supabase-<version>.js
```

update the `<script>` in `index.html`, `STUDIO_ONLY` in `build.mjs`, the
version in `supabase/functions/anteprima/deno.json`, and this table.
