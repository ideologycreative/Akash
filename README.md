# Ideology — Contenuti

Strumento interno per **Ideology** (ideology.it): composizione del piano
editoriale, stories e storyboard, pianificazione UGC, e l'anteprima che il
cliente usa per approvare.

Niente account, niente server, niente dipendenze: una pagina sola che gira
anche aprendola da file system. Tutto il lavoro resta nel browser e si
esporta come backup JSON.

---

## Navigazione

Tre aree nella barra di sinistra.

**Home** — cosa serve guardare stamattina, su tutti i clienti insieme:
quanti contenuti aspettano una risposta, quanti sono tornati indietro con
una richiesta di modifica, quanto manca a chiudere gli impegni del mese.
Ogni numero è un link che porta esattamente all'account e al mese che ha
contato.

**Clienti** — l'anagrafica di contenuto. Account social e piattaforme,
identità visiva, pilastri, formati, impegni mensili, link di approvazione.
È l'unico posto in cui si decide un formato.

**Contenuti** — il lavoro vero e proprio, sul cliente e sul mese scelti in
alto: Feed, Stories, UGC, Calendario, Anteprima.

---

## Cosa c'è dentro Contenuti

| Sezione | Cosa fa |
|---|---|
| **Feed** | La griglia del mese nel formato reale della piattaforma, ordinata per data di pubblicazione. Si modifica in un dialogo centrato, con caroselli, reel e card di solo testo disegnate dai colori del brand. |
| **Stories** | Stories singole e storyboard a frame, più le copertine "in evidenza". Collegabili ai post del feed. |
| **UGC** | Calendario mensile degli slot, generatore per frequenza settimanale, rubrica creator con compensi e stato trattativa, vista annuale. |
| **Calendario** | Tutto il datato del mese in un colpo solo: feed, stories, UGC. Trascina un post su un altro giorno per spostarne la data. |
| **Anteprima** | Il mese come apparirà sul profilo: intestazione e griglia, niente altro. Cliccando un contenuto si apre come lo si legge davvero — media a sinistra, caption, categoria, note e stato a destra. Frecce per scorrere tutto il mese senza chiudere. |

---

## La piattaforma decide il formato

Scegliere la piattaforma su un account è **l'unica decisione di formato del
prodotto**. Da lì scendono, senza che nessuno le riconfermi altrove:

| Cosa | Dove si vede |
|---|---|
| Proporzione della cella | Griglia del feed, anteprima, vista cliente, lightbox |
| Colonne della griglia | Feed e anteprima |
| Pixel di esportazione | Scheda account, da passare al grafico |
| Limite caratteri caption | Contatore nel pannello di modifica |
| Formato stories | Storyboard e frame |

Instagram 4:5 · 1080×1350 · 3 colonne · 2.200 caratteri.
TikTok 9:16 · 1080×1920 · 4 colonne.
LinkedIn 1:1 · 1200×1200 · 3.000 caratteri.
Più Facebook, YouTube, Pinterest, X e un canale generico.

Dove una piattaforma ammette più proporzioni (Instagram quadrato o
orizzontale, YouTube Shorts, Pinterest Idea Pin) l'account può scegliere
l'alternativa: resta comunque un solo campo, letto da un solo posto.
Cambiare piattaforma a un account aggiorna la griglia, i contatori e le
misure nello stesso istante, perché nessuno ne tiene una copia.

---

## Come si legge una card

Ogni contenuto risponde alle stesse quattro domande, sempre negli stessi
quattro angoli, così la griglia si legge senza leggere nessuna parola.

```
┌──────────────────────────────┐
│ Organico            ▸ Reel   │   alto sx: organico o sponsorizzato
│                              │   alto dx: post · reel · carosello · card
│                              │
│                              │
│ ● Approvato      ● Prodotto  │   basso sx: stato di approvazione
└──────────────────────────────┘   basso dx: categoria
  📅 14 ott
  Caption su due righe, il resto
  si legge passandoci sopra…
```

Sotto l'immagine ci sono la data e la caption. La caption è tagliata a due
righe: passandoci sopra si apre per intero, e si richiude appena il mouse
se ne va. Nessun clic, nessuna finestra.

L'ordinamento della griglia **segue la data di pubblicazione** — i
contenuti senza data restano in fondo. Dentro l'editor si impostano data e
ora: l'ora non compare mai in griglia, serve solo a mettere in fila due
contenuti dello stesso giorno.

---

## I filtri stanno dietro un bottone

La barra del Feed porta i conteggi del mese, il formato dell'account e tre
comandi: **Filtri**, gli interruttori di visualizzazione e *Aggiungi*. Tutto
il resto è nel pannello che si apre dal bottone Filtri — stato, natura,
categoria — con il conteggio di ogni voce e quante ne restano visibili.

I filtri sono **liste**, non scelte singole: volere "da approvare" e "in
revisione" insieme è la domanda normale, non un caso limite. Il bottone
porta il numero di filtri accesi, così nessuno guarda una griglia parziale
senza sapere perché.

Il formato dell'account (`Instagram · 4:5 · 1080×1350`) resta invece fuori,
in chiaro: non è un filtro, è il ritaglio con cui la griglia sta
disegnando, e serve averlo sotto gli occhi mentre si compone.

---

## Una sola classificazione

C'è un unico asse di classificazione, ed è il cliente a definirlo nella sua
scheda: una ceramica ragiona per "prodotto / dietro le quinte", un
ristorante per "piatti / persone in cucina". Il prodotto garantisce che
l'asse sia uno solo — ed è per questo che sta in un angolo soltanto.

Due spunte, nell'editor, cambiano come un contenuto si comporta:

**Natura del contenuto** — due fatti distinti, non due valori dello stesso
campo: *Sponsorizzato* (messo a budget) e *In collaborazione* (con chi).
Possono valere insieme, perché una collaborazione si può anche spingere a
pagamento: l'angolo in alto a sinistra allora legge "ADV · con Marta
Bellini". Due filtri separati nel feed.

**Pubblica anche su** — gli altri account dello stesso cliente, elencati
con il loro handle e con il formato che applicherebbero. Spuntandone uno,
lo stesso contenuto compare nel feed di quell'account: **resta un record
solo**, quindi una caption corretta una volta è corretta ovunque, e ogni
griglia lo ritaglia nel proprio formato. Le card lo dichiarano: "Anche su
TikTok" sull'originale, "Pubblicato anche da Instagram" sulla copia vista.

**Pubblica anche nelle Stories** — crea una story collegata a quel
contenuto e la tiene allineata: visual, titolo e data seguono il post.
Togliendo la spunta la story sparisce; eliminando il post sparisce con lui.
Non è una copia, è un riflesso con un `fromPostId`, quindi non può
diventare un doppione stantio.

---

## Niente si salva da solo

Non c'è salvataggio automatico da nessuna parte. Quello che si scrive resta
in memoria finché non lo si salva, e il controllo è sempre lo stesso: in
basso nella barra di sinistra compare **Salva** quando c'è qualcosa da
salvare, con accanto **Annulla**, che riporta tutto all'ultimo salvataggio.
Chiudendo la scheda con modifiche aperte il browser avvisa.

Ogni dialogo ha i suoi quattro comandi — **Elimina · Anteprima · Annulla ·
Salva** — in una barra che resta attaccata in basso, con l'intestazione
attaccata in alto: non si cerca il pulsante scorrendo. Mentre il dialogo è aperto le modifiche si vedono subito nella
griglia dietro, così si lavora guardando il risultato; *Annulla* le
ripristina esattamente com'erano, e se il contenuto era appena stato creato
lo toglie del tutto. *Elimina* invece scrive subito, perché cancellare non
è una modifica in sospeso.

Fanno eccezione, per forza, le azioni che partono dal link cliente:
approvare o chiedere una modifica scrive immediatamente, perché di là non
c'è nessun pulsante Salva.

---

## Reel: copertina e video sono due cose

Un reel in griglia si giudica dalla copertina, quindi la copertina è un
campo suo — file o link, come qualunque altra immagine — e compare ovunque
il contenuto venga disegnato: griglia, anteprima, vista contenuto,
calendario.

Il video ha le stesse due strade. Caricando un file ne viene estratto un
fotogramma che diventa la copertina se non ce n'è già una. Il filmato
stesso viene tenuto dentro il documento solo se è piccolo (sotto 3.5 MB):
in quel caso si guarda davvero nella vista contenuto. Sopra quella soglia
restano il nome del file e la copertina, e il montato si collega con un
link — un montaggio in alta risoluzione dentro un documento salvato nel
browser sarebbe un modo garantito di riempire lo spazio e perdere tutto.

---

## Le cinque regole dell'architettura

Questo progetto nasce dall'audit di uno strumento simile già in produzione.
Ogni regola qui sotto chiude un guasto che avevamo visto davvero.

**1. Ogni record ha un id.**
Niente viene mai indirizzato con la sua posizione in un array. La griglia è
riordinabile: un indice è un riferimento che cambia da solo sotto i piedi.

**2. Le relazioni sono riferimenti per id.**
`post.storyIds` contiene identificativi, non indici. Cancellare una story
rimuove i riferimenti e lascia intatti gli altri. Con gli indici, ogni
legame successivo sarebbe scivolato silenziosamente sulla story sbagliata —
e quel legame si vede nell'anteprima che riceve il cliente.

**2b. Le relazioni non si duplicano.**
La story generata dalla spunta porta `fromPostId` e resta una sola. Senza
quel puntatore sarebbe una copia che invecchia per conto suo — il modo
classico in cui due viste dello stesso contenuto finiscono per non
coincidere più.

**2c. Un ridisegno non deve far perdere il segno.**
Un dialogo che si ricostruisce a ogni spunta riporterebbe in cima chi sta
lavorando a metà pagina. Le ricostruzioni passano tutte da `A.rebuild`, che
rimette l'offset di scorrimento e riporta il fuoco sul controllo appena
usato, ritrovandolo per la sua chiave `data-focus` e non per posizione —
perché la posizione è di nuovo un indice, e gli indici si spostano.

**3. Le collezioni sono piatte e portano le proprie chiavi.**
`{accountId, month}` sono campi del record, non un'unica stringa composta
tipo `"NomeCliente|||Giugno 2026"`. Rinominare un cliente non orfana un mese
di lavoro. Il piano UGC è ancorato all'account come i post, non al nome.

**4. L'ordine è un campo esplicito.**
`order` viene rinumerato a blocchi di dieci dopo ogni spostamento. Nessuna
aritmetica sugli indici sopravvive alla chiamata.

**5. Il salvataggio valida prima di scrivere.**
`assertShape()` controlla che ogni collezione sia ancora una lista. Se non
lo è, la scrittura si annulla e l'interfaccia segnala "Non salvato" invece
di persistere un vuoto sopra dei dati buoni. È la sola difesa contro la
classe di bug più costosa che esista in questi strumenti: una funzione di
pulizia che restituisce `{}` e cancella una collezione intera a ogni
salvataggio automatico.

### Due conseguenze visibili

**Un solo renderer.** Feed, anteprima studio e vista cliente chiamano tutti
`A.postCard` / `A.cellNode` in `04-grid.js`. Non esistono tre copie da
tenere allineate — e quindi non possono divergere su quanti stati di
approvazione esistono o se i caroselli siano sfogliabili.

**La risposta del cliente è un campo suo.** `clientNote` viene scritta sul
post con autore e data, accanto a `internalNote` dello studio, mai sopra.
Ogni passaggio di stato finisce in `post.history`, così "chi ha approvato
cosa e quando" resta rispondibile a mesi di distanza.

---

## Struttura

```
ideology-content/
├── index.html          lo studio — carica i moduli in ordine
├── cliente.html        il link cliente — carica solo il suo bundle
├── build.mjs           inlining → dist/index.html
├── make-demo.mjs       rigenera il documento di esempio
├── smoke-client.mjs    41 test sul confine: cosa attraversa, cosa no,
│                       cosa il cliente può e non può scrivere
├── smoke.mjs          125 test su jsdom: dati, ordinamento per data,
│                       approvazioni, viste, formati per piattaforma,
│                       copertine reel, multi-piattaforma, stories,
│                       salvataggio esplicito e annullamento, migrazioni,
│                       cascate, tenuta del link cliente
├── dist/
│   └── index.html      build autonoma, un file solo
└── src/
    ├── css/
    │   ├── tokens.css  colore, tipografia, geometria, tema scuro
    │   └── app.css     layout e componenti
    └── js/
        ├── 00-dates.js     vocabolario delle date (condiviso)
        ├── 00-platforms.js catalogo piattaforme (condiviso)
        ├── 01-core.js      id, helper DOM, icone, toast, modali
        ├── 02-store.js     schema, selettori, mutazioni, persistenza
        ├── 03-seed.js      studio demo + generatore immagini offline
        ├── 04-grid.js      IL renderer condiviso + lightbox
        ├── 05-feed.js      griglia e pannello di modifica
        ├── 06-stories.js   stories, storyboard, evidenze
        ├── 07-ugc.js       calendario, elenco, creator, anno
        ├── 08-calendar.js  mese aggregato
        ├── 09-preview.js   anteprima studio + vista cliente
        ├── 11-home.js      cruscotto su tutti i clienti
        ├── 12-clients.js   elenco e scheda cliente
        ├── 20-app.js       rail, barra contesto, tab, routing, avvio
        ├── 30-client-data.js  il contratto: read() e submit()
        └── 31-client-app.js   la pagina che vede il cliente
```

I file JS sono numerati perché la build li concatena in quest'ordine. Nessun
bundler, nessun passaggio di trasformazione: quello che leggi è quello che
gira.

---

## Comandi

```bash
node build.mjs         # rigenera dist/index.html e dist/cliente.html
node smoke.mjs         # test dello studio      (serve: npm install jsdom)
node smoke-client.mjs  # test del link cliente
node make-demo.mjs     # rigenera src/data/demo.js (dopo una build)
```

La build rifiuta di produrre `cliente.html` se quella pagina arriva a
caricare un modulo dello studio: la separazione non è una convenzione, è
verificata a ogni build.

Per sviluppare apri `index.html` da un server locale (`python3 -m http.server`).
Per consegnare, usa `dist/index.html`: funziona anche con doppio clic.

---

## Dati e immagini

Per ogni visual ci sono due strade: **caricare un file** o **incollare un
link**. I file caricati vengono ridimensionati a 1100 px e salvati dentro
il documento come data URL — nessun link esterno da rinnovare, nessuna
dipendenza da un CDN che scade. I link restano link: se un giorno non
rispondono, la cella lo dice con il nome del dominio invece di restare
bianca. I contenuti demo non sono
immagini: sono SVG generati in modo deterministico dall'id del post, così la
griglia si legge come un feed vero senza scaricare nulla.

Lo stato vive in `localStorage` sotto la chiave `ideology.content.v1`, e ci
finisce **solo** quando si preme Salva.
Il pulsante **Dati e backup** nella barra esporta e reimporta tutto, senza
whitelist di campi: stati di approvazione, pilastri, formati, storico e note
sopravvivono al giro completo.

---

## Link cliente

Il link cliente è **una pagina a sé**: `cliente.html?c=<token>`. Non è lo
studio con dei pezzi nascosti — è un'altra pagina, con un altro bundle. Chi
apre il sorgente non trova l'editor, né il planner UGC, né l'anagrafica, né
i dati degli altri clienti: non sono lì. 72 KB contro 280.

```
┌─────────────────┐                      ┌──────────────────┐
│  index.html     │                      │  cliente.html    │
│  lo studio      │                      │  il cliente      │
└────────┬────────┘                      └────────┬─────────┘
         │                                        │
         │        30-client-data.js               │
         └──────────▶  read(token)   ─────────────▶
                       └ solo quel cliente
                       └ niente bozze
                       └ niente note interne, storico, cross-posting
         ◀──────────   submit(...)   ◀────────────┘
                       └ approva · revisione · annulla
                       └ indirizzato per id, mai per posizione
```

`read()` e `submit()` sono scritte come se dall'altra parte ci fosse già un
server, perché un giorno ci sarà: sono il corpo di `GET /api/anteprima?c=` e
di `POST /api/anteprima`. Sostituire il documento locale con `fetch()` è una
modifica a queste due funzioni e a nient'altro.

**Cosa non attraversa mai il confine:** gli altri clienti, le bozze, le note
interne, lo storico delle approvazioni, i piani di pubblicazione multipla,
l'UGC, i creator, i budget, gli impegni mensili.

**Cosa il cliente può scrivere:** un'approvazione, o una richiesta di
modifica con un messaggio. Solo sui propri contenuti, e solo su quelli che
lo studio ha inviato. Tre controlli in fila — il token deve risolvere a un
cliente, il contenuto deve esistere, il contenuto deve essere suo — e poi
una scrittura su campi in lista bianca.

La richiesta del cliente finisce in `clientNote`, che è un campo suo: la
nota interna dello studio non viene mai toccata. Nello strumento da cui
nasce questo progetto le due condividevano un campo, e una richiesta di
modifica cancellava quello che lo studio si era scritto da solo.

La pagina è pensata per il telefono, perché è lì che i clienti aprono questi
link: una colonna, i due gesti sotto il contenuto a cui appartengono, e in
cima quanti contenuti aspettano una risposta. Quando non ne resta nessuno lo
dice, invece di lasciare il dubbio.

La caption è tagliata a tre righe e si legge per intero passando il puntatore
sul contenuto — la stessa cosa che fa la griglia dello studio, dalla stessa
funzione condivisa. La riga dei bottoni è esclusa di proposito: la caption
non deve comparire sopra *Approva* mentre qualcuno ci sta andando. Su un
telefono, dove il puntatore non esiste, si tocca il contenuto e si apre la
vista intera.

**Lo studio non si apre mai da un link cliente.** Se un indirizzo con `?c=`
arriva su `index.html` — un link vecchio, o un host che ha servito questa
pagina per un percorso che non conosceva — lo studio non viene disegnato
affatto: compare una schermata che dice dove il link voleva andare, e si
ferma lì. L'alternativa era consegnare l'intero strumento a un cliente.

**La pagina cliente si regge da sola.** Se non trova un documento scritto
dallo studio (un browser nuovo, un host che serve le due pagine da origini
diverse) usa un documento di esempio incorporato, e lo dichiara con
un'etichetta *Esempio* in testa. Serve a poterla aprire e guardare senza
prima configurare nulla; `make-demo.mjs` lo rigenera quando il seed cambia.

In questa versione il token è dimostrativo e i dati sono locali al browser.
Per un uso reale servono un backend e un token non indovinabile; il modello
dati è già nella forma giusta — ogni scrittura del cliente è indirizzata per
`postId`, non per posizione, e la whitelist dei campi scrivibili è una riga
sola da aggiungere lato server.
