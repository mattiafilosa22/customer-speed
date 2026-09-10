# Insight & Stats — design

Data: 2026-09-10

## Contesto

Fabio tiene l'attività di prospecting Instagram in un foglio di calcolo
(`base/Sponsorizzate Instagram.xlsx`, foglio **Chat**): una riga per giorno, tre
canali di conversazione, funnel a 3–4 step, rollup mensile con tassi di
conversione. 476 giorni compilati dal 12/06/2025 al 09/09/2026.

Questa spec descrive la sezione **Insight & Stats** del CRM, che sostituisce quel
foglio collegandolo alle entità reali (lead, appuntamenti, storico stage) invece
di duplicarle a mano. La sezione è attivabile per tenant.

### Struttura del foglio di origine

| Blocco | Colonne Excel | Step |
|---|---|---|
| WELCOME | B, C, D, E | Welcome inviati → Risposte → Appuntamenti → Vendite |
| OUTBOUND/SONDAGGI | F, G, H, I | Messaggi → Risposte → Appuntamenti → Vendite |
| INBOUND | J, K, L | Ricevuti → Appuntamenti → Vendite |
| Totali | M, N | `M = D+H+K`, `N = E+I+L` |

Ogni mese è chiuso da una riga `TOT` (somme) e da una riga di tassi
(`C/B`, `D/C`, `E/D`, `G/F`, `H/G`, `I/H`, `K/J`, `L/K`, `N/M`).

### Semantica dei canali (definita dall'utente)

- **Welcome** — Fabio scrive per primo, tramite i propri canali.
- **Outbound** — Fabio scrive a chi ha reagito a un'esca (commento, storia,
  sondaggio). Il contatto ha già mostrato interesse.
- **Inbound** — è il potenziale cliente a cercare Fabio.

### Difetti del foglio che il CRM elimina

Rilevati leggendo il file, tutti da correggere in fase di import:

1. **Giugno 2025**: la riga `TOT` (riga 22) contiene percentuali al posto delle
   somme in C, D, E, G, H, I, K, L. Il primo mese non è confrontabile.
2. **Formule M/N a macchia di leopardo**: 5 righe hanno appuntamenti nei canali
   ma nessuna formula in M. Settembre 2026 risulta `TOT M = 0`.
3. **Off-by-one**: `N509` somma da `N477` invece che da `N478` — il tasso di
   settembre 2026 include un giorno di agosto.
4. **Dati impossibili**: 24 giorni con risposte outbound > messaggi outbound,
   5 giorni con risposte welcome > welcome inviati.
5. **Testo in celle numeriche**: riga 430, colonne B–E contengono
   `miru | ha | dimenticato | ciao`.
6. **Nessun collegamento coi lead**: appuntamenti e vendite sono contatori
   ridigitati a mano, scollegati dalle entità del CRM.

## Decisioni di progetto

Prese con l'utente durante il brainstorming, non rinegoziabili in fase di piano
senza tornare da lui:

1. **Le colonne Appuntamenti e Vendite non si digitano**: sono calcolate dalle
   entità del CRM e sono interattive (clic → crea lead / mostra i lead dietro).
2. **Outbound si sdoppia**: la colonna "Messaggi" diventa **Commenti** e
   **Storie**. La colonna Risposte outbound resta unica.
3. **Colonne manuali**: Welcome inviati, Risposte welcome, Commenti, Storie,
   Risposte outbound, Inbound ricevuti. Sei numeri al giorno.
4. **Appuntamenti = fissati**, non "in agenda quel giorno". Un lead conta **una
   sola volta**, il giorno del suo **primo** appuntamento.
5. **Vendite = giorno di passaggio a `WON`**, letto da `StageHistory`.
6. **Perimetro = provenienza del lead.** Entrano nel report solo i lead la cui
   `LeadSource` è quella collegata alla sezione per il tenant (per Fabio:
   Instagram), indipendentemente da dove sono stati creati.
7. **Il canale è obbligatorio** quando la provenienza è quella collegata, anche
   creando il lead da lista o pipeline. Nessuna colonna "non attribuiti".
8. **Storico importato**, marcato come archivio e in sola lettura.
9. **Nome della sezione dinamico**: `<label provenienza> Stats` (per Fabio
   "Instagram Stats"). Rotta e chiave del flag restano neutre.
10. **Calcolo a richiesta** per il periodo vivo; valori materializzati solo per
    l'archivio, che non ha entità dietro e non cambierà mai.

Fuori perimetro per questa spec: grafici di andamento, confronto mesi
affiancati, vista annuale. Il foglio ha un tab "Grafici KPI" non ancora
analizzato; verranno progettati separatamente.

## Modello dati

### Nuovo enum

```prisma
enum ChatChannel {
  WELCOME
  OUTBOUND_COMMENT
  OUTBOUND_STORY
  INBOUND
}
```

Commento e storia restano distinti anche se nella tabella condividono le colonne
Appuntamenti e Vendite: l'informazione costa zero conservarla e abilita analisi
future. Le label IT/EN vivono in `src/i18n`, mai nel DB (come `LeadStage` e
`CapitalBracket`).

### `Lead`

```prisma
  chatChannel ChatChannel?   // obbligatorio in Zod quando sourceId == insightSourceId

  @@index([organizationId, chatChannel, createdAt])
```

Opzionale a livello di schema (i lead non-Instagram non lo hanno), obbligatorio a
livello di validazione quando la provenienza è quella collegata.

### `StageHistory`

```prisma
  @@index([organizationId, toStage, changedAt])
```

Le vendite si contano cercando i passaggi a `WON` in un intervallo; l'indice
attuale `[organizationId, changedAt]` non ha lo stage nel prefisso.

### `Organization`

```prisma
  insightSourceId   String?     // FK LeadSource: provenienza collegata alla sezione
  insightSource     LeadSource? @relation("InsightSource", fields: [insightSourceId], references: [id], onDelete: SetNull)
  insightActiveFrom DateTime?   @db.Date // confine archivio / dato vivo
```

`onDelete: SetNull`: cancellare la sorgente non deve cancellare il tenant. Con
`insightSourceId` null la sezione mostra lo stato "da configurare".

### Nuovo modello — riga giornaliera

```prisma
model ChatActivityDay {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  date DateTime @db.Date

  // Contatori manuali (validi sia per il periodo vivo sia per l'archivio).
  welcomeSent      Int @default(0)
  welcomeReplies   Int @default(0)
  outboundComments Int @default(0)
  outboundStories  Int @default(0)
  outboundReplies  Int @default(0)
  inboundReceived  Int @default(0)

  // ── Archivio (solo righe < insightActiveFrom, immutabili) ──
  isArchived Boolean @default(false)

  // Il foglio ha UNA colonna "Messaggi" outbound, non separabile in
  // commenti/storie: per l'archivio si conserva il valore aggregato.
  archivedOutboundMessages Int?

  // Conteggi congelati: non hanno lead dietro, non sono cliccabili.
  archivedWelcomeAppointments  Int?
  archivedWelcomeSales         Int?
  archivedOutboundAppointments Int?
  archivedOutboundSales        Int?
  archivedInboundAppointments  Int?
  archivedInboundSales         Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([organizationId, date])
  @@index([organizationId, date])
}
```

Una riga per giorno per tenant: ~365 righe/anno, irrilevante per lo spazio (il
piano Supabase free è un vincolo attivo — vedi la feature di data retention).

Back-relations da aggiungere su `Organization`: `chatActivityDays`,
`insightSource`. Su `LeadSource`: la back-relation `insightForOrganizations`.

### Migrazione

Additiva. `ALTER TYPE` non serve (enum nuovo). Nessun backfill: i lead esistenti
restano con `chatChannel` null e non compaiono nel report finché non viene
assegnato — è il caso che l'avviso in cima alla pagina rende visibile.

## Calcolo dei valori

Tutto in `src/server/insight/`, funzioni pure dove possibile, testabili senza DB
sui casi limite.

### Periodo vivo

Per un mese `[from, to)` e un tenant con `insightSourceId` valorizzato:

**Appuntamenti per canale e per giorno** — per ogni lead con
`sourceId = insightSourceId` e `chatChannel != null`, si prende la data di
creazione del **primo** `Appointment` collegato (`MIN(createdAt)` per `leadId`)
e la si attribuisce al giorno e al canale del lead. Un lead compare al massimo
una volta in tutta la tabella. Gli appuntamenti successivi allo stesso lead non
incrementano nulla.

Nota: `Appointment.createdAt` è la data in cui l'appuntamento è stato *fissato*,
che è la semantica decisa; `startAt` (quando si tiene) non entra nel conteggio.

**Vendite per canale e per giorno** — righe di `StageHistory` con
`toStage = WON`, `changedAt` nell'intervallo, il cui lead ha la provenienza
collegata e un canale. Se un lead entra in `WON` più volte (riaperto e richiuso)
conta l'**ultimo** passaggio, in modo che la vendita esista una volta sola e
nella data corrente.

**Colonne Outbound**: sommano `OUTBOUND_COMMENT` e `OUTBOUND_STORY`.

**Totale di riga**: somma dei tre canali. Sempre calcolato, mai memorizzato — è
il difetto n. 2 del foglio, che non può ripetersi.

**Lead non attribuiti**: conteggio dei lead con provenienza collegata,
`chatChannel` null e almeno un appuntamento nel mese. Alimenta l'avviso in cima
alla pagina.

### Periodo di archivio

I valori arrivano dalle colonne `archived*` della riga. Nessuna query su lead o
appuntamenti.

### Unione

Una sola funzione di lettura restituisce il mese come lista di righe con la
stessa forma, ognuna marcata viva o archivio. La UI non ha due modalità di
rendering, solo celle che sanno se sono modificabili.

### Riepiloghi

Totali di colonna e tassi di conversione passo per passo, con denominatore zero
gestito esplicitamente (restituisce "non calcolabile", non `NaN` né `0%`). Se il
mese mescola archivio e dato vivo, il riepilogo lo dichiara.

## Interfaccia

Rotta: `src/app/[locale]/(app)/insight/`. Mockup validato dall'utente:
`docs/superpowers/specs/assets/2026-09-10-insight-stats-mockup.html`.

### Intestazione

Titolo dinamico `<label provenienza> Stats`, con ripiego "Insight & Stats" se
`insightSourceId` è null (in quel caso la pagina spiega che manca la
configurazione invece di mostrare una tabella vuota). Navigazione mese
precedente / successivo, "Oggi", esportazione. Nella barra laterale la label è
troncata con ellissi oltre una certa lunghezza, con titolo completo accessibile.

### KPI del mese

Cinque riquadri: conversazioni avviate, risposte ottenute, appuntamenti,
vendite, canale migliore — con confronto sul mese precedente.

### Avviso lead non attribuiti

Se ci sono lead con provenienza collegata e canale mancante che hanno prodotto
appuntamenti nel mese, banner con conteggio e collegamento alla lista filtrata
per assegnare il canale.

### Tabella

Un mese alla volta, una riga per giorno, intestazioni su due livelli
(Welcome / Outbound / Inbound / Totale). 15 colonne. Giorno corrente
evidenziato, giorni futuri disabilitati.

**Celle manuali** — input numerico inline, salvataggio all'uscita dal campo, con
indicatore di stato per riga. Tab si sposta di colonna, frecce su/giù di giorno:
la giornata si compila senza mouse.

**Celle Appuntamenti** — a zero: clic apre il dialogo "nuovo lead da chat".
Con un numero: clic apre l'elenco dei lead che ci stanno dietro (nome, stage,
link al dettaglio) più la voce per aggiungerne un altro.

**Celle Vendite** — si aprono sull'elenco dei lead chiusi quel giorno, ma non
creano nulla: una vendita nasce chiudendo il lead in pipeline.

**Tooltip di composizione** — su una cella calcolata: *"10 appuntamenti — 8
creati da Insight & Stats, 2 inseriti da lista lead o pipeline"*. La distinzione
si ricava confrontando il lead con l'audit/origine di creazione (vedi "Punti
aperti"). Accessibile da tastiera e a lettore di schermo, non solo al passaggio
del mouse.

**Righe di archivio** — fondo attenuato, nessun campo modificabile, nessuna
cella cliccabile, cella unica *Messaggi (archivio)* al posto di Commenti e
Storie. La distinzione non è affidata al solo colore: icona ed etichetta
esplicita (requisito WCAG).

**Piè di tabella** — riga totali e riga conversioni.

**Valori assenti** — trattino, non `0`: uno zero è un dato, l'assenza no.

### Responsive

Tablet: tabella con colonna data fissa e scorrimento orizzontale.
Telefono: una scheda per giorno, tre blocchi impilati, stesse interazioni.

### Dialogo "nuovo lead da chat"

Nuovo client component, non un riuso di `NewLeadDialog` (che non crea
appuntamenti). Campi del lead più data e ora dell'appuntamento. Provenienza e
canale precompilati dalla cella e **non modificabili**. Il salvataggio crea lead
+ appuntamento **in una sola transazione**: nessun lead orfano se qualcosa
fallisce.

### Campo "Canale" nel form lead

`NewLeadDialog` e la modifica del lead guadagnano un select "Canale", visibile
solo quando la provenienza selezionata è quella collegata, e obbligatorio in quel
caso. Serve anche a correggere un canale sbagliato.

## Validazione

Zod su ogni confine, server-side.

- Contatori manuali: interi ≥ 0, limite superiore ragionevole.
- **Risposte ≤ messaggi inviati**: `welcomeReplies ≤ welcomeSent` e
  `outboundReplies ≤ outboundComments + outboundStories`. È il controllo che nel
  foglio manca e che genera 29 giorni incoerenti.
- Date: nessuna scrittura su giorni futuri, nessuna scrittura su righe archivio.
- `chatChannel` obbligatorio se `sourceId == insightSourceId`.

## API e azioni

Server Actions per la scrittura dei contatori e per la creazione lead +
appuntamento; Route Handler per la lettura del mese se serve al client per la
navigazione. Ogni endpoint verifica sessione, capability e feature flag, e usa il
client Prisma con iniezione tenant (`src/lib/prisma-tenant.ts`).

## Import dello storico

Script one-off `scripts/import-insight-history.ts`, comando
`pnpm db:import-insight`, convenzioni di `scripts/backfill-loss-reasons.ts`
(parametri da env, fallimento rumoroso, ambito stretto).

Parametri: `DATABASE_URL`, `ORG_SLUG`, `FILE` (percorso xlsx),
`ACTIVATION_DATE`, `CONFIRM` (assente = prova a vuoto).

Comportamento:

- Legge il foglio **Chat**, **solo le righe giornaliere**. Ignora del tutto le
  righe `TOT` e le righe dei tassi: ogni totale viene ricalcolato dai dati.
  Questo sana i difetti 1, 2 e 3.
- Mappa: B→`welcomeSent`, C→`welcomeReplies`, F→`archivedOutboundMessages`,
  G→`outboundReplies`, J→`inboundReceived`, D/E/H/I/K/L→`archived*`.
  `outboundComments` e `outboundStories` restano 0 per l'archivio.
- **Celle non numeriche scartate singolarmente**, non per riga: dei quattro
  testi della riga 430 non entra nulla, ma gli altri valori del giorno sì.
- **Risposte > messaggi importate così come sono**, elencate nel report: il dato
  storico non si inventa. La validazione stretta vale dal periodo vivo in poi.
- **Idempotente**: upsert su `(organizationId, date)`. Seconda esecuzione =
  stessi valori.
- **Rifiuta di scrivere su `date >= ACTIVATION_DATE`**, anche se il file
  contiene quelle righe. L'archivio non può sovrascrivere il dato vivo.
- **Prova a vuoto di default**: stampa giorni letti, totali per mese
  (confrontabili a occhio con l'Excel) ed elenco anomalie. Scrive solo con
  conferma esplicita.
- Report salvato in `backups/`, accanto ai dump.
- Imposta `Organization.insightActiveFrom`.

**Data di attivazione consigliata: 2026-09-01.** Settembre nasce interamente
vivo e nessun mese resta spaccato a metà (un mese diviso ha totali validi ma
tassi che confrontano due mondi). Costo: reinserire a mano i 6 valori dei giorni
1–9 settembre. Alternativa: 2026-10-01, con settembre tutto in archivio.

## Feature flag, permessi, i18n

**Flag `insightStats`**, aggiunto a `featureFlagsSchema` in
`src/lib/feature-flags.ts` con **default `false`** (regola già in vigore: default
permissivo per i moduli centrali, restrittivo per gli opzionali). Compare nel
pannello admin (`feature-flags-form.tsx`) insieme alla scelta della provenienza
collegata — le due impostazioni stanno vicine perché la prima senza la seconda
non serve.

**A flag spento**: voce di menu assente e rotta che risponde `notFound()` (stesso
pattern di `settings/integrations/page.tsx` per `calendarIntegrations`). Non 403,
che confermerebbe l'esistenza della sezione. Controllo server-side su ogni pagina
e ogni endpoint.

**Due capability** in `src/lib/rbac.ts`:

| Capability | superAdmin | proUser | baseUser |
|---|---|---|---|
| `insight.view` | ✓ | ✓ | ✓ |
| `insight.edit` (contatori manuali) | — | ✓ | — |

`superAdmin` non è un utente operativo, quindi vede senza modificare. `baseUser`
può comunque creare un lead da una cella, perché è `lead.create` che già
possiede, ma non tocca i volumi di attività.

**i18n**: tutte le stringhe in `messages/it.json` e `messages/en.json`, comprese
le label dei quattro canali (nel layer i18n, non nel DB). Titolo come messaggio
con segnaposto.

## Test

Standard del progetto: unit su ogni funzione di calcolo e su ogni endpoint,
e2e sui flussi critici.

**Unit — calcolo**: primo appuntamento per lead (secondo appuntamento non
incrementa), vendita presa dall'ultimo passaggio a `WON`, somma dei due canali
outbound, totale di riga, tassi con denominatore zero, unione righe vive +
archivio, mese a cavallo del confine di attivazione.

**Unit — endpoint e azioni**: validazione (compresa risposte ≤ messaggi),
capability mancante, flag spento, **isolamento tenant** (due organizzazioni con
dati nello stesso giorno non si vedono), scrittura rifiutata su riga archivio e
su giorno futuro, transazione lead+appuntamento che non lascia lead orfani.

**Unit — import**: celle testuali, giorni duplicati, righe oltre la data di
attivazione, doppia esecuzione, ricalcolo dei totali che ignora le righe `TOT`.

**E2E**: clic sulla cella appuntamento di un giorno → creazione lead → il numero
sale; chiusura del lead come vinto dalla pipeline → la vendita compare nel
**giorno della chiusura**, non in quello dell'appuntamento. È il comportamento
che distingue la sezione dal foglio.

## Punti aperti per la fase di piano

1. **Origine del lead per il tooltip** ("creato da Insight & Stats" vs "inserito
   da lista/pipeline"): decidere se ricavarla da `AuditLog` (già presente, azione
   `lead.create` con `meta`) o da un campo dedicato sul lead. La prima non
   aggiunge schema ma dipende dalla retention degli audit; la seconda è esplicita
   ma aggiunge una colonna. Da valutare guardando `src/server/audit/`.
2. **Esportazione**: formato e perimetro (mese corrente o intervallo) non ancora
   definiti con l'utente.
3. **Fuso orario**: il confine di giornata va fissato sul fuso del tenant, non su
   UTC, altrimenti un appuntamento creato alle 00:30 finisce nel giorno
   precedente. Verificare come lo gestiscono già dashboard e appuntamenti.
