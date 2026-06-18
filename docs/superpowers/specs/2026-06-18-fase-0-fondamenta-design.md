# Fase 0 — Fondamenta · Design / Spec

> Spec d'implementazione della Fase 0 della roadmap (`docs/08-roadmap.md`). I `docs/` 00–09 restano la fonte di verità; questo file fissa le **decisioni concrete** e i confini di consegna della fase. Standard di qualità vincolante: `docs/00-standard-qualita.md`.

## Obiettivo

Scaffold funzionante e verificabile: `pnpm dev` parte, DB migrato, tema theme-driven applicato, layout app navigabile, i18n IT/EN attiva. Base solida e pulita su cui costruire le fasi 1–8. Nessuna logica di prodotto ancora (lead, auth reale, ecc.).

## Decisioni confermate

- **Package manager**: pnpm.
- **Next.js**: ultima stabile (15.x), App Router, TypeScript `strict`.
- **appName** tenant demo: **CustomerSpeed**.
- **i18n**: next-intl, locale `it` (default) + `en`, **`localePrefix: 'as-needed'`** (it senza prefisso, `/en/...` per inglese) con middleware.
- **DB locale**: `docker-compose.yml` con **PostgreSQL 16**.
- **UI**: Tailwind CSS + shadcn/ui (Radix), utility agganciate alle CSS variables del tema.
- **Subagent**: data layer → `prisma-multitenant-architect`; design system/layout → `design-system-a11y-engineer`; i18n → `i18n-engineer`; orchestrazione/scaffold/CI → `nextjs-fullstack-engineer`; verifica → `qa-test-engineer` + `tenant-isolation-reviewer`.

## Struttura cartelle (target Fase 0)

Come da `docs/01` §1.4: `src/app/(marketing|auth|app|admin)`, `src/components`, `src/features`, `src/lib`, `src/server`, `src/styles`, `src/i18n`, `prisma/`, `tests/`, `messages/`.

## Unità di lavoro

### A. Scaffold & toolchain (`nextjs-fullstack-engineer`)
- App Next.js 15 + TS strict, ESLint + Prettier, `pnpm` scripts (`dev/build/lint/typecheck/test/test:e2e`).
- Vitest configurato (+ `@testing-library` per componenti) e Playwright inizializzato.
- `src/lib/env.ts`: parse di `process.env` con **Zod** allo startup (fail-fast). `.env.example` allineato.
- `docker-compose.yml` (Postgres 16) + README "come avviare in locale".

### B. Data layer (`prisma-multitenant-architect`)
- `prisma/schema.prisma` con lo **schema completo** di `docs/03` (entità + enum + indici composti `organizationId`-first).
- Prima migrazione `init`. `src/lib/prisma.ts` (singleton).
- **Prisma Client extension** scheletro per iniezione `organizationId` + `src/lib/tenant.ts` (`getTenantContext()` placeholder, completato in Fase 1).
- `prisma/seed.ts`: in Fase 0 crea solo tenant demo **CustomerSpeed** (tema Indigo, feature flags, sorgenti default Funnel/Instagram/Referenza/Google, `PipelineStageConfig` per i 9 stage). superAdmin/Fabio + hashing password → Fase 1.
- Qualità DB: vedi `docs/00` §3 (indici, zero N+1, `select` mirati, `Decimal`, constraint reali).

### C. Design system & tema (`design-system-a11y-engineer`)
- `src/styles/tokens.css`: tutti i token di `docs/05` su `:root` (colori, tipografia Bebas Neue + Montserrat + IBM Plex Mono via next/font, `--radius`, ombre, `--sidebar`, token stage).
- Preset **Indigo** come oggetto tema completo; funzione server che inietta `Organization.theme` (JSON) come CSS vars (style inline su `<html>`/provider) — niente FOUC.
- Tailwind config che mappa le utility sulle CSS variables.
- Primitivi accessibili minimi: Button, Card, Input+Label, Pill di stato. Tipizzati, theme-driven, con test di render/a11y.

### D. Layout app (`design-system-a11y-engineer` + `nextjs-fullstack-engineer`)
- Sidebar collassabile (chiara, 248px) + header + drawer mobile (hamburger), landmark `nav/main/aside`, focus ring, `aria-current`, `prefers-reduced-motion`.
- Voci nav placeholder: Dashboard, Pipeline, Lead, Appuntamenti, Settings. Pagine placeholder per non rompere il routing.

### E. i18n (`i18n-engineer`)
- next-intl + middleware (`as-needed`), `src/i18n/`, `messages/it.json` + `messages/en.json` con le stringhe di layout/nav.
- Map enum→label (LeadStage, CapitalBracket, AppointmentStatus) impostata nel layer i18n (riempita man mano).

### F. CI (`nextjs-fullstack-engineer` + `qa-test-engineer`)
- GitHub Actions: `lint` + `typecheck` + `vitest` su ogni push/PR; job Playwright predisposto. Deploy Vercel + DB Neon EU documentati in `docs/07` (azione manuale dell'utente; nessun segreto nel repo).

## Fuori scope (fasi successive)
Auth reale, RBAC enforcement, seed superAdmin/Fabio con password, CRUD lead, kanban, dashboard, appuntamenti, white-label panel, integrazioni calendario.

## Definition of Done (Fase 0)
- [ ] `pnpm dev` avvia l'app; home in `/` (it) e `/en` mostra il layout con tema Indigo applicato
- [ ] `pnpm build`, `pnpm lint`, `pnpm typecheck` verdi
- [ ] `docker-compose up -d` + `pnpm prisma migrate dev` applicano lo schema; `pnpm prisma db seed` crea il tenant demo
- [ ] Tutti i token via CSS variables, **nessuno stile hard-coded**; nessuna stringa hard-coded (IT/EN presenti)
- [ ] Sidebar collassabile + drawer mobile accessibili da tastiera; responsive base mobile/tablet/desktop
- [ ] Vitest+Playwright configurati con almeno uno smoke test verde per ciascuno; CI verde
- [ ] `env.ts` valida le variabili allo startup; `.env.example` allineato
- [ ] Conforme a `docs/00-standard-qualita.md` (SOLID/layering, niente `any`)
