# Subagent di CustomerSpeed

Agenti specializzati per Claude Code, tarati sullo stack del progetto (Next.js App Router + TypeScript strict + Prisma/PostgreSQL + Auth.js + Tailwind/shadcn + next-intl). Claude Code li seleziona automaticamente in base alla `description`, oppure puoi invocarli esplicitamente.

| Agente | Quando usarlo |
|---|---|
| **nextjs-fullstack-engineer** | Builder di default: implementa feature end-to-end seguendo la roadmap. |
| **prisma-multitenant-architect** | Schema Prisma, migrazioni, seed, isolamento tenant (extension/RLS). |
| **auth-security-gdpr-engineer** | Auth.js, RBAC, reCAPTCHA, security headers/CSP, cifratura, GDPR/consensi. |
| **design-system-a11y-engineer** | Design system theme-driven, white-label, WCAG/EAA, responsive, kanban accessibile. |
| **i18n-engineer** | next-intl IT/EN, estrazione stringhe, label enum/liste, formattazione. |
| **qa-test-engineer** | Vitest + Playwright sui flussi critici; step di verifica di fine feature. |
| **tenant-isolation-reviewer** | Revisore read-only: isolamento cross-tenant e RBAC prima di chiudere una PR. |

## Flusso consigliato per feature
1. `nextjs-fullstack-engineer` implementa (coinvolge `prisma-multitenant-architect`, `auth-security-gdpr-engineer`, `design-system-a11y-engineer`, `i18n-engineer` secondo necessità).
2. `qa-test-engineer` aggiunge/esegue i test sui flussi critici.
3. `tenant-isolation-reviewer` fa la revisione di sicurezza prima del merge.

I `docs/` restano la fonte di verità: gli agenti li leggono prima di agire.

## Standard di qualità (NON NEGOZIABILE)
Ogni agente applica **`docs/00-standard-qualita.md`**: SOLID + layering netto, TypeScript `strict` senza `any`, **DB ultra-ottimizzato** (indici composti, zero N+1, `select` mirati, paginazione, transazioni, aggregati lato DB), **ogni endpoint/azione testato** (happy + auth + permesso + input invalido + cross-tenant). Nessun agente dichiara "fatto" senza prova (lint/typecheck/test eseguiti, output mostrato).
