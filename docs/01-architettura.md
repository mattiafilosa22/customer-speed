# 01 — Overview e architettura

## 1.1 Obiettivo

CRM web il cui scopo principale è **facilitare la gestione dei lead** di un consulente finanziario: tracciare ogni contatto lungo una pipeline, misurarne la conversione e gestire gli appuntamenti. Il software è un **prodotto commerciale white-label**: lo stesso codice serve più clienti (tenant), ognuno con la propria configurazione di stile e di feature.

## 1.2 Stack tecnologico

| Livello | Tecnologia | Note |
|--------|-----------|------|
| Frontend + Backend | **Next.js (App Router), TypeScript strict** | Full-stack: UI in React Server/Client Components, logica server in Route Handlers e Server Actions |
| ORM | **Prisma** | Migrazioni versionate |
| Database | **PostgreSQL** | Gestito (Neon/Supabase) in produzione |
| Auth | **Auth.js (NextAuth v5)** | Credentials + OAuth Google opzionale |
| UI/Styling | **Tailwind CSS** + **shadcn/ui** (Radix) | Tema via CSS variables |
| Validazione | **Zod** | Stesso schema lato client e server |
| Stato client | **TanStack Query** + Zustand (se serve) | Per kanban e interazioni ottimistiche |
| Email transazionali | **Resend** (o SMTP) | Reset password, inviti, notifiche |
| Test | **Vitest** + **Playwright** | Unit + e2e flussi critici |
| Hosting | **Vercel** + DB gestito | Vedi `07-deployment-hosting.md` |

Motivazione dello stack unificato TS: un solo linguaggio e un solo runtime semplificano sviluppo e deploy, accelerano l'iterazione con Claude Code ed evitano di mantenere due codebase. Si adatta naturalmente a un SaaS multi-tenant su Vercel.

## 1.3 Architettura multi-tenant

Modello: **single database, shared schema, isolamento per riga**.

- Ogni entità di dominio ha una colonna `organizationId` (FK a `Organization`).
- Ogni richiesta autenticata risolve il **tenant context** (organization dell'utente) e **tutte** le query sono filtrate per `organizationId`.
- Un utente appartiene a una sola organization (per ora). Lo `superAdmin` può operare cross-tenant tramite un contesto amministrativo separato.
- L'isolamento va forzato a livello dati, non solo applicativo: usare un **Prisma Client extension** che inietta automaticamente il filtro `organizationId` nelle query del tenant, così un errore di sviluppo non causa fuga di dati. In aggiunta valutare **Row Level Security (RLS)** di PostgreSQL come seconda barriera (specialmente se in futuro si separano i ruoli DB).

```
┌─────────────────────────────────────────────┐
│                  Vercel                       │
│   Next.js (App Router) — UI + API + Auth      │
│        │ Prisma (con tenant filter)           │
└────────┼──────────────────────────────────────┘
         │
   ┌─────▼─────────┐     ┌──────────────┐
   │ PostgreSQL    │     │ Servizi est. │
   │ (Neon/Supabase)│    │ Google Cal., │
   │ multi-tenant   │    │ Calendly,    │
   └───────────────┘     │ reCAPTCHA,   │
                         │ Resend       │
                         └──────────────┘
```

### Risoluzione del tenant
Per Fabio (e i primi clienti) si usa un **dominio/condivisione semplice**: un solo dominio applicativo, il tenant è determinato dall'utente loggato. In prospettiva si può aggiungere routing per **sottodominio** (`fabio.tuoprodotto.it`) o dominio custom; predisporre il modello `Organization` con campi `slug` e `customDomain` fin da subito per non dover migrare.

## 1.4 Struttura del progetto (proposta)

Monorepo singola app Next.js (no Turborepo necessario all'inizio):

```
/
├── docs/                      # questa documentazione
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                # crea superAdmin, tenant demo, Fabio
├── src/
│   ├── app/
│   │   ├── (marketing)/       # landing pubblica + privacy/cookie policy
│   │   ├── (auth)/            # login, register, reset, verify
│   │   ├── (app)/             # area autenticata
│   │   │   ├── dashboard/
│   │   │   ├── pipeline/
│   │   │   ├── leads/
│   │   │   │   └── [leadId]/  # dettaglio lead
│   │   │   ├── appointments/
│   │   │   └── settings/      # profilo, tema, feature flag (admin)
│   │   ├── (admin)/           # area superAdmin: gestione tenant/utenti
│   │   └── api/               # Route Handlers
│   ├── components/            # UI riusabile (design system)
│   ├── features/              # logica per dominio (leads, pipeline, ...)
│   ├── lib/                   # auth, prisma, tenant, rbac, validation
│   ├── server/                # server actions, services
│   ├── styles/                # tokens.css, theme
│   └── i18n/                  # stringhe (it default)
├── tests/                     # e2e Playwright
├── .env.example
└── ...
```

## 1.5 Ambienti

- **local** — sviluppo, Postgres in Docker (compose facoltativo per il DB locale).
- **preview** — deploy automatici Vercel per ogni PR, DB di staging (branch Neon).
- **production** — Vercel + DB gestito.

Variabili principali (dettaglio in `06` e `07`): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `CALENDLY_*`, `RESEND_API_KEY`.

## 1.6 Domini e nomi

Il **nome della piattaforma** è un dato di configurazione del tenant (`Organization.appName`), non hard-coded. Negli screenshot di riferimento appare "CRM Finanza"; deve essere sovrascrivibile.
