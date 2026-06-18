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
