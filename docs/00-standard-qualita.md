# 00 — Standard di qualità (NON NEGOZIABILE)

> Questo documento ha **precedenza** sulle scelte di comodità. Vale per **ogni** agente e per ogni riga di codice di CustomerSpeed. Se una richiesta è in conflitto con questi standard, **fermati e segnalalo** invece di abbassare l'asticella. "Funziona" non basta: deve essere **corretto, ottimizzato, testato e manutenibile**.

## 1. Principi di progettazione (SOLID + clean code)

- **Single Responsibility**: ogni modulo/funzione/componente fa **una** cosa. Se un file cresce troppo o ha responsabilità miste, va spezzato.
- **Open/Closed**: estendi senza modificare. Es. `CalendarProvider` come astrazione, nuovi provider senza toccare i consumer.
- **Liskov / Interface Segregation**: interfacce piccole e mirate; nessun consumer dipende da metodi che non usa.
- **Dependency Inversion**: la logica di dominio dipende da **astrazioni** (interfacce/porte), non da implementazioni concrete (Prisma, Resend, Google). Inietta le dipendenze, non importarle a fondo nei service.
- **Layering netto**: `app/` (UI/routing) → `server/` (use case/service) → `lib/` (infrastruttura: prisma, auth, tenant). La UI **non** parla direttamente a Prisma: passa dai service. Le query vivono in funzioni dedicate riusabili, non sparse nei componenti.
- **DRY ma non astratto a vuoto**: estrai duplicazione reale; non creare astrazioni speculative (YAGNI).
- **Naming esplicito** in inglese; niente abbreviazioni oscure, niente "magic number/string" (usa costanti/enum/token).
- **Funzioni pure** dove possibile; effetti collaterali isolati e tracciabili.

## 2. TypeScript & correttezza

- `strict: true`. **Vietato `any`** (usa `unknown` + narrowing). Niente `as` non giustificato, niente `// @ts-ignore` senza commento che spiega il perché.
- Tipi inferiti da **Zod** ai confini (form, API in/out, env). Una sola fonte di verità per i tipi di dominio.
- **Validazione su ogni confine**: input utente, payload API, webhook, variabili d'ambiente (parse di `process.env` con Zod allo startup).
- Gestione errori esplicita: niente `catch` vuoti, niente errori inghiottiti. Errori di dominio tipizzati; messaggi all'utente localizzati e **non rivelatori**.
- Niente codice morto, niente `console.log` di debug nel commit, niente import inutilizzati. ESLint/Prettier devono passare puliti.

## 3. Database & query (ULTRA-OTTIMIZZATO)

- **Indici** su ogni colonna usata in `where`/`order by`/join frequenti; indici **composti** che rispecchiano i pattern reali (es. `@@index([organizationId, stage])`, `@@index([organizationId, stageChangedAt])`). Sempre prefissati da `organizationId` per il multi-tenant.
- **Zero N+1**: usa `include`/`select` mirati o `findMany` batch. Vietato ciclare query in loop. Verifica i piani query sospetti.
- **`select` esplicito**: recupera **solo** i campi che servono, mai `SELECT *` implicito su tabelle larghe; mai rimandare al client campi sensibili (`passwordHash`, token).
- **Paginazione obbligatoria** su liste (cursor-based dove sensato); mai `findMany` illimitato su tabelle che crescono.
- **Transazioni** (`$transaction`) per operazioni multi-step che devono essere atomiche (es. cambio stage + `StageHistory`, creazione lead + audit).
- **`Decimal`** per importi monetari (mai `float`). Date in UTC.
- **Conteggi/aggregati** lato DB (`count`, `groupBy`, `aggregate`), non in JS su grandi insiemi. KPI dashboard via query aggregate, non caricando tutti i record.
- **Constraint a livello DB**: `@@unique`, FK con `onDelete` corretto, `NOT NULL` dove dovuto. L'integrità non si delega solo all'app.
- **Isolamento tenant a livello dati** (Prisma extension che inietta `organizationId`); valuta RLS come seconda barriera. Migrazioni versionate, incrementali, **mai** editate dopo il merge.
- **Soft delete** (`deletedAt`) dove serve per audit/GDPR, con filtro di default.

## 4. API & server

- Ogni Route Handler / Server Action: **autenticazione → RBAC (`requirePermission`) → tenant context → validazione Zod → use case → risposta tipizzata**. Nessuno di questi step è opzionale.
- Output API tipizzato e validato; status code corretti (400/401/403/404/409/422/429/500). Errori in formato coerente.
- **Idempotenza** dove conta (webhook, retry); verifica firma webhook.
- Niente logica di business nei componenti React: sta nei service.

## 5. Testing (OGNI ENDPOINT TESTATO)

- **Vitest** (unit/integration): use case/service, validazioni Zod, util, RBAC, isolamento tenant (test **negativi** espliciti: tenant A non vede dati di tenant B; ruolo senza permesso → 403).
- **Ogni endpoint / Server Action ha test**: happy path **+** auth mancante **+** permesso negato **+** input invalido **+** isolamento cross-tenant. Un endpoint senza test non è "fatto".
- **Playwright** (e2e) sui flussi critici: login, creazione lead, spostamento stage (incl. **da tastiera**), filtri, KPI.
- **a11y**: smoke con axe (zero violazioni critiche) sui flussi chiave.
- Test **deterministici e veloci**, dati via factory/seed isolati, mai dati di produzione. In CI: lint + typecheck + Vitest sempre; Playwright sui flussi critici.
- Coverage significativa sulla logica di dominio (non vanity metric): se la copertura dei flussi critici è parziale, **non** è "fatto".

## 6. Accessibilità, i18n, responsive

- WCAG 2.1 AA reale (non overlay), tutto theme-driven via token, nessuno stile hard-coded.
- i18n IT+EN completa e allineata, nessuna stringa hard-coded, default IT.
- Mobile/tablet/desktop verificati.

## 7. Definition of Done (estende quella di CLAUDE.md)

Una feature è "fatta" **solo se** tutto quanto sotto è vero e **verificato** (evidenza, non asserzione):

- [ ] `pnpm lint` + `pnpm typecheck` verdi, zero warning nuovi
- [ ] SOLID/layering rispettati; nessun `any`/`@ts-ignore` ingiustificato
- [ ] Query ottimizzate: indici presenti, zero N+1, `select` mirati, paginazione, transazioni dove serve
- [ ] Isolamento tenant + RBAC verificati con test negativi
- [ ] **Ogni endpoint/azione coperto da test** (happy + auth + permesso + invalid + cross-tenant); Vitest verde
- [ ] e2e dei flussi critici toccati verdi; axe senza violazioni critiche
- [ ] i18n IT/EN completa, nessuna stringa hard-coded; responsive ok
- [ ] Migrazione versionata e applicata; `docs/` aggiornati se lo schema/contratto è cambiato

> Regola d'oro: **non dichiarare "fatto" senza prova**. Esegui i comandi, mostra l'output. In dubbio, scegli l'opzione più corretta/sicura e annotala — non la più rapida.
