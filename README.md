# CustomerSpeed — Documentazione di prodotto

> **CustomerSpeed** è un **CRM personalizzabile e multi-tenant**, pensato come prodotto da rivendere (white-label). Questo repository contiene la documentazione tecnico-funzionale per l'implementazione. Primo cliente: **Fabio Cignoni** (consulente finanziario, ruolo `proUser`).
>
> Nota sul naming: **CustomerSpeed** è il brand del prodotto. Il nome mostrato in-app è configurabile per ogni tenant (`Organization.appName`): per Fabio può restare "CustomerSpeed" o un nome a sua scelta.

Questo repository contiene **solo documentazione**. È pensato per essere passato a **Claude Code** (o a uno sviluppatore) per implementare il prodotto. Ogni documento è autosufficiente ma collegato agli altri.

---

## Sintesi del prodotto

Un CRM web per consulenti finanziari il cui obiettivo principale è **facilitare la gestione dei lead**: dalla prima presa in carico fino alla conversione in cliente (o alla perdita), con dashboard di sintesi, pipeline kanban, gestione lead, dettaglio lead arricchito e gestione appuntamenti/calendario.

Il prodotto è **white-label e personalizzabile**: nome piattaforma, palette colori, raggi dei bottoni, tipografia e altri token di stile sono configurabili per ogni cliente (tenant).

## Decisioni chiave (concordate)

| Tema | Scelta |
|------|--------|
| **Stack** | TypeScript unificato — **Next.js (App Router) full-stack** + Prisma + PostgreSQL |
| **Multi-tenancy** | **SaaS multi-tenant unico**: un deployment, un database, isolamento per `organizationId` |
| **Calendario** | **Google Calendar + Calendly**, come moduli opzionali attivabili per tenant |
| **Hosting (Fabio)** | **Vercel** + PostgreSQL gestito (Neon o Supabase) |
| **Ruoli** | `superAdmin`, `proUser`, `baseUser` |
| **Lingue** | Bilingue **Italiano + Inglese** (i18n), default IT |
| **Compliance** | WCAG 2.1 AA, GDPR (cookie/privacy policy, consensi), reCAPTCHA |

## Avvio in locale

Prerequisiti: **Node.js ≥ 20**, **pnpm 10**, **Docker** (per il database).

```bash
# 1. Installa le dipendenze
pnpm install

# 2. Configura l'ambiente (le credenziali DB combaciano con docker-compose.yml)
cp .env.example .env
# genera un secret per NextAuth: openssl rand -base64 32  -> NEXTAUTH_SECRET

# 3. Avvia PostgreSQL 16 in locale (porta host 5544 per non collidere con un Postgres sulla 5432)
docker compose up -d

# 4. Applica lo schema e i dati demo
pnpm db:deploy      # applica le migrazioni
pnpm db:seed        # tenant + utenti + dati di esempio

# 5. Avvia l'app in sviluppo
pnpm dev            # http://localhost:3000
```

Utenti seed (solo locale): **Fabio** `fabio@fabio.local` / `ChangeMe!Fabio123` · **superAdmin** `admin@customerspeed.local` / `ChangeMe!Admin123` (→ `/admin`).

### Test

```bash
pnpm test           # unit (Vitest) — non serve il DB

# e2e (Playwright): serve il DB su (3) + migrazioni+seed (4). Esporta le password
# del seed così il setup di login non viene saltato; Playwright avvia da solo il web server.
export SEED_FABIO_PASSWORD="ChangeMe!Fabio123"
export SEED_SUPERADMIN_PASSWORD="ChangeMe!Admin123"
pnpm test:e2e
```

### Script disponibili

| Script | Descrizione |
|--------|-------------|
| `pnpm dev` | Avvia Next.js in sviluppo |
| `pnpm build` / `pnpm start` | Build di produzione / avvio del build |
| `pnpm lint` | ESLint (flat config) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` / `pnpm test:watch` | Vitest (unit/component) |
| `pnpm test:e2e` | Playwright (e2e). Prima volta: `pnpm exec playwright install chromium` |
| `pnpm db:migrate` / `pnpm db:deploy` | Migrazioni Prisma (dev / prod) |
| `pnpm db:seed` | Seed dati demo |
| `pnpm db:studio` | Prisma Studio |

> Stack: Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Prisma 7 · Vitest 4 · Playwright 1.

## Hardening e compliance (Fase 8)

- **Security headers / CSP**: applicati dal middleware (`src/lib/security-headers.ts`). `script-src` con nonce + `strict-dynamic` (niente `unsafe-inline` sugli script), `upgrade-insecure-requests` in produzione, HSTS/Referrer-Policy/X-Frame/Permissions-Policy/X-Content-Type-Options. `style-src` mantiene `unsafe-inline` per gli stili inline del runtime Next (documentato; rischio residuo basso).
- **Rate limiting** (`src/lib/rate-limit.ts`): configurabile via `RATE_LIMIT_BACKEND` (`memory` default; `redis` predisposto dietro l'interfaccia `RateLimiter`). Disattivabile in test/e2e con `RATE_LIMIT_DISABLED=true` (più `E2E=true` per i build di produzione usati da Playwright). **In produzione reale il kill-switch è rifiutato allo startup** (fail-safe in `src/lib/env.ts`).
- **GDPR DSR** (`src/server/privacy/`): export (diritto di accesso/portabilità) ed erasure (diritto all'oblio, anonimizzazione reale) dei dati di un lead, tenant-scoped, gated da RBAC (`lead.exportData` / `lead.eraseData`) e tracciati in `AuditLog`. UI nel dettaglio lead.
- **Consenso cookie**: banner Garante + revoca dalla pagina Cookie Policy (`withdrawCookieConsentAction`), con proof of consent versionato (`Consent`).

### Checklist setup infra (da completare al deploy)

- [ ] **Sentry**: installare `@sentry/nextjs`, cablare `createReporter()` / `initObservability()` in `src/lib/observability.ts`, impostare `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`), `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ENVIRONMENT`. Senza DSN il layer è no-op (nessun crash). `src/instrumentation.ts` chiama già il bootstrap.
- [ ] **Uptime monitoring**: configurare un monitor esterno (es. Better Stack / UptimeRobot / Vercel) su un endpoint di health e sulla home; collegare gli alert a Sentry/Slack.
- [ ] **Rate limit distribuito**: se si scala oltre una singola istanza, implementare un `RateLimiter` su Upstash/Redis e impostare `RATE_LIMIT_BACKEND=redis` + `RATE_LIMIT_REDIS_URL`.
- [ ] **Region UE**: DB e hosting in region UE; documentare i sub-responsabili (Vercel, Neon/Supabase, Google, Calendly, Resend, Sentry) nel DPA (docs/09).
- [ ] **Backup DB** automatici + test di restore; **procedura data breach** (notifica 72h) e **ROPA**/retention documentati (docs/06 §6.5, docs/09 §9.6).

## Indice della documentazione

1. [Overview e architettura](docs/01-architettura.md) — stack, multi-tenancy, struttura del progetto, ambienti
2. [Specifiche funzionali](docs/02-specifiche-funzionali.md) — ruoli e tutte le feature in dettaglio
3. [Modello dati](docs/03-modello-dati.md) — schema Prisma, entità, enum, isolamento tenant
4. [API](docs/04-api.md) — endpoint REST, contratti, validazione
5. [Design system e tema](docs/05-design-system.md) — token, theming, palette suggerite, WCAG, responsive
6. [Auth, sicurezza e GDPR](docs/06-auth-sicurezza-gdpr.md) — autenticazione, RBAC, reCAPTCHA, compliance
7. [Deployment e hosting](docs/07-deployment-hosting.md) — Vercel, DB gestito, confronto costi, CI/CD
8. [Roadmap di implementazione](docs/08-roadmap.md) — fasi, milestone, configurazione tenant "Fabio"
9. [Compliance per la vendita](docs/09-compliance-vendita.md) — ruoli GDPR, DPA, documenti legali, cookie, EAA, aspetti commerciali

## Glossario rapido (IT/EN)

I termini di dominio nell'interfaccia sono in **italiano** (Lead, Vinta, Persa, Attesa decisione…). Gli identificatori nel codice (modelli, campi, enum) sono in **inglese**. La mappatura è in [docs/03-modello-dati.md](docs/03-modello-dati.md).

| UI (IT) | Codice (EN) |
|---------|-------------|
| Lead | `Lead` |
| Vinta | stage `WON` |
| Persa | stage `LOST` |
| Fatturato netto | `netRevenue` |
| Capitale | `capitalBracket` |
| Appuntamento | `Appointment` |
