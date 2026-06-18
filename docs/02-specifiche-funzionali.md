# 02 — Specifiche funzionali

Riferimento visivo: gli screenshot forniti dal committente (Dashboard, Dettaglio lead, I miei lead, Pipeline kanban). Le descrizioni qui sotto riprendono quei layout e li formalizzano.

---

## 2.1 Ruoli e permessi (RBAC)

Tre ruoli:

- **`superAdmin`** — gestore del prodotto/rivenditore. Opera cross-tenant: crea e configura organizzazioni (tenant), gestisce utenti, attiva/disattiva feature per tenant, personalizza tema, vede metriche globali. Non è un utente operativo del CRM.
- **`proUser`** — utente completo di un tenant (es. **Fabio**). Accede a **tutte** le feature abilitate per il suo tenant.
- **`baseUser`** — utente limitato di un tenant. Accede a un sottoinsieme di feature.

### Matrice permessi (di default)

| Feature / Azione | superAdmin | proUser | baseUser |
|---|:---:|:---:|:---:|
| Dashboard | ✅ (globale) | ✅ | ✅ |
| Pipeline kanban | ✅ | ✅ | ✅ (sola lettura + sposta) |
| Nascondere/mostrare stage pipeline | ✅ | ✅ | ❌ |
| I miei lead (lista + filtri) | ✅ | ✅ | ✅ |
| Creare/modificare lead | ✅ | ✅ | ✅ |
| Eliminare lead | ✅ | ✅ | ❌ |
| Dettaglio lead | ✅ | ✅ | ✅ |
| Impostare capitale lead | ✅ | ✅ | ✅ |
| Note e appuntamenti su lead | ✅ | ✅ | ✅ |
| Fatture (Aggiungi fattura) | ✅ | ✅ | ❌ |
| Appuntamenti + integrazioni calendario | ✅ | ✅ | ❌ |
| Settings tenant (tema, nome, feature flag) | ✅ | ✅ (limitato) | ❌ |
| Gestione utenti del tenant | ✅ | ✅ | ❌ |
| Gestione tenant / area admin | ✅ | ❌ | ❌ |

> La matrice è il **default configurabile**: i permessi sono definiti come capability associabili ai ruoli, così un rivenditore può modulare cosa vede `baseUser`. L'enforcement è **server-side** su ogni richiesta (vedi `06`).

---

## 2.2 Dashboard (tutti i ruoli)

Pagina di sintesi. Header: **"Ciao {nome}!"** con sottotitolo "Ecco il tuo riepilogo".

### Filtro periodo
Selettori in alto a destra:
- **Anno** (es. 2026).
- **Mese specifico** oppure **"Tutto l'anno"**.

Tutte le metriche e i blocchi sotto si aggiornano in base al periodo selezionato.

### KPI principali (card)
1. **Lead totali** — numero di lead creati nel periodo.
2. **Vinte** — lead con stage `WON` nel periodo.
3. **Perse** — lead con stage `LOST` nel periodo.
4. **Conv. rate** — `Vinte / Lead totali` espresso in %. (Definire chiaramente il denominatore: vedi nota sotto.)
5. **Fatturato netto** — somma del netto delle fatture associate ai lead vinti nel periodo (€).

> **Nota conv. rate**: usare `Vinte / (Vinte + Perse + altri lead nel periodo)` = `Vinte / Lead totali del periodo`. Documentare la formula scelta vicino al codice. Quando il denominatore è 0, mostrare `0%`.

### Distribuzione pipeline
Una riga di contatori, uno per ogni **stage** della pipeline, con il numero di lead attualmente in quello stage (vedi elenco stage in §2.3). Gli stage **nascosti** dal tenant non compaiono. Esempio dagli screenshot: Da gestire, Preso in carico, Call schedulata, Attesa documenti, Call presentazione, Attesa decisione, Attesa pagamento, Vinta ✓, Persa ✗.

### Riepilogo fatture
Blocco "Riepilogo fatture" — elenco/conteggio fatture nel periodo (solo lead vinti). Stato vuoto: "Nessuna fattura nel periodo".

### Vendite perse
Blocco "Vendite perse" — raggruppa i lead persi per **motivo di perdita** con conteggio (es. "Non ha più risposto — 1"). Riferito al periodo selezionato.

### Lead totali (lista in fondo)
Elenco dei lead **esclusi Vinta e Persa**, ordinati per **giorni** nello stage (i più "fermi" in alto). Ogni riga: avatar con iniziali, nome, email, badge stage, badge "{n} giorni" (giorni dall'ultimo cambio stage / dalla creazione).

---

## 2.3 Pipeline (kanban)

Board kanban "Pipeline Kanban" con istruzione "Trascina le card per spostare i lead tra gli stage".

### Stage (default)
Ordine e label:
1. **Da gestire** (`TO_HANDLE`)
2. **Preso in carico** (`TAKEN`)
3. **Call schedulata** (`CALL_SCHEDULED`)
4. **Attesa documenti** (`WAITING_DOCS`)
5. **Call presentazione** (`PRESENTATION_CALL`)
6. **Attesa decisione** (`WAITING_DECISION`)
7. **Attesa pagamento** (`WAITING_PAYMENT`)
8. **Vinta** (`WON`)
9. **Persa** (`LOST`)

Ogni stage ha un **colore** (vedi `05-design-system.md`): le colonne e i badge richiamano i colori degli screenshot (grigio, blu, azzurro, arancio, viola, rosa, verde, verde successo, rosso).

### Comportamento
- Ogni colonna mostra il **conteggio** in testata e le card dei lead in quello stage.
- Card lead: avatar iniziali, nome, anteprima nota/descrizione troncata, data, link **"› Apri"** → dettaglio lead.
- **Drag & drop** per spostare un lead tra stage; aggiornamento ottimistico + persistenza. Allo spostamento si registra la **data di cambio stage** (per il calcolo "giorni").
- Filtro **periodo** (anno + mese/tutto l'anno) in alto, coerente con la dashboard.
- Contatori rapidi in alto a destra (es. "Attesa decisione 2", "Persa 1").

### Nascondere stage
Il tenant (proUser/superAdmin) può **nascondere alcuni stage**. Gli stage nascosti:
- non appaiono come colonna nella pipeline,
- non appaiono nella distribuzione pipeline della dashboard,
- restano validi a livello dati (un lead già in quello stage non si perde; definire UX: o si forza il re-assign o si mostra in sola lettura). **Decisione consigliata**: impedire di nascondere uno stage che contiene lead, oppure offrire spostamento massivo prima di nascondere.

`WON` e `LOST` sono stage **terminali** e non nascondibili (servono ai KPI).

### Accessibilità del drag & drop
Fornire **alternativa da tastiera** (es. menu "Sposta in…" su ogni card) e annunci ARIA live region per lo spostamento. WCAG: il drag&drop non deve essere l'unico modo per cambiare stage.

---

## 2.4 I miei lead

Lista dei lead con ricerca e filtri (schermata "I miei lead").

### Elementi
- Conteggio totale ("3 lead").
- **Ricerca** testuale: nome, cognome, email o telefono.
- **Filtro periodo**: anno + mese/"Tutto l'anno".
- **Ordina/Filtra**: `Predefinito`, `↑ Giorni asc.`, `↓ Giorni desc.`, `Oltre 25gg`, `Oltre 30gg` (i "giorni" = giorni di permanenza nello stage corrente).
- **Tab per stato** con conteggi: `Tutti (n)`, e una tab per ciascuno stage rilevante (es. `Attesa decisione (2)`, `Persa (1)`). Le tab riflettono gli stage non nascosti.
- **Righe lead**: avatar iniziali, nome, email · telefono, badge "{n} giorni", badge stage, chevron → dettaglio lead.

### Creazione lead
Pulsante per aggiungere un nuovo lead (campi minimi: nome, cognome, email, telefono; stage iniziale default `TO_HANDLE`). Validazione email/telefono.

---

## 2.5 Dettaglio lead

Accessibile da "I miei lead" o dalle card della pipeline ("› Apri"). Layout a tre colonne (come screenshot "Andrea Carapezza").

### Header
- Avatar iniziali + **nome lead**.
- Badge **stage corrente**.
- Pulsante **"Aggiorna Stage"** (apre selettore stage).
- Pulsante **"Aggiungi Fattura"** (abilitato per ruoli con permesso; gli screenshot lo mostrano disabilitato quando non applicabile).

### Colonna sinistra — Contatto
- **Email**, **Telefono**, **Data creazione**.
- **Note admin**: testo libero lungo con la "storia" del lead (campo note esteso, sola visualizzazione o editabile secondo permesso).
- **➕ NUOVO — Specchietto "Capitale"**: selettore del capitale del lead, a scelta singola tra le fasce:
  - `0–50k`
  - `50–100k`
  - `100–250k`
  - `250–500k`
  - `500k–1 mln`
  - `> 1 mln`

  Implementare come enum `capitalBracket` (vedi `03-modello-dati.md`). UI: dropdown o gruppo di pill selezionabili, accessibile da tastiera. Modificabile inline, salvataggio immediato. Questo dato è utile per segmentazione e potrà alimentare future metriche (es. capitale totale in pipeline).

### Colonna centrale — Scheda riassuntiva + Note
- **Scheda riassuntiva**: stage attuale + **data stage** (data ultimo cambio stage).
- **Note**: elenco cronologico di note (data + testo), con **"+ Aggiungi nota"**, modifica ed eliminazione per ogni nota.

### Colonna destra — Aggiornamento dati + Appuntamenti
- **Aggiornamento dati**: spazio per "dati alternativi" del cliente nel CRM esterno (nome/email diversi). Stato vuoto: "Nessun dato alternativo registrato. Usa 'Aggiungi' se questo cliente è presente nel CRM esterno con nome o email diversi." Con pulsante **"+ Aggiungi"**.
- **Appuntamenti**: tab `Tutti / Da fare / Fatti`, tabella (Data, Ora, Motivo, Stato) con azioni: segna **"✓ Fatto"**, modifica, elimina, e **"+ Aggiungi appuntamento"**. Stato appuntamento: `In attesa` / `Fatto` (vedi enum in `03`).

### Motivo di perdita
Quando un lead passa a `LOST`, richiedere il **motivo** (testo o lista predefinita riusabile, es. "Non ha più risposto"). Alimenta il blocco "Vendite perse" della dashboard.

---

## 2.6 Appuntamenti + Calendario

> Per il tenant **Fabio**: la sezione **Appuntamenti** è inclusa; il **Calendario con integrazioni** (Google/Calendly) è **escluso** (feature flag off). Vedi `08-roadmap.md`.

### Appuntamenti (interni)
- Pagina "I miei appuntamenti": elenco di tutti gli appuntamenti del tenant/utente, con filtri `Tutti / Da fare / Fatti`, ordinamento per data.
- Creazione/modifica appuntamento: data, ora, motivo, lead collegato (opzionale), stato.
- **Mini-calendario** nella sidebar (come screenshot): vista mese, evidenzia il giorno corrente e i giorni con appuntamenti; clic su un giorno filtra gli appuntamenti.

### Integrazioni calendario (modulo opzionale per tenant)
Due provider, attivabili indipendentemente:

**Google Calendar** (OAuth2):
- L'utente collega il proprio account Google (scope calendar).
- **Sync bidirezionale**: gli appuntamenti creati nel CRM creano eventi su Google Calendar; gli eventi rilevanti su Google si riflettono nel CRM (via sync periodico e/o webhook push notifications).
- Gestire refresh token, revoca, e mappatura evento↔appuntamento.

**Calendly** (API + webhook):
- Collegamento tramite token/OAuth Calendly.
- Importazione degli appuntamenti **prenotati** dai lead (webhook `invitee.created`/`canceled`), creando/aggiornando appuntamenti nel CRM e, se possibile, collegandoli al lead corrispondente (match per email).

> Astrarre dietro un'interfaccia `CalendarProvider` per non accoppiare la logica del CRM a un singolo servizio. Le credenziali per-utente/per-tenant vanno cifrate a riposo (vedi `06`).

---

## 2.7 Navigazione e layout

Sidebar sinistra (scura) con: logo/nome piattaforma, nome utente, voci **Pipeline, Dashboard, I miei Lead, Appuntamenti**, pulsante **Cambio Password**, **mini-calendario**, profilo utente in basso con **Esci**. La sidebar è **collassabile** (icona freccia) e su mobile diventa un drawer.

Header in alto a destra mostra contatori rapidi globali ("3 totali · 0 vinte · 1 perse").
