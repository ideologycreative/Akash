# Ideology — lo studio condiviso su Supabase

Questa cartella è il backend: lo schema del database, le regole di accesso,
la funzione che serve il link cliente, e i test che dimostrano che le regole
tengono.

- [Messa in produzione](#messa-in-produzione) — i passi, nell'ordine
- [Impostazioni del dashboard](#impostazioni-del-dashboard) — cosa toccare e perché
- [Come è protetto](#come-è-protetto)
- [Salvataggio e conflitti](#salvataggio-e-conflitti)
- [Test](#test)
- [Regole per le prossime migrazioni](#regole-per-le-prossime-migrazioni)
- [Limiti noti](#limiti-noti)
- [Meta: Business Manager, Instagram, Facebook per cliente](#meta-business-manager-instagram-facebook-per-cliente)

---

## Messa in produzione

1. **Unisci la pull request su `main`.** L'integrazione GitHub del progetto
   Supabase applica `migrations/` al database di produzione. Controlla in
   *Database → Migrations* che `20261015160000_ideology_init` risulti
   applicata.

2. **Pubblica l'Edge Function** `anteprima`, con la verifica JWT spenta
   (i clienti non hanno un login: il loro token è la credenziale, e lo
   controlla il database):

   ```sh
   npx supabase login
   npx supabase link --project-ref <ref-del-progetto>
   npx supabase functions deploy anteprima --no-verify-jwt
   ```

   In *Edge Functions* deve comparire `anteprima` con *Verify JWT* spento.
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` le fornisce Supabase da sé:
   non vanno impostate e non vanno copiate da nessuna parte.

3. **Crea il tuo accesso.** *Authentication → Users → Add user → Create new
   user*: email, password, spunta **Auto Confirm User**.

4. **Collega le pagine al progetto.** In `src/js/00-config.js`:

   ```js
   supabaseUrl: 'https://<ref>.supabase.co',
   supabaseKey: 'sb_publishable_…'      // Project Settings → API Keys
   ```

   È la chiave **pubblica**. Quella segreta (`sb_secret_…` o
   `service_role`) non va mai qui: le pagine si rifiutano di partire se la
   trovano. Poi `npm run build` e commit: Vercel ripubblica da solo.

5. **Entra nello studio.** Al primo accesso propone di creare lo studio (ne
   diventi proprietario), poi chiede da dove partire: il lavoro già fatto in
   quel browser, lo studio di esempio, o niente. Il lavoro del browser viene
   copiato con le immagini (che finiscono in Storage) e gli id convertiti;
   la copia locale resta lì.

6. **Invita i colleghi.** Rail → *Team* → email → *Invita*. Poi crea il
   loro accesso come al punto 3, con la stessa email. Al primo login vedono
   l'invito — lo studio, il ruolo, chi l'ha mandato — e scelgono *Accetta* o
   *Rifiuta*. Niente viene accettato da solo: chiunque possieda uno studio
   può invitare qualunque indirizzo, quindi entrare è sempre una scelta di
   chi è invitato.

---

## Impostazioni del dashboard

`config.toml` vale solo per lo sviluppo locale. In produzione queste vanno
impostate a mano:

| Dove | Cosa | Perché |
|---|---|---|
| Authentication → Sign In / Providers → Email | **Allow new users to sign up: off** | Gli accessi li crea un proprietario. Anche se restasse acceso, un estraneo che si registra non vede niente (il database lo decide), ma non c'è motivo di lasciarlo entrare. |
| Authentication → Sign In / Providers → Email | **Confirm email: on** | Gli inviti valgono solo per indirizzi confermati: registrarsi con l'email di un altro non mostra né accetta i suoi inviti. |
| Authentication → URL Configuration | **Site URL** = l'indirizzo Vercel dello studio; aggiungilo anche a **Redirect URLs** | Il link di "password dimenticata" deve tornare allo studio. |
| Authentication → Emails → SMTP | Un SMTP vero (Resend, Postmark, …) | Quello incluso manda pochissime mail l'ora e solo ai membri del progetto Supabase: le mail di reset ai colleghi non partirebbero. |
| Project Settings → Data API | **Exposed schemas: `public`, `graphql_public`** — non aggiungere `private` | Le funzioni di servizio vivono in `private` proprio per non essere raggiungibili. |
| Storage | Il bucket `media` deve risultare **privato** | Lo crea la migrazione; controlla solo che nessuno l'abbia reso pubblico. |
| Edge Functions → `anteprima` | **Verify JWT: off** | Vedi sopra. |

L'opzione *Automatically expose new tables* è indifferente: la migrazione
toglie ogni permesso e ridà solo quelli che servono, in tutti e due i casi.
I test girano apposta nel caso peggiore (opzione accesa).

**Piano gratuito, da sapere:** un progetto inattivo per circa una settimana
viene messo in pausa, e il link cliente smette di rispondere finché non lo
riattivi dal dashboard. Per un pilota con clienti veri conviene il piano Pro,
che ha anche backup giornalieri. Fino ad allora: *Backup → Esporta backup*
dallo studio, ogni tanto.

---

## Come è protetto

Il principio: **il database decide**, non la pagina. Tutto quello che segue è
in `migrations/` ed è verificato da `tests/db.test.mjs`.

**Niente è aperto per default.** Row Level Security è attiva su ogni
tabella. Il ruolo `anon` (chiunque abbia la chiave pubblica) non ha alcun
permesso su nessuna tabella e non può chiamare nessuna funzione. Anche le
tabelle create in futuro partono chiuse.

**Ogni studio è un recinto.** Ogni riga porta `workspace_id`, e le policy
lasciano leggere e scrivere solo le righe degli studi di cui si è membri.
Ogni riferimento tra tabelle è una chiave esterna *composta* che include
`workspace_id`: un post non può puntare all'account di un altro studio
nemmeno conoscendone l'id — il database rifiuta la riga. Una riga non può
cambiare studio.

**Ruoli.** *Proprietario*: invita, rimuove, cambia ruoli. *Editor*: tutto il
lavoro sui contenuti. Uno studio ha sempre almeno un proprietario. Si entra
in uno studio solo accettando un invito, esplicitamente.

**Il cliente non tocca mai una tabella.** La pagina cliente chiama l'Edge
Function `anteprima`, che valida l'input e chiama due funzioni Postgres
eseguibili **solo** dal service role:

- `client_preview(token)` — lista bianca dei campi: niente bozze, note
  interne, storico, altri clienti, id dello studio, token.
- `client_review(token, post, azione, nota)` — approva, chiedi modifica,
  annulla. Non su bozze, non su contenuti pubblicati, non su post di altri.
  Token sconosciuto, post inesistente, post altrui e bozza rispondono tutti
  allo stesso modo (404): l'endpoint non rivela cosa esiste.

**Il token del link** è un segreto da 192 bit; il database rifiuta token più
corti di 32 caratteri. Si rigenera o si spegne dalla scheda cliente, con
effetto immediato. Viaggia nel frammento dell'indirizzo (`#c=…`), che i
browser non mandano mai a un server, e nel *corpo* delle richieste
all'Edge Function, mai nell'URL: non finisce nei log.

**Le parole del cliente sono sue.** La richiesta di modifica del cliente
(`client_note`) la scrive solo `client_review()`: un aggiornamento dallo
studio non può cambiarla.

**Media.** Bucket privato; i file stanno sotto
`<workspace_id>/<client_id>/<uuid>.<ext>` e le policy di Storage guardano la
prima cartella. Il database accetta come riferimento a un media solo: vuoto,
un link `http(s)`, o un percorso **nella cartella del proprio studio** — mai
un `data:` incorporato, mai un percorso nello studio di un altro (la
funzione del cliente firma i percorsi con il service role: un percorso
altrui le farebbe consegnare un file altrui). SVG non è ammesso: può
contenere script.

**Cronologia.** Solo aggiunte. Un evento dello studio è sempre firmato da chi
è collegato (il database ignora la firma inviata); gli eventi del cliente li
scrive solo `client_review()`. Nessuno può modificare o cancellare lo storico
dall'API.

**Le pagine.** Content-Security-Policy con l'hash SHA-256 di ogni script
generato dalla build: uno script iniettato non combacia e non parte. Le
connessioni sono limitate alla pagina e a Supabase. `vercel.json` impedisce
che il link cliente venga incorniciato in un altro sito (clickjacking sul
pulsante *Approva*) e che il token esca tramite l'header Referer.

---

## Salvataggio e conflitti

`src/js/15-sync.js` sostituisce il documento del browser con il database
senza che gli altri moduli cambino il modo in cui modificano i dati.

**Cosa viene inviato.** Ogni modifica chiama `A.commit()`; 0,7 s dopo,
`flush()` trasforma ogni record nella riga che sarebbe in Postgres, la
confronta con l'ultima versione confermata dal server, e invia **solo le
differenze**: un insert per tabella per le righe nuove, un update per riga
cambiata con le sole colonne cambiate, un delete per tabella. Il lavoro viene
ricalcolato dallo stato ogni volta invece di stare in una coda: un
salvataggio fallito o interrotto si riprova e basta, niente si perde da una
coda e niente parte due volte.

**Versioni.** Ogni riga ha una `version` che solo il database incrementa.
Ogni update dice "solo se sei ancora alla versione N". Se nel frattempo
qualcun altro ha salvato, non viene scritto niente e si fonde campo per
campo:

| Io | Il collega | Risultato |
|---|---|---|
| ho cambiato | non ha toccato | resta il mio |
| non ho toccato | ha cambiato | prendo il suo |
| ho cambiato | ha cambiato uguale | niente da fare |
| ho cambiato | ha cambiato diverso | **chiedo**: *Tieni la mia* / *Usa la loro versione* |

"Il mio" è il record com'è *adesso*, non com'era quando il salvataggio è
partito: quello che si scrive mentre la richiesta è in volo non si perde.

**Dal vivo.** Le modifiche dei colleghi arrivano con Supabase Realtime, che
applica le stesse policy a ciascun destinatario. Un record con modifiche
locali non ancora salvate non viene mai sovrascritto da un aggiornamento in
arrivo: ci pensa il controllo di versione al salvataggio. Dopo una
disconnessione, o tornando sulla scheda dopo più di un minuto, lo studio
rilegge tutto e fonde.

**Offline.** Senza rete l'indicatore dice *Offline* e riprova da solo
(2 s, 4 s, … fino a 30 s), e subito quando la rete torna. Chiudendo la scheda
con modifiche non salvate il browser chiede conferma.

**"Annulla modifiche" annulla le mie.** Un dialogo aperto tiene una copia di
com'era il record all'apertura. Se nel frattempo un collega o il cliente lo
cambiano (il cliente approva, un collega sposta la data), quelle modifiche
entrano nella copia: annullare riporta indietro solo quello che ho fatto io.

**Cambiare studio.** Prima di aprire un altro studio si aspetta che il
salvataggio in corso finisca. Ogni salvataggio appartiene allo studio in cui
è partito: se lo studio cambia, si ferma al passo successivo invece di
scrivere nello studio sbagliato.

---

## Test

```sh
npm ci
npm run test:db     # 73 test: schema e sicurezza
npm run test:sync   # 91 test: due colleghi e un cliente, end to end
npm run test:all    # tutto, 362 test
```

Nessun Docker e nessun progetto Supabase: i test avviano un **PostgreSQL 17
vero** (pacchetto `embedded-postgres`), caricano `tests/supabase-stub.sql` —
i ruoli `anon` / `authenticated` / `service_role`, `auth.uid()` come lo
definisce Supabase, Storage con le sue policy, e i permessi predefiniti nel
caso peggiore — e applicano ogni migrazione.

- `tests/db.test.mjs` agisce come utenti reali, con gli stessi ruoli e le
  stesse JWT claims che imposta PostgREST: isolamento tra studi, inviti,
  ruoli, versioni, vincoli, link cliente, Storage, e l'Edge Function
  chiamata davvero contro il database.
- `smoke-sync.mjs` (nella radice) apre due studi e una pagina cliente in
  jsdom e li fa lavorare insieme. Ogni chiamata di supabase-js passa da
  `tests/postgrest-shim.mjs`, che la traduce in SQL eseguito come l'utente
  collegato — quindi a rispondere sono le policy, i trigger e i vincoli
  veri. Gli aggiornamenti dal vivo arrivano dal database (`NOTIFY`), non dal
  test.

Cosa i test **non** coprono: il gateway HTTP di Supabase, il server Realtime
e il server Storage veri. Lì valgono la documentazione di Supabase e una
prova a mano dopo il primo deploy (accesso, un salvataggio da due browser,
un'approvazione dal link cliente).

---

## Regole per le prossime migrazioni

1. Un file nuovo per ogni cambiamento: le migrazioni già applicate non si
   modificano.
2. Ogni tabella nuova: `workspace_id`, chiavi esterne composte, RLS accesa,
   le quattro policy, `grant` espliciti a `authenticated`, il trigger
   `touch`. `db.test.mjs` fallisce se una tabella resta senza RLS o se
   `anon` riceve qualcosa.
3. Ogni funzione nuova in `public`: `security definer` solo se serve,
   sempre `set search_path = ''`, e `revoke all … from public, anon,
   authenticated` seguito dai `grant` precisi. Postgres dà l'esecuzione a
   tutti per default; `db.test.mjs` controlla che `anon` non possa chiamare
   niente.
4. Un valore nuovo in un elenco dell'app (stato, formato, piattaforma) va
   anche nel vincolo `check` corrispondente. `smoke-sync.mjs` prova ogni
   valore che l'app usa contro il database, e fallisce se uno manca.
5. Prima di unire: `npm run test:all`.

---

## Limiti noti

- **File orfani in Storage.** Sostituire o eliminare un media non cancella
  il file. Serve un lavoro periodico che elimini i file non più citati.
- **Offline solo a scheda aperta.** Le modifiche fatte senza rete restano in
  memoria finché la scheda è aperta; chiudendola, il browser avvisa.
- **Accesso per cliente.** Ogni membro dello studio vede tutti i clienti
  dello studio. Se servirà limitare un collaboratore ad alcuni clienti, si
  aggiunge una tabella di assegnazioni e una condizione nelle policy.
- **Limite di richieste sul link cliente.** Non c'è: con token da 192 bit
  indovinarne uno non è realistico. Da aggiungere se si vedono abusi.
- **Link firmati già consegnati.** Spegnere un link cliente, o rimuovere un
  collega, non revoca i link alle immagini che ha già ricevuto: scadono
  entro un'ora.
- **Eliminazioni in Realtime.** Supabase non può filtrare né sottoporre a RLS
  gli eventi di eliminazione: ogni utente collegato riceve l'id (solo l'id)
  delle righe eliminate in qualunque studio. Lo studio ignora gli id che non
  conosce; il contenuto non passa mai. Per eliminarlo del tutto si passa a
  Realtime *Broadcast* con autorizzazione.

---

## Meta: Business Manager, Instagram, Facebook per cliente

Non ancora costruito. Questo è il disegno, e cosa c'è già pronto.

### Il requisito

Ogni cliente ha il **proprio** Business Manager, la propria pagina Facebook,
il proprio account Instagram — e quindi i propri token. Il token di un
cliente non deve mai poter essere usato per un altro, né per errore né per
un bug.

### Il disegno

**Un collegamento per cliente.** Una tabella `client_connections`:

```
id, workspace_id, client_id            → appartiene a un cliente, a uno studio
provider            'meta'
business_id, page_id, ig_user_id, ad_account_id
scopes, status      ('attivo', 'scaduto', 'revocato', 'errore')
token_expires_at, last_checked_at, connected_by
vault_secret_id     → il token, in Supabase Vault
unique (client_id, provider)
```

`accounts` riceve `connection_id` (chiave esterna composta, quindi dello
stesso cliente e dello stesso studio) e `external_id` (l'id Instagram o della
pagina). Il percorso per pubblicare è sempre
**post → account → collegamento → token**, tutto dentro lo stesso cliente.

**Il token non sta in una colonna.** Sta in **Supabase Vault** (cifrato a
riposo, chiave gestita da Supabase); la riga tiene solo l'id del segreto. Gli
utenti dello studio leggono lo *stato* del collegamento (attivo, scade il …),
mai il token: la colonna non è nei loro `grant`.

**Un'unica porta per il token:**

```sql
private.meta_token_for_account(account_id uuid) returns text
-- security definer, eseguibile SOLO dal service role
```

Riceve un *account*, non un cliente né un token: può restituire solo il
token del cliente che possiede quell'account. Mescolare i token di due
clienti richiederebbe di passare l'account sbagliato — e la pubblicazione
prende l'account dal post, che il database lega al suo cliente con le
chiavi esterne composte. La separazione è nella struttura, non in un `if`.

**Collegare (OAuth), tutto lato server:**

1. Dalla scheda cliente, *Collega Meta* chiama l'Edge Function
   `meta-connect`, che prepara l'URL di autorizzazione Meta con un `state`
   firmato (HMAC con un segreto delle Edge Functions) che lega studio,
   cliente e utente, e scade in pochi minuti.
2. Chi gestisce il Business Manager del cliente autorizza su Meta.
3. Meta richiama `meta-callback`: verifica il `state`, scambia il codice
   con un token a lunga durata usando l'App Secret (solo nei segreti delle
   Edge Functions), lo salva con `vault.create_secret()`, scrive il
   collegamento.

Il browser non vede mai né il token né l'App Secret. Il collegamento può
farlo il cliente stesso, dal *suo* Business Manager: i suoi asset restano
suoi, e lo studio ne riceve l'uso, non la proprietà.

**Pubblicare.** Un'Edge Function `meta-publish`, avviata a orario (pg_cron),
prende i post *approvati* con data e ora arrivate; per ognuno chiede il token
per `post.account_id`, crea il contenitore e lo pubblica con la Graph API, e
scrive l'esito in una tabella `publications` (post, account, id esterno,
stato, errore, tentativi). Una chiave unica per post e account impedisce di
pubblicare due volte. Un token scaduto segna il collegamento come *scaduto*
e lo studio lo vede sulla scheda di quel cliente, non su tutti.

**Da mettere in conto:** un'app Meta con verifica dell'azienda e App Review
per i permessi di pubblicazione (`instagram_content_publish`,
`pages_manage_posts`, `pages_show_list`, `business_management`); un fuso
orario per cliente (oggi data e ora sono "da muro"); un lavoro che rinnovi i
token prima della scadenza.

### Cosa c'è già pronto

- Ogni account social è già una riga con id stabile, piattaforma e cliente:
  il collegamento si aggancia lì.
- Lo schema `private` non esposto, le funzioni eseguibili solo dal service
  role, l'Edge Function che non consegna mai un segreto al browser: lo
  stesso schema che userà Meta, già usato e già testato dal link cliente.
- Le chiavi esterne composte, che rendono strutturale il "mai tra clienti".
- Data e ora del post sono colonne tipizzate (`date`, `time`): un
  pianificatore può interrogarle direttamente.
