# CLAUDE.md — Guida per l'implementazione

Questo file orienta Claude Code (o qualsiasi sviluppatore) durante l'implementazione. **Leggi prima `README.md` e i documenti in `docs/`**, poi segui queste regole operative.

## Cosa stai costruendo

Un CRM SaaS **multi-tenant** per consulenti finanziari, white-label e personalizzabile. Vedi `docs/01-architettura.md` per il quadro completo. Implementa seguendo la roadmap in `docs/08-roadmap.md`, una fase alla volta.

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
