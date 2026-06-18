# 08 — Roadmap di implementazione

Implementare per **fasi verticali** (ogni fase rilascia valore utilizzabile e testabile). Claude Code dovrebbe completare e verificare una fase prima di passare alla successiva, seguendo la Definition of Done in `CLAUDE.md`.

## Fase 0 — Fondamenta
- Scaffold Next.js (App Router, TS strict), Tailwind, shadcn/ui.
- Prisma + Postgres locale; schema iniziale (`03-modello-dati.md`); prima migrazione.
- Sistema **token/tema** via CSS variables + 1 preset (Indigo) — base del design system.
- Layout app (sidebar collassabile, header, drawer mobile).
- **i18n** (next-intl) con messaggi IT + EN sin dall'inizio: ogni stringa passa dai file di messaggi.
- CI (lint, typecheck, test) + deploy Vercel + DB Neon EU + `.env.example`.

## Fase 1 — Auth e tenant
- Auth.js: register (con reCAPTCHA + consensi), login, verify email, reset, change password.
- Modello `Organization` + tenant context + isolamento (Prisma extension).
- RBAC (capability + `requirePermission`), ruoli `superAdmin/proUser/baseUser`.
- Seed: superAdmin + tenant **Fabio** (proUser) con `featureFlags.calendar=false`.
- Pagine legali (privacy/cookie policy) + cookie banner + registrazione consensi.

## Fase 2 — Lead core
- CRUD Lead + lista **"I miei lead"** (ricerca, filtri periodo, ordinamento giorni, tab per stato).
- **Dettaglio lead**: contatto, **specchietto Capitale** (enum fasce), note (CRUD), scheda riassuntiva, aggiornamento dati (external ref).
- Cambio stage + `stageChangedAt` + `StageHistory`; motivo di perdita su `LOST`.

## Fase 3 — Pipeline kanban
- Board con stage configurabili, conteggi, card lead, drag & drop con persistenza + **alternativa da tastiera** (accessibilità).
- Config pipeline: **mostra/nascondi stage**, ordinamento, colori; vincoli su stage terminali e stage con lead.
- Filtro periodo coerente.

## Fase 4 — Dashboard
- KPI (totali, vinte, perse, conv. rate, fatturato netto) con filtro mese/anno.
- Distribuzione pipeline, riepilogo fatture, vendite perse (per motivo), lista lead attivi ordinata per giorni.
- **Fatture**: CRUD minimo (alimenta fatturato netto).

## Fase 5 — Appuntamenti
- Pagina appuntamenti (filtri Tutti/Da fare/Fatti), CRUD, collegamento a lead.
- **Mini-calendario** in sidebar (vista mese, evidenzia giorni con appuntamenti).
- *(Per Fabio ci si ferma qui: niente integrazioni.)*

## Fase 6 — Integrazioni calendario (modulo opzionale)
- Astrazione `CalendarProvider`.
- **Google Calendar** OAuth + sync bidirezionale; token cifrati.
- **Calendly** connect + webhook import appuntamenti, match per email.
- Feature flag per tenant.

## Fase 7 — Area superAdmin e white-label
- Gestione tenant (crea/configura organization, feature flag, utenti).
- **Pannello personalizzazione** tema (live preview, validazione contrasto), preset palette, nome/logo, raggi, tipografia.
- Metriche globali.

## Fase 8 — Hardening e compliance finale
- Security headers/CSP, rate limiting, audit log completo, export/erasure GDPR.
- Audit accessibilità (WCAG AA) e responsive su mobile/tablet.
- Test e2e sui flussi critici; Sentry + uptime.

---

## Configurazione tenant "Fabio Cignoni"

Al seed/onboarding di Fabio:
- Ruolo utente: **`proUser`**.
- **Utente singolo**: Fabio lavora da solo, nessun team. Non servono `baseUser` collaboratori nel suo tenant; l'ownership dei lead può essere implicita (tutti i lead appartengono a lui). Mantenere comunque `ownerId` nel modello per i tenant futuri con team.
- `appName`: da concordare (default "CRM Finanza").
- **Tema: modalità chiara (light) di default**, sidebar **chiara** (come il wireframe). Preset colore Indigo (`#5b5bd6`). Fabio può cambiarlo dal pannello "Aspetto & brand".
- **Lingua**: italiano di default (la UI è bilingue IT/EN, vedi sotto).
- **Feature flags**: tutte attive **tranne il Calendario/integrazioni** → `{ leads:true, pipeline:true, dashboard:true, appointments:true, invoices:true, calendarIntegrations:false }`.
- Stage pipeline: tutti e 9 visibili di default (Fabio può poi nasconderne alcuni).
- Dati di esempio: i lead degli screenshot (Annalisa Giobbio, Andrea Carapezza, Fabrizio Checchi) per validare la UI.

## Decisioni confermate dal committente
1. **Wireframe**: ✅ ricevuto e integrato in `05-design-system.md` (font Bebas Neue + Montserrat + IBM Plex Mono, token, pannello white-label).
2. **Lingua**: ✅ piattaforma **bilingue Italiano + Inglese** sin da subito. Vedi §i18n sotto. Default IT per Fabio.
3. **Conv. rate**: ✅ formula `Vinte / Lead totali del periodo`.
4. **Multi-utente**: ✅ Fabio è **utente singolo** (no team). `ownerId` resta nel modello per i tenant futuri.
5. **Tema Fabio**: ✅ **chiaro (light), sidebar chiara**, preset Indigo.

## Questioni aperte residue
- **Fatture**: il committente non ha ancora requisiti precisi. **Default proposto** (da validare con Fabio): CRUD minimo con `number` (opzionale), `grossAmount`, `netAmount`, `issuedAt`, collegata al lead vinto; il `netAmount` alimenta il "Fatturato netto". Nessuna generazione PDF né numerazione automatica in questa fase — aggiungibili dopo se servono.
- **Nome piattaforma** definitivo per Fabio (default provvisorio "CRM Finanza").

## i18n (Italiano + Inglese)

- Libreria: **next-intl** (o `next-i18next`) con App Router. Locale di default **`it`**, secondo locale **`en`**.
- Tutte le stringhe UI in file di messaggi (`messages/it.json`, `messages/en.json`); **nessuna stringa hard-coded**.
- Le label delle enum (stage, fasce capitale, stati appuntamento) sono mappate per locale nel layer i18n, non nel DB.
- Selettore lingua nel profilo utente; preferenza salvata su `User`. Possibile default lingua anche a livello tenant.
- Formattazione date/numeri/valuta localizzata (`Intl`), valuta € per entrambi i locale.
- Routing: prefisso locale (`/it/...`, `/en/...`) o detection da preferenza utente — scelta a discrezione dell'implementazione, purché SSR-friendly.
