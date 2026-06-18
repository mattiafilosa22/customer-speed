# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Questo file orienta Claude Code (o qualsiasi sviluppatore) durante l'implementazione. **Leggi prima `README.md` e i documenti in `docs/`**, poi segui queste regole operative.

## Stato del repository (importante)

Allo stato attuale **questo repo contiene solo documentazione** — nessun codice, `package.json`, `prisma/` o `src/` esistono ancora. Non ci sono quindi comandi di build/lint/test da eseguire: vanno creati durante la **Fase 0** della roadmap (scaffold Next.js). Quando scaffoldi, usa i comandi standard dello stack qui sotto e aggiorna questo file con i comandi reali del progetto.

Comandi attesi una volta scaffoldato (App Router + Prisma + Vitest/Playwright):
- `pnpm dev` / `pnpm build` — Next.js
- `pnpm lint` / `pnpm typecheck` — ESLint + `tsc --noEmit`
- `pnpm test` (Vitest unit) · `pnpm test -- <file>` per un singolo test · `pnpm test:e2e` (Playwright)
- `pnpm prisma migrate dev` · `pnpm prisma db seed` (crea superAdmin + tenant Fabio)

## Cosa stai costruendo

Un CRM SaaS **multi-tenant** per consulenti finanziari, white-label e personalizzabile. Vedi `docs/01-architettura.md` per il quadro completo. Implementa seguendo la roadmap in `docs/08-roadmap.md`, una fase alla volta.

## Dove guardare (mappa documentazione)

I `docs/` sono la fonte di verità: leggi il documento pertinente **prima** di implementare una feature.

| Per capire… | Leggi |
|---|---|
| **Standard di qualità (SOLID, DB ottimizzato, test su ogni endpoint)** | `docs/00-standard-qualita.md` |
| Stack, multi-tenancy, struttura cartelle, ambienti | `docs/01-architettura.md` |
| Ruoli e matrice RBAC, feature in dettaglio | `docs/02-specifiche-funzionali.md` |
| Schema Prisma, entità, enum, isolamento tenant | `docs/03-modello-dati.md` |
| Contratti endpoint REST, validazione | `docs/04-api.md` |
| Token di tema, theming white-label, WCAG, responsive | `docs/05-design-system.md` |
| Auth.js, RBAC, reCAPTCHA, GDPR | `docs/06-auth-sicurezza-gdpr.md` |
| Vercel, DB gestito, CI/CD | `docs/07-deployment-hosting.md` |
| Ordine di implementazione + config tenant "Fabio" | `docs/08-roadmap.md` |
| Aspetti legali/commerciali, DPA, cookie | `docs/09-compliance-vendita.md` |

## Architettura (concetti chiave che attraversano più file)

- **Multi-tenant single-DB, isolamento per riga**: ogni entità ha `organizationId`. Il filtro va **forzato a livello dati** (Prisma Client extension che inietta `organizationId`), non solo applicativo — un errore di sviluppo non deve causare fuga di dati cross-tenant. Valutare RLS PostgreSQL come seconda barriera. Il modello `Organization` ha `slug` e `customDomain` predisposti per il routing per sottodominio futuro.
- **`superAdmin` opera cross-tenant** tramite un contesto amministrativo separato (`(admin)/`), distinto dal tenant context degli altri ruoli.
- **White-label runtime**: nome app (`Organization.appName`), palette, raggi, tipografia sono dati di configurazione per tenant, applicati via **CSS custom properties** — mai hard-coded. Vedi `docs/05`.
- **Feature flag per tenant** abilitano/disabilitano interi moduli (es. `calendarIntegrations:false` per Fabio).
- **Fasi verticali**: ogni fase della roadmap rilascia valore testabile end-to-end; completa e verifica una fase prima della successiva.
- **i18n bilingue (next-intl)**, default `it`: tutte le stringhe in `messages/it.json` + `messages/en.json`. Le label delle enum (stage, fasce capitale) sono mappate nel layer i18n, **non** nel DB.

## Stack e vincoli tecnici

- **Next.js** ultima versione stabile, **App Router**, TypeScript `strict`.
- **Prisma** ORM + **PostgreSQL**.
- **Auth**: Auth.js (NextAuth v5) con credentials + (opzionale) OAuth Google. Vedi `docs/06-auth-sicurezza-gdpr.md`.
- **UI**: Tailwind CSS + componenti headless accessibili (Radix UI o shadcn/ui). Tutto il tema passa da **CSS custom properties** (vedi `docs/05-design-system.md`). **Niente colori/raggi/font hard-coded**: sempre via token.
- **Validazione**: Zod su tutti i confini (form, API input/output).
- **Stato server**: React Server Components + Server Actions dove sensato; TanStack Query per stato client dove serve (es. kanban drag&drop ottimistico).
- **Test**: Vitest (unit), Playwright (e2e sui flussi critici: login, creazione lead, spostamento stage).

## Principi non negoziabili

1. **Isolamento tenant**: ogni query passa per `organizationId`. Mai esporre dati cross-tenant. Usa un helper centrale (es. `getTenantContext()`); considera Prisma extension o middleware per forzare il filtro.
2. **RBAC server-side**: i permessi si verificano sul server ad ogni richiesta, non solo nascondendo bottoni nella UI. Vedi matrice in `docs/02-specifiche-funzionali.md`.
3. **Accessibilità (WCAG 2.1 AA)**: contrasto, focus visibile, navigazione da tastiera, label/aria, drag&drop con alternativa da tastiera.
4. **Responsive**: mobile-first, breakpoint tablet e desktop. La sidebar collassa su mobile.
5. **Feature flag per tenant**: ogni feature (es. Calendario) è attivabile/disattivabile per tenant. Per Fabio il **Calendario è disattivato** (vedi `docs/08-roadmap.md`).
6. **GDPR by design**: consensi, minimizzazione dati, export/cancellazione, audit. Vedi `docs/06`.

## Convenzioni

- UI in **italiano**, codice/identificatori in **inglese**.
- Commit piccoli e atomici; un PR per feature.
- Niente segreti nel repo: tutto in env (`.env.example` documentato).
- Migrazioni Prisma versionate e mai modificate a posteriori.

## Definition of Done per ogni feature

- [ ] Funziona per i ruoli previsti (test manuale + e2e sul flusso critico)
- [ ] Isolamento tenant verificato
- [ ] Accessibile da tastiera, contrasto AA, screen-reader labels
- [ ] Responsive (mobile/tablet/desktop)
- [ ] Validazione input lato server con Zod
- [ ] Stringhe UI centralizzate in file di messaggi **IT + EN** (next-intl), nessun testo hard-coded, default IT
