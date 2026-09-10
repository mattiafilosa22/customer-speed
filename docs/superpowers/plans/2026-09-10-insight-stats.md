# Insight & Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il foglio Excel "Sponsorizzate Instagram" (tab Chat) con una sezione del CRM in cui i volumi di messaggi si digitano a mano e le colonne Appuntamenti/Vendite sono calcolate dalle entità reali (Lead, Appointment, StageHistory) e interattive.

**Architecture:** Una riga per giorno per tenant (`ChatActivityDay`) conserva i sei contatori manuali e, per il solo periodo precedente all'attivazione, i conteggi congelati importati dall'Excel. Le colonne derivate del periodo vivo sono aggregate DB-side a ogni lettura (mai materializzate) filtrando i lead per provenienza collegata al tenant e canale di chat. La UI è un mese alla volta: celle bianche modificabili inline, celle calcolate cliccabili che aprono la creazione di un lead o l'elenco dei lead sottostanti.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 + PostgreSQL, Zod, next-intl (it/en), Tailwind 4 + Radix, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-insight-stats-design.md`

## Global Constraints

- **Isolamento tenant**: ogni use case riceve `TenantPrismaClient` (`getTenantPrisma(ctx)`), mai il client base. Ogni test di endpoint include un caso cross-tenant.
- **Standard di qualità**: `docs/00-standard-qualita.md`. Aggregati DB-side, zero N+1, `select` mirati, indici compositi con `organizationId` in testa.
- **Niente duplicazione**: riusare le funzioni esistenti prima di scriverne di nuove. In particolare `periodRange` (`src/server/dashboard/period.ts`), `parseInput` (`src/server/validation.ts`), `getShellBranding`, i componenti in `src/components/ui`, i pattern `deps.ts`/`context-deps.ts`/`test-helpers.ts` di `src/server/leads`.
- **Niente sovraingegnerizzazione**: nessuna astrazione speculativa. La cosa più semplice che soddisfi lo standard.
- **Nomi parlanti**: variabili e funzioni descrivono il dominio (`appointmentsByDayAndChannel`, non `res`/`data2`).
- **Date**: intervalli UTC semiaperti `[gte, lt)`, convenzione già in vigore (docs/00 §3). Nessuna nuova convenzione di fuso.
- **i18n**: ogni stringa in `messages/it.json` + `messages/en.json`, default IT. Le label delle enum stanno nel layer i18n, mai nel DB.
- **RBAC server-side** su ogni pagina, Server Action e Route Handler. Feature flag verificato server-side.
- **Fuori perimetro v1**: esportazione, grafici di andamento, confronto mesi affiancati, vista annuale.

## File Structure

**Schema e migrazione**
- `prisma/schema.prisma` — enum `ChatChannel`, campi su `Lead`/`Organization`, modello `ChatActivityDay`, indice su `StageHistory`.
- `prisma/migrations/<timestamp>_insight_stats/migration.sql` — migrazione additiva.

**Dominio (`src/server/insight/`)** — un file per responsabilità, stesso stile di `src/server/dashboard/`:
- `deps.ts` — `InsightDeps` (prisma tenant, actor, audit, clock).
- `context-deps.ts` — costruzione deps dal `TenantContext`.
- `config.ts` — `getInsightConfig`: provenienza collegata + data di attivazione del tenant.
- `schemas.ts` — schemi Zod (mese, contatori manuali, creazione da cella).
- `channels.ts` — costanti e raggruppamento canali (`OUTBOUND_CHANNELS`, `channelGroupOf`).
- `get-activity-days.ts` — lettura righe manuali/archivio del mese.
- `get-appointment-counts.ts` — appuntamenti derivati per giorno e canale.
- `get-sale-counts.ts` — vendite derivate per giorno e canale.
- `get-month-view.ts` — assemblaggio mese + totali + tassi + non attribuiti.
- `totals.ts` — funzioni pure: somme di colonna e tassi di conversione.
- `save-activity-day.ts` — upsert dei contatori manuali.
- `create-lead-from-cell.ts` — lead + appuntamento in transazione.
- `list-cell-leads.ts` — drill-down dei lead dietro una cella.
- `index.ts` — barrel.
- `test-helpers.ts` — store in-memory dedicato.

**UI**
- `src/app/[locale]/(app)/insight/page.tsx` — Server Component, guardia flag + capability.
- `src/app/[locale]/(app)/insight/actions.ts` — Server Actions.
- `src/components/insight/activity-table.tsx` — tabella desktop/tablet.
- `src/components/insight/activity-day-cards.tsx` — vista telefono.
- `src/components/insight/manual-cell.tsx` — cella numerica con salvataggio all'uscita.
- `src/components/insight/derived-cell.tsx` — cella calcolata cliccabile + tooltip.
- `src/components/insight/cell-leads-popover.tsx` — elenco lead dietro una cella.
- `src/components/insight/new-lead-from-cell-dialog.tsx` — dialogo lead + appuntamento.
- `src/components/insight/month-nav.tsx` — navigazione mese.
- `src/components/insight/insight-kpis.tsx` — cinque riquadri KPI.
- `src/components/insight/unattributed-notice.tsx` — avviso lead senza canale.

**Modifiche a file esistenti**
- `src/lib/feature-flags.ts` — flag `insightStats`.
- `src/lib/rbac.ts` — capability `insight.view` / `insight.edit`.
- `src/components/layout/nav-items.ts` — voce di menu con label dinamica.
- `src/server/organization/get-shell-branding.ts` — label della provenienza collegata.
- `src/server/leads/schemas.ts`, `create-lead.ts`, `update-lead.ts` — campo `chatChannel`.
- `src/components/leads/new-lead-dialog.tsx`, `edit-lead-dialog.tsx` — select canale.
- `src/server/admin/schemas.ts`, `update-organization.ts`, `src/components/admin/feature-flags-form.tsx` — configurazione per tenant.
- `messages/it.json`, `messages/en.json`.

**Script**
- `scripts/import-insight-history.ts` + voce `db:import-insight` in `package.json`.

**E2E**
- `tests/e2e/insight.spec.ts`.

---

### Task 1: Schema e migrazione

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_insight_stats/migration.sql` (generata da Prisma)
- Test: nessun test unitario — la verifica è `prisma validate` + `prisma migrate dev`

**Interfaces:**
- Consumes: niente.
- Produces: enum `ChatChannel` (`WELCOME` | `OUTBOUND_COMMENT` | `OUTBOUND_STORY` | `INBOUND`); `Lead.chatChannel: ChatChannel | null`; `Lead.createdFromInsight: boolean`; `Organization.insightSourceId: string | null`; `Organization.insightActiveFrom: Date | null`; modello `ChatActivityDay` con i campi elencati sotto.

- [ ] **Step 1: Aggiungere l'enum in `prisma/schema.prisma`**

Subito dopo `enum CapitalBracket`:

```prisma
/// Canale della conversazione Instagram da cui nasce il lead (docs/superpowers/specs/2026-09-10-insight-stats-design.md).
/// WELCOME  = il consulente scrive per primo.
/// OUTBOUND = il consulente scrive a chi ha reagito a un'esca (commento o storia).
/// INBOUND  = è il potenziale cliente a scrivere per primo.
/// Commento e storia restano distinti: nella tabella condividono le colonne
/// Appuntamenti/Vendite, ma il dato più fine non si recupera se si butta.
enum ChatChannel {
  WELCOME
  OUTBOUND_COMMENT
  OUTBOUND_STORY
  INBOUND
}
```

- [ ] **Step 2: Aggiungere i campi su `Lead`**

Dentro `model Lead`, subito dopo il blocco `sourceId`/`source`:

```prisma
  // Canale di chat da cui nasce il lead (sezione Insight & Stats). Nullable in
  // schema perché i lead di altre provenienze non lo hanno; OBBLIGATORIO in Zod
  // quando `sourceId` è la provenienza collegata alla sezione per il tenant
  // (Organization.insightSourceId) — così ogni lead del report finisce in una
  // colonna e non nasce un secchio di "non attribuiti".
  chatChannel ChatChannel?

  // True quando il lead è stato creato cliccando una cella di Insight & Stats.
  // Alimenta il tooltip "8 creati da qui, 2 inseriti da lista lead o pipeline".
  // Colonna e non lettura di AuditLog: si aggrega nella stessa groupBy dei
  // conteggi (zero query in più) e non dipende dalla retention degli audit.
  createdFromInsight Boolean @default(false)
```

E, nel blocco degli indici dello stesso modello:

```prisma
  // Insight & Stats: lead del canale X creati nel periodo Y (docs/00 §3 —
  // organizationId sempre in testa).
  @@index([organizationId, chatChannel, createdAt])
```

- [ ] **Step 3: Aggiungere l'indice su `StageHistory`**

Dentro `model StageHistory`, accanto agli indici esistenti:

```prisma
  // Vendite del periodo per Insight & Stats: passaggi a WON in un intervallo.
  // L'indice esistente [organizationId, changedAt] non ha lo stage nel prefisso.
  @@index([organizationId, toStage, changedAt])
```

- [ ] **Step 4: Aggiungere i campi su `Organization`**

Dentro `model Organization`, dopo `leadRetentionMonths`:

```prisma
  // ── Insight & Stats (feature flag `insightStats`) ──
  // Provenienza collegata alla sezione: solo i lead con questa `LeadSource`
  // entrano nel report. Non si cabla la stringa "Instagram": le provenienze sono
  // configurabili per tenant e rinominarle non deve svuotare il report.
  insightSourceId String?
  insightSource   LeadSource? @relation("InsightSource", fields: [insightSourceId], references: [id], onDelete: SetNull)

  // Confine tra archivio (importato dall'Excel, sola lettura) e dato vivo.
  // I giorni < insightActiveFrom sono archivio; da lì in poi la sezione calcola.
  insightActiveFrom DateTime? @db.Date
```

E nelle back-relation dello stesso modello:

```prisma
  chatActivityDays ChatActivityDay[]
```

- [ ] **Step 5: Aggiungere la back-relation su `LeadSource`**

Dentro `model LeadSource`, accanto a `leads Lead[]`:

```prisma
  insightForOrganizations Organization[] @relation("InsightSource")
```

- [ ] **Step 6: Aggiungere il modello `ChatActivityDay`**

Dopo `model Invoice` (sezione "Dominio"):

```prisma
/// Una riga per giorno di calendario per tenant: i contatori di attività di chat
/// che il CRM non può dedurre (volumi di messaggi inviati/ricevuti e risposte).
/// Appuntamenti e vendite NON stanno qui per il periodo vivo — si calcolano da
/// Lead/Appointment/StageHistory — ma sì per l'archivio importato dall'Excel,
/// che non ha entità dietro e non cambierà mai.
model ChatActivityDay {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  date DateTime @db.Date

  // Contatori manuali (periodo vivo e archivio).
  welcomeSent      Int @default(0)
  welcomeReplies   Int @default(0)
  outboundComments Int @default(0)
  outboundStories  Int @default(0)
  outboundReplies  Int @default(0)
  inboundReceived  Int @default(0)

  // ── Archivio: valorizzato SOLO per date < Organization.insightActiveFrom ──
  isArchived Boolean @default(false)

  // Il foglio ha UNA colonna "Messaggi" outbound, non separabile in commenti e
  // storie: per l'archivio si conserva il valore aggregato così com'era.
  archivedOutboundMessages Int?

  // Conteggi congelati: nessun lead dietro, celle non cliccabili nella UI.
  archivedWelcomeAppointments  Int?
  archivedWelcomeSales         Int?
  archivedOutboundAppointments Int?
  archivedOutboundSales        Int?
  archivedInboundAppointments  Int?
  archivedInboundSales         Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Un solo record per giorno per tenant: è anche la chiave dell'upsert usato
  // dal salvataggio inline e dall'import (che diventa così idempotente). Il
  // btree che Postgres crea per questo vincolo serve anche la lettura del mese
  // (range scan sul prefisso tenant): nessun @@index separato, sarebbe ridondante
  // (docs/00 §3 — nessun indice ridondante).
  @@unique([organizationId, date])
}
```

- [ ] **Step 7: Validare lo schema**

Run: `pnpm prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 8: Generare la migrazione**

Run: `pnpm prisma migrate dev --name insight_stats`
Expected: nuova cartella in `prisma/migrations/`, client rigenerato. Ispezionare il `migration.sql`: deve essere **solo additivo** (`CREATE TYPE`, `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`), nessun `DROP`.

- [ ] **Step 9: Verificare che nulla si sia rotto**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck pulito, 960 test verdi (i campi nuovi sono opzionali o hanno default, nessun test esistente cambia).

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(insight): schema for chat activity days and lead chat channel"
```

---

### Task 2: Feature flag, capability e configurazione per tenant

**Files:**
- Modify: `src/lib/feature-flags.ts`
- Modify: `src/lib/feature-flags.test.ts`
- Modify: `src/lib/rbac.ts`
- Modify: `src/lib/rbac.test.ts`
- Modify: `src/server/admin/schemas.ts`
- Modify: `src/server/admin/update-organization.ts`
- Modify: `src/server/admin/update-organization.test.ts`
- Modify: `src/server/admin/get-organization.ts`
- Modify: `src/components/admin/feature-flags-form.tsx`

**Interfaces:**
- Consumes: `parseFeatureFlags` e `featureFlagsSchema` esistenti; `can()` e `CAPABILITIES` esistenti.
- Produces: chiave di flag `"insightStats"` in `FeatureFlags`; capability `"insight.view"` e `"insight.edit"`; campi `insightSourceId` e `insightActiveFrom` accettati da `updateOrganizationSchema`.

- [ ] **Step 1: Scrivere i test del flag**

In `src/lib/feature-flags.test.ts`, aggiungere al blocco esistente:

```ts
it("defaults insightStats to false — optional module, restrictive default", () => {
  expect(parseFeatureFlags({}).insightStats).toBe(false);
});

it("honours an explicit insightStats:true", () => {
  expect(parseFeatureFlags({ insightStats: true }).insightStats).toBe(true);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/lib/feature-flags.test.ts`
Expected: FAIL — `insightStats` non esiste sul tipo/oggetto.

- [ ] **Step 3: Aggiungere il flag**

In `src/lib/feature-flags.ts`, dentro `featureFlagsSchema`, dopo `calendarIntegrations`:

```ts
    insightStats: z.boolean().default(false),
```

e nel `transform`:

```ts
    insightStats: flags.insightStats ?? false,
```

Aggiornare il commento in testa al file citando `insightStats` fra i moduli opzionali a default restrittivo.

- [ ] **Step 4: Eseguire i test**

Run: `pnpm test -- src/lib/feature-flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Scrivere i test delle capability**

In `src/lib/rbac.test.ts`:

```ts
it("grants insight.view to every role but insight.edit only to proUser", () => {
  expect(can("superAdmin", "insight.view")).toBe(true);
  expect(can("proUser", "insight.view")).toBe(true);
  expect(can("baseUser", "insight.view")).toBe(true);

  expect(can("proUser", "insight.edit")).toBe(true);
  // superAdmin non è un utente operativo: vede, non scrive.
  expect(can("superAdmin", "insight.edit")).toBe(false);
  // baseUser può creare un lead da una cella (lead.create), non toccare i volumi.
  expect(can("baseUser", "insight.edit")).toBe(false);
});
```

- [ ] **Step 6: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/lib/rbac.test.ts`
Expected: FAIL — `"insight.view"` non è assegnabile a `Capability`.

- [ ] **Step 7: Aggiungere le capability**

In `src/lib/rbac.ts`, dentro `CAPABILITIES` dopo il blocco Appointments:

```ts
  // Insight & Stats (feature flag `insightStats`)
  "insight.view",
  "insight.edit", // modifica dei contatori manuali di attività
```

Poi aggiungere `"insight.view"` ai set di `superAdmin`, `proUser` e `baseUser`, e `"insight.edit"` al solo `proUser`. Aggiornare il commento in coda al set `baseUser` elencando `insight.edit` fra le capability NON concesse.

- [ ] **Step 8: Eseguire i test**

Run: `pnpm test -- src/lib/rbac.test.ts`
Expected: PASS.

- [ ] **Step 9: Scrivere il test della configurazione tenant**

In `src/server/admin/update-organization.test.ts`:

```ts
it("saves the insight source and activation date for the tenant", async () => {
  const { deps, store, orgId, sourceId } = seedOrganizationWithSource();

  await updateOrganization(deps, {
    id: orgId,
    insightSourceId: sourceId,
    insightActiveFrom: "2026-09-01",
  });

  const saved = store.organizations.find((o) => o.id === orgId);
  expect(saved?.insightSourceId).toBe(sourceId);
  expect(saved?.insightActiveFrom).toEqual(new Date(Date.UTC(2026, 8, 1)));
});

it("rejects an insight source belonging to another tenant", async () => {
  const { deps, orgId, otherTenantSourceId } = seedOrganizationWithSource();

  await expect(
    updateOrganization(deps, { id: orgId, insightSourceId: otherTenantSourceId }),
  ).rejects.toThrow(NotFoundError);
});
```

`seedOrganizationWithSource` va aggiunta accanto agli helper già presenti nel file di test: crea un'organizzazione, una `LeadSource` sua e una `LeadSource` di un secondo tenant.

- [ ] **Step 10: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/server/admin/update-organization.test.ts`
Expected: FAIL — i campi non sono accettati dallo schema.

- [ ] **Step 11: Estendere schema e use case admin**

In `src/server/admin/schemas.ts`, dentro `updateOrganizationSchema`:

```ts
  // Provenienza collegata a Insight & Stats. `null` esplicito = scollega.
  insightSourceId: z.string().cuid().nullable().optional(),
  // Confine archivio/dato vivo, giorno di calendario UTC.
  insightActiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "insightActiveFrom must be YYYY-MM-DD")
    .transform((day) => new Date(`${day}T00:00:00.000Z`))
    .nullable()
    .optional(),
```

In `src/server/admin/update-organization.ts`, prima della `update`, verificare che la sorgente appartenga al tenant che si sta configurando e propagare i due campi:

```ts
if (data.insightSourceId) {
  const source = await deps.prisma.leadSource.findFirst({
    where: { id: data.insightSourceId, organizationId: data.id },
    select: { id: true },
  });
  if (!source) {
    throw new NotFoundError("LeadSource", data.insightSourceId);
  }
}
```

In `src/server/admin/get-organization.ts` aggiungere `insightSourceId` e `insightActiveFrom` alla `select`, più l'elenco delle `leadSources` del tenant se non è già restituito (serve al form).

- [ ] **Step 12: Eseguire i test**

Run: `pnpm test -- src/server/admin/update-organization.test.ts`
Expected: PASS.

- [ ] **Step 13: Aggiungere i controlli al pannello admin**

In `src/components/admin/feature-flags-form.tsx`: la switch per `insightStats` compare insieme alle altre (il componente itera già sulle chiavi del tipo `FeatureFlags`, quindi verificare se serve solo la stringa i18n). Subito sotto, visibile **solo quando `insightStats` è attivo**, aggiungere un `<Select>` delle `LeadSource` del tenant per `insightSourceId` e un `<Input type="date">` per `insightActiveFrom`. Le due impostazioni stanno vicine perché il flag senza la provenienza non produce nulla.

- [ ] **Step 14: Verificare l'insieme**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tutto verde.

- [ ] **Step 15: Commit**

```bash
git add src/lib/feature-flags.ts src/lib/feature-flags.test.ts src/lib/rbac.ts src/lib/rbac.test.ts src/server/admin src/components/admin/feature-flags-form.tsx
git commit -m "feat(insight): feature flag, capabilities and per-tenant configuration"
```

---

### Task 3: Fondamenta del dominio — deps, canali, configurazione

**Files:**
- Create: `src/server/insight/deps.ts`
- Create: `src/server/insight/context-deps.ts`
- Create: `src/server/insight/channels.ts`
- Create: `src/server/insight/channels.test.ts`
- Create: `src/server/insight/config.ts`
- Create: `src/server/insight/config.test.ts`
- Create: `src/server/insight/test-helpers.ts`

**Interfaces:**
- Consumes: `TenantPrismaClient` (`@/lib/prisma-tenant`), `AuditLogger` (`@/server/audit/audit-log`), `TenantContext` (`@/lib/tenant`), il pattern `LeadDeps` di `src/server/leads/deps.ts`.
- Produces:
  - `interface InsightDeps { prisma: TenantPrismaClient; audit: AuditLogger; actor: { organizationId: string; userId: string }; now?: () => Date }`
  - `clockNow(deps): Date`
  - `buildInsightDeps(ctx: TenantContext): InsightDeps`
  - `type ChannelGroup = "welcome" | "outbound" | "inbound"`
  - `const OUTBOUND_CHANNELS: readonly ChatChannel[]`
  - `channelGroupOf(channel: ChatChannel): ChannelGroup`
  - `interface InsightConfig { sourceId: string; activeFrom: Date | null }`
  - `getInsightConfig(deps: InsightDeps): Promise<InsightConfig | null>` — `null` quando il tenant non ha una provenienza collegata (sezione da configurare).
  - `class InsightStore` (fake in-memory) con `chatActivityDays`, `leads`, `appointments`, `stageHistories`, `organizations`, `leadSources` e `tenantClient(organizationId)`.

- [ ] **Step 1: Scrivere `channels.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { channelGroupOf, OUTBOUND_CHANNELS } from "@/server/insight/channels";

describe("channelGroupOf", () => {
  it("collapses both outbound channels into a single column group", () => {
    expect(channelGroupOf(ChatChannel.OUTBOUND_COMMENT)).toBe("outbound");
    expect(channelGroupOf(ChatChannel.OUTBOUND_STORY)).toBe("outbound");
  });

  it("keeps welcome and inbound on their own", () => {
    expect(channelGroupOf(ChatChannel.WELCOME)).toBe("welcome");
    expect(channelGroupOf(ChatChannel.INBOUND)).toBe("inbound");
  });

  it("lists exactly the channels that belong to the outbound group", () => {
    expect([...OUTBOUND_CHANNELS]).toEqual([
      ChatChannel.OUTBOUND_COMMENT,
      ChatChannel.OUTBOUND_STORY,
    ]);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/channels.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere `channels.ts`**

```ts
import { ChatChannel } from "@/generated/prisma/enums";

/**
 * Mappa fra i quattro canali salvati sul lead e le TRE colonne della tabella.
 *
 * Commento e storia sono canali distinti sul lead (il dato fine non si butta) ma
 * condividono le colonne Appuntamenti/Vendite: la tabella riproduce il blocco
 * "Outbound" del foglio, che ha una sola coppia di colonne a valle.
 */
export type ChannelGroup = "welcome" | "outbound" | "inbound";

export const OUTBOUND_CHANNELS: readonly ChatChannel[] = [
  ChatChannel.OUTBOUND_COMMENT,
  ChatChannel.OUTBOUND_STORY,
];

export function channelGroupOf(channel: ChatChannel): ChannelGroup {
  switch (channel) {
    case ChatChannel.WELCOME:
      return "welcome";
    case ChatChannel.OUTBOUND_COMMENT:
    case ChatChannel.OUTBOUND_STORY:
      return "outbound";
    case ChatChannel.INBOUND:
      return "inbound";
  }
}
```

- [ ] **Step 4: Eseguire il test**

Run: `pnpm test -- src/server/insight/channels.test.ts`
Expected: PASS.

- [ ] **Step 5: Scrivere `deps.ts` e `context-deps.ts`**

`src/server/insight/deps.ts` — copiare la struttura di `src/server/leads/deps.ts`, che è già il pattern del progetto:

```ts
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dipendenze degli use case di Insight & Stats.
 *
 * Come per i lead, il client Prisma è quello TENANT-SCOPED: `organizationId` è
 * iniettato al livello dati, quindi un `where` dimenticato non può far uscire
 * dati da un altro tenant. `actor` arriva dalla sessione, mai dal client.
 * `now` è iniettabile per rendere deterministici i test che dipendono da "oggi"
 * (giorni futuri non scrivibili).
 */
export interface InsightActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface InsightDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: InsightActor;
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<InsightDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
```

`src/server/insight/context-deps.ts`:

```ts
import { getTenantPrisma } from "@/lib/prisma-tenant";
import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenant";
import { createAuditLogger } from "@/server/audit/audit-log";
import type { InsightDeps } from "@/server/insight/deps";

export function buildInsightDeps(ctx: TenantContext): InsightDeps {
  return {
    prisma: getTenantPrisma(ctx),
    audit: createAuditLogger(prisma),
    actor: { organizationId: ctx.organizationId, userId: ctx.userId },
  };
}
```

Verificare la forma esatta di `TenantContext` e di `buildLeadDeps` in `src/server/leads/context-deps.ts` e allinearsi a quella, invece di inventare nomi diversi.

- [ ] **Step 6: Scrivere `config.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import { getInsightConfig } from "@/server/insight/config";
import { InsightStore } from "@/server/insight/test-helpers";

describe("getInsightConfig", () => {
  it("returns the linked source and the activation boundary", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
    store.addOrganization({
      id: "org-a",
      insightSourceId: source.id,
      insightActiveFrom: new Date(Date.UTC(2026, 8, 1)),
    });

    const config = await getInsightConfig(store.deps("org-a"));

    expect(config).toEqual({ sourceId: source.id, activeFrom: new Date(Date.UTC(2026, 8, 1)) });
  });

  it("returns null when no source is linked — the section is unconfigured", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getInsightConfig(store.deps("org-a"))).toBeNull();
  });

  it("never reads another tenant's configuration", async () => {
    const store = new InsightStore();
    const source = store.addLeadSource({ organizationId: "org-b", label: "Instagram" });
    store.addOrganization({ id: "org-b", insightSourceId: source.id });
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getInsightConfig(store.deps("org-a"))).toBeNull();
  });
});
```

- [ ] **Step 7: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/config.test.ts`
Expected: FAIL — moduli inesistenti.

- [ ] **Step 8: Scrivere `test-helpers.ts`**

Store in-memory sullo stesso modello di `src/server/dashboard/test-helpers.ts`: righe tipizzate, un client legato a UN `organizationId` che filtra ogni lettura e stampa l'id su ogni scrittura, e un metodo `deps(organizationId)` che restituisce `InsightDeps` completo di audit logger fittizio che accumula gli eventi in un array ispezionabile. Modellare solo le operazioni usate dagli use case:

- `organization.findUnique`
- `chatActivityDay.findMany` / `upsert`
- `lead.findMany` / `groupBy` / `count` / `create`
- `appointment.findMany` / `groupBy` / `create`
- `stageHistory.findMany`
- `$transaction(fn)` che esegue la callback con lo stesso client (i fake sono sincroni: la semantica transazionale reale si verifica in e2e, qui basta che la callback riceva un client valido)

Esporre `addOrganization`, `addLeadSource`, `addLead`, `addAppointment`, `addStageHistory`, `addActivityDay` con default sensati, così i test successivi restano brevi.

- [ ] **Step 9: Scrivere `config.ts`**

```ts
import type { InsightDeps } from "@/server/insight/deps";

/**
 * Configurazione della sezione per il tenant corrente.
 *
 * `null` significa "sezione non configurata": il flag è acceso ma nessuna
 * provenienza è collegata. In quel caso la pagina spiega cosa manca invece di
 * mostrare una tabella vuota e inspiegabile.
 */
export interface InsightConfig {
  readonly sourceId: string;
  /** Confine archivio/dato vivo; `null` = nessun archivio importato. */
  readonly activeFrom: Date | null;
}

export async function getInsightConfig(deps: InsightDeps): Promise<InsightConfig | null> {
  const organization = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: { insightSourceId: true, insightActiveFrom: true },
  });

  if (!organization?.insightSourceId) {
    return null;
  }

  return {
    sourceId: organization.insightSourceId,
    activeFrom: organization.insightActiveFrom ?? null,
  };
}
```

- [ ] **Step 10: Eseguire i test**

Run: `pnpm test -- src/server/insight/`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/server/insight
git commit -m "feat(insight): domain foundations - deps, channel grouping, tenant config"
```

---

### Task 4: Lettura delle righe giornaliere (manuali e archivio)

**Files:**
- Create: `src/server/insight/schemas.ts`
- Create: `src/server/insight/get-activity-days.ts`
- Create: `src/server/insight/get-activity-days.test.ts`
- Modify: `src/server/insight/test-helpers.ts` (aggiungere `chatActivityDay.findMany` se manca)

**Interfaces:**
- Consumes: `InsightDeps`, `periodRange` da `@/server/dashboard/period`, `parseInput` da `@/server/validation`.
- Produces:
  - `monthSchema` (Zod: `{ year: number; month: number }`, anni 2000–2100, mesi 1–12)
  - `interface ActivityDayRow` con i campi: `date`, `welcomeSent`, `welcomeReplies`, `outboundComments`, `outboundStories`, `outboundReplies`, `inboundReceived`, `isArchived`, `archivedOutboundMessages`, `archivedWelcomeAppointments`, `archivedWelcomeSales`, `archivedOutboundAppointments`, `archivedOutboundSales`, `archivedInboundAppointments`, `archivedInboundSales`
  - `getActivityDays(deps: InsightDeps, input: unknown): Promise<ActivityDayRow[]>` — solo i giorni che hanno una riga, ordinati per data crescente.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/get-activity-days.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getActivityDays } from "@/server/insight/get-activity-days";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

describe("getActivityDays", () => {
  it("returns only the days of the requested month, ordered by date", async () => {
    const store = new InsightStore();
    store.addActivityDay({ organizationId: "org-a", date: "2026-08-31", welcomeSent: 10 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-03", welcomeSent: 20 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-01", welcomeSent: 30 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-10-01", welcomeSent: 40 });

    const days = await getActivityDays(store.deps("org-a"), SEPTEMBER_2026);

    expect(days.map((day) => day.welcomeSent)).toEqual([30, 20]);
  });

  it("carries the archive fields through untouched", async () => {
    const store = new InsightStore();
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-02",
      isArchived: true,
      archivedOutboundMessages: 7,
      archivedWelcomeAppointments: 2,
    });

    const [day] = await getActivityDays(store.deps("org-a"), SEPTEMBER_2026);

    expect(day.isArchived).toBe(true);
    expect(day.archivedOutboundMessages).toBe(7);
    expect(day.archivedWelcomeAppointments).toBe(2);
  });

  it("never returns another tenant's rows", async () => {
    const store = new InsightStore();
    store.addActivityDay({ organizationId: "org-b", date: "2026-09-05", welcomeSent: 99 });

    expect(await getActivityDays(store.deps("org-a"), SEPTEMBER_2026)).toEqual([]);
  });

  it("rejects an out-of-range month", async () => {
    const store = new InsightStore();

    await expect(getActivityDays(store.deps("org-a"), { year: 2026, month: 13 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/get-activity-days.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere `schemas.ts`**

```ts
import { z } from "zod";

/**
 * Mese visualizzato. Stessi limiti di `periodSchema` (dashboard) per non
 * introdurre una seconda convenzione: anno 2000–2100, mese 1–12.
 */
export const monthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type MonthInput = z.infer<typeof monthSchema>;
```

- [ ] **Step 4: Scrivere `get-activity-days.ts`**

```ts
import { parseInput } from "@/server/validation";
import { periodRange } from "@/server/dashboard/period";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";

/**
 * Righe giornaliere del mese: i contatori digitati a mano e, per i giorni di
 * archivio, i conteggi congelati importati dall'Excel.
 *
 * Restituisce SOLO i giorni che hanno una riga: i giorni senza attività non
 * esistono a database (nessuna riga vuota scritta in anticipo) e la UI li
 * completa a zero. Una query sola, range scan su `[organizationId, date]`.
 */
export interface ActivityDayRow {
  readonly date: Date;
  readonly welcomeSent: number;
  readonly welcomeReplies: number;
  readonly outboundComments: number;
  readonly outboundStories: number;
  readonly outboundReplies: number;
  readonly inboundReceived: number;
  readonly isArchived: boolean;
  readonly archivedOutboundMessages: number | null;
  readonly archivedWelcomeAppointments: number | null;
  readonly archivedWelcomeSales: number | null;
  readonly archivedOutboundAppointments: number | null;
  readonly archivedOutboundSales: number | null;
  readonly archivedInboundAppointments: number | null;
  readonly archivedInboundSales: number | null;
}

export async function getActivityDays(
  deps: InsightDeps,
  input: unknown,
): Promise<ActivityDayRow[]> {
  const { year, month } = parseInput(monthSchema, input);
  const monthBounds = periodRange(year, month);

  return deps.prisma.chatActivityDay.findMany({
    where: { date: { gte: monthBounds.gte, lt: monthBounds.lt } },
    orderBy: { date: "asc" },
    select: {
      date: true,
      welcomeSent: true,
      welcomeReplies: true,
      outboundComments: true,
      outboundStories: true,
      outboundReplies: true,
      inboundReceived: true,
      isArchived: true,
      archivedOutboundMessages: true,
      archivedWelcomeAppointments: true,
      archivedWelcomeSales: true,
      archivedOutboundAppointments: true,
      archivedOutboundSales: true,
      archivedInboundAppointments: true,
      archivedInboundSales: true,
    },
  });
}
```

- [ ] **Step 5: Eseguire il test**

Run: `pnpm test -- src/server/insight/get-activity-days.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): read daily activity rows for a month"`

---

### Task 5: Appuntamenti derivati per giorno e canale

**Files:**
- Create: `src/server/insight/counts.ts`
- Create: `src/server/insight/get-appointment-counts.ts`
- Create: `src/server/insight/get-appointment-counts.test.ts`

**Interfaces:**
- Consumes: `InsightDeps`, `InsightConfig`, `periodRange`, `channelGroupOf`.
- Produces:
  - `interface DerivedCount { readonly total: number; readonly fromInsight: number }`
  - `ZERO_COUNT`, `emptyCountsByGroup(): Record<ChannelGroup, DerivedCount>`, `utcDayKey(instant: Date): string`
  - `interface AppointmentCounts { readonly byDay: ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>; readonly unattributedLeadCount: number }`
  - `getAppointmentCounts(deps, config, input): Promise<AppointmentCounts>`

**Regola di conteggio (spec §Decisioni 4):** un lead conta **una sola volta**, nel giorno in cui gli è stato fissato il **primo** appuntamento. L'ancora è `Appointment.createdAt` (quando è stato fissato), non `startAt` (quando si tiene).

- [ ] **Step 1: Scrivere il test**

`src/server/insight/get-appointment-counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { getAppointmentCounts } from "@/server/insight/get-appointment-counts";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

function seedTenantWithInstagramSource() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, config: { sourceId: source.id, activeFrom: null } };
}

describe("getAppointmentCounts", () => {
  it("counts a lead on the day its FIRST appointment was booked", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-07")?.welcome.total).toBe(1);
  });

  it("does not count a second appointment booked for the same lead later", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-21" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-07")?.welcome.total).toBe(1);
    expect(byDay.get("2026-09-21")).toBeUndefined();
  });

  it("excludes a lead whose first appointment predates the month", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.INBOUND,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-08-20" });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-02" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("merges both outbound channels into the outbound column", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const fromComment = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_COMMENT,
    });
    const fromStory = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_STORY,
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: fromComment.id,
      createdAt: "2026-09-04",
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: fromStory.id,
      createdAt: "2026-09-04",
    });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-04")?.outbound.total).toBe(2);
  });

  it("splits out how many were created from the Insight section", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const createdHere = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      createdFromInsight: true,
    });
    const createdElsewhere = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      createdFromInsight: false,
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: createdHere.id,
      createdAt: "2026-09-05",
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: createdElsewhere.id,
      createdAt: "2026-09-05",
    });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-05")?.welcome).toEqual({ total: 2, fromInsight: 1 });
  });

  it("ignores leads from another source", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: otherSource.id,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-08" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("counts leads of the linked source without a channel as unattributed", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: null,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-09" });

    const counts = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(counts.unattributedLeadCount).toBe(1);
    expect(counts.byDay.size).toBe(0);
  });

  it("never counts another tenant's leads", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-b", leadId: lead.id, createdAt: "2026-09-10" });

    const counts = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(counts.byDay.size).toBe(0);
    expect(counts.unattributedLeadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/get-appointment-counts.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere `counts.ts` (tipi condivisi con le vendite)**

```ts
import type { ChannelGroup } from "@/server/insight/channels";

/**
 * Valore di una cella calcolata. `fromInsight` è il sottoinsieme creato
 * cliccando la tabella: alimenta il tooltip "8 creati da qui, 2 inseriti da
 * lista lead o pipeline".
 */
export interface DerivedCount {
  readonly total: number;
  readonly fromInsight: number;
}

export const ZERO_COUNT: DerivedCount = { total: 0, fromInsight: 0 };

export function emptyCountsByGroup(): Record<ChannelGroup, DerivedCount> {
  return {
    welcome: { ...ZERO_COUNT },
    outbound: { ...ZERO_COUNT },
    inbound: { ...ZERO_COUNT },
  };
}

/** Chiave giorno `YYYY-MM-DD` in UTC — stessa convenzione di docs/00 §3. */
export function utcDayKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Scrivere `get-appointment-counts.ts`**

```ts
import { parseInput } from "@/server/validation";
import { periodRange } from "@/server/dashboard/period";
import { channelGroupOf, type ChannelGroup } from "@/server/insight/channels";
import type { InsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";
import { emptyCountsByGroup, utcDayKey, type DerivedCount } from "@/server/insight/counts";

/**
 * Appuntamenti derivati, per giorno e per colonna.
 *
 * Regola (spec §Decisioni 4): un lead conta UNA SOLA VOLTA, nel giorno in cui
 * gli è stato fissato il PRIMO appuntamento. L'ancora è `Appointment.createdAt`
 * (quando è stato fissato), non `startAt` (quando si tiene): la tabella misura
 * l'attività di chat, non il carico dell'agenda. Senza la regola del primo
 * appuntamento il tasso "risposte → appuntamenti" potrebbe superare il 100%.
 *
 * Due query, entrambe DB-side:
 *  1. `groupBy(leadId)` con `_min(createdAt)` sugli appuntamenti dei lead della
 *     provenienza collegata, limitato a `createdAt < lt` (un lead il cui primo
 *     appuntamento cade dopo la fine del mese non può rientrare). Restituisce
 *     UNA riga per lead con appuntamenti, non una per appuntamento.
 *  2. `findMany` sui soli lead superstiti per leggerne canale e origine.
 */
export interface AppointmentCounts {
  readonly byDay: ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>;
  /** Lead della provenienza collegata SENZA canale: alimenta l'avviso in pagina. */
  readonly unattributedLeadCount: number;
}

export async function getAppointmentCounts(
  deps: InsightDeps,
  config: InsightConfig,
  input: unknown,
): Promise<AppointmentCounts> {
  const { year, month } = parseInput(monthSchema, input);
  const monthBounds = periodRange(year, month);

  const firstAppointmentPerLead = await deps.prisma.appointment.groupBy({
    by: ["leadId"],
    where: {
      createdAt: { lt: monthBounds.lt },
      lead: { is: { sourceId: config.sourceId } },
    },
    _min: { createdAt: true },
  });

  const leadsBookedThisMonth = firstAppointmentPerLead.flatMap((row) => {
    const firstBookedAt = row._min.createdAt;
    if (row.leadId === null || firstBookedAt === null || firstBookedAt < monthBounds.gte) {
      return [];
    }
    return [{ leadId: row.leadId, bookedAt: firstBookedAt }];
  });

  if (leadsBookedThisMonth.length === 0) {
    return { byDay: new Map(), unattributedLeadCount: 0 };
  }

  const leads = await deps.prisma.lead.findMany({
    where: { id: { in: leadsBookedThisMonth.map((entry) => entry.leadId) } },
    select: { id: true, chatChannel: true, createdFromInsight: true },
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const byDay = new Map<string, Record<ChannelGroup, DerivedCount>>();
  let unattributedLeadCount = 0;

  for (const { leadId, bookedAt } of leadsBookedThisMonth) {
    const lead = leadById.get(leadId);
    if (!lead) {
      continue; // lead soft-deleted: il client tenant lo filtra già.
    }
    if (!lead.chatChannel) {
      unattributedLeadCount += 1;
      continue;
    }

    const dayKey = utcDayKey(bookedAt);
    const dayCounts = byDay.get(dayKey) ?? emptyCountsByGroup();
    const group = channelGroupOf(lead.chatChannel);
    dayCounts[group] = {
      total: dayCounts[group].total + 1,
      fromInsight: dayCounts[group].fromInsight + (lead.createdFromInsight ? 1 : 0),
    };
    byDay.set(dayKey, dayCounts);
  }

  return { byDay, unattributedLeadCount };
}
```

- [ ] **Step 5: Eseguire il test**

Run: `pnpm test -- src/server/insight/get-appointment-counts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): derive appointment counts per day and channel"`

---

### Task 6: Vendite derivate per giorno e canale

**Files:**
- Create: `src/server/insight/get-sale-counts.ts`
- Create: `src/server/insight/get-sale-counts.test.ts`

**Interfaces:**
- Consumes: `InsightDeps`, `InsightConfig`, `periodRange`, `channelGroupOf`, `emptyCountsByGroup`/`utcDayKey`/`DerivedCount` da `@/server/insight/counts`.
- Produces: `getSaleCounts(deps, config, input): Promise<ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>>`

**Regola di conteggio:** la vendita cade nel giorno dell'**ultimo** passaggio a `WON`, e solo per i lead il cui stage **corrente** è `WON`. Così una vendita esiste una volta sola, alla data corrente, e la tabella non può divergere dalla pipeline: se un lead viene riaperto, il numero scende.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/get-sale-counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { getSaleCounts } from "@/server/insight/get-sale-counts";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

function seedTenantWithInstagramSource() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, config: { sourceId: source.id, activeFrom: null } };
}

describe("getSaleCounts", () => {
  it("counts a sale on the day the lead moved to WON", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.INBOUND,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-15",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-15")?.inbound.total).toBe(1);
  });

  it("counts a lead once, on its LAST move to WON", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-02",
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-20",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-02")).toBeUndefined();
    expect(byDay.get("2026-09-20")?.welcome.total).toBe(1);
  });

  it("drops a lead that was reopened — the section never diverges from the pipeline", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WAITING_PAYMENT,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-11",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("ignores leads without a channel and leads of another source", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });
    const noChannel = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: null,
      stage: LeadStage.WON,
    });
    const otherSourceLead = store.addLead({
      organizationId: "org-a",
      sourceId: otherSource.id,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    for (const lead of [noChannel, otherSourceLead]) {
      store.addStageHistory({
        organizationId: "org-a",
        leadId: lead.id,
        toStage: LeadStage.WON,
        changedAt: "2026-09-12",
      });
    }

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("splits out how many were created from the Insight section", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_STORY,
      stage: LeadStage.WON,
      createdFromInsight: true,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-18",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-18")?.outbound).toEqual({ total: 1, fromInsight: 1 });
  });

  it("never counts another tenant's sales", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-b",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-19",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/get-sale-counts.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere `get-sale-counts.ts`**

```ts
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import { periodRange } from "@/server/dashboard/period";
import { channelGroupOf, type ChannelGroup } from "@/server/insight/channels";
import type { InsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";
import { emptyCountsByGroup, utcDayKey, type DerivedCount } from "@/server/insight/counts";

/**
 * Vendite derivate, per giorno e per colonna.
 *
 * La vendita cade nel giorno dell'ULTIMO passaggio a `WON`, e solo per i lead
 * il cui stage CORRENTE è `WON`: così una vendita esiste una volta sola, alla
 * data corrente, e la tabella non può divergere dalla pipeline — se un lead
 * viene riaperto il numero scende da sé. È lo stesso dato, non una copia.
 *
 * Due query, simmetriche a quelle degli appuntamenti.
 */
export async function getSaleCounts(
  deps: InsightDeps,
  config: InsightConfig,
  input: unknown,
): Promise<ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>> {
  const { year, month } = parseInput(monthSchema, input);
  const monthBounds = periodRange(year, month);

  const lastWonPerLead = await deps.prisma.stageHistory.groupBy({
    by: ["leadId"],
    where: {
      toStage: LeadStage.WON,
      changedAt: { lt: monthBounds.lt },
      lead: { is: { sourceId: config.sourceId, stage: LeadStage.WON } },
    },
    _max: { changedAt: true },
  });

  const salesThisMonth = lastWonPerLead.flatMap((row) => {
    const lastWonAt = row._max.changedAt;
    if (lastWonAt === null || lastWonAt < monthBounds.gte) {
      return [];
    }
    return [{ leadId: row.leadId, wonAt: lastWonAt }];
  });

  if (salesThisMonth.length === 0) {
    return new Map();
  }

  const leads = await deps.prisma.lead.findMany({
    where: { id: { in: salesThisMonth.map((sale) => sale.leadId) } },
    select: { id: true, chatChannel: true, createdFromInsight: true },
  });
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));

  const byDay = new Map<string, Record<ChannelGroup, DerivedCount>>();

  for (const { leadId, wonAt } of salesThisMonth) {
    const lead = leadById.get(leadId);
    if (!lead?.chatChannel) {
      continue;
    }

    const dayKey = utcDayKey(wonAt);
    const dayCounts = byDay.get(dayKey) ?? emptyCountsByGroup();
    const group = channelGroupOf(lead.chatChannel);
    dayCounts[group] = {
      total: dayCounts[group].total + 1,
      fromInsight: dayCounts[group].fromInsight + (lead.createdFromInsight ? 1 : 0),
    };
    byDay.set(dayKey, dayCounts);
  }

  return byDay;
}
```

- [ ] **Step 4: Eseguire il test**

Run: `pnpm test -- src/server/insight/get-sale-counts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): derive sale counts from the last WON transition"`

---

### Task 7: Totali e tassi di conversione (funzioni pure)

**Files:**
- Create: `src/server/insight/totals.ts`
- Create: `src/server/insight/totals.test.ts`

**Interfaces:**
- Consumes: `MonthDayRow` (definito qui, usato dal Task 8).
- Produces:
  - `interface ColumnTotals { welcomeSent; welcomeReplies; welcomeAppointments; welcomeSales; outboundMessages; outboundReplies; outboundAppointments; outboundSales; inboundReceived; inboundAppointments; inboundSales; totalAppointments; totalSales }` (tutti `number`)
  - `interface ConversionRates { welcomeReplyRate; welcomeAppointmentRate; welcomeSaleRate; outboundReplyRate; outboundAppointmentRate; outboundSaleRate; inboundAppointmentRate; inboundSaleRate; overallSaleRate }` (tutti `number | null`)
  - `sumColumns(days: readonly MonthDayRow[]): ColumnTotals`
  - `conversionRates(totals: ColumnTotals): ConversionRates`
  - `ratio(numerator: number, denominator: number): number | null` — `null` quando il denominatore è 0.

**Perché funzioni pure:** i totali del foglio erano formule scritte a mano riga per riga, ed è così che a settembre 2026 il totale appuntamenti risulta zero. Qui sono calcolati sempre, da una funzione sola, testabile senza database.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/totals.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { conversionRates, ratio, sumColumns } from "@/server/insight/totals";
import type { MonthDayRow } from "@/server/insight/get-month-view";

function dayRow(overrides: Partial<MonthDayRow> = {}): MonthDayRow {
  return {
    date: "2026-09-01",
    isArchived: false,
    isFuture: false,
    welcome: { sent: 0, replies: 0, appointments: 0, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
    outbound: {
      comments: 0,
      stories: 0,
      archivedMessages: null,
      replies: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    inbound: { received: 0, appointments: 0, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
    totalAppointments: 0,
    totalSales: 0,
    ...overrides,
  };
}

describe("sumColumns", () => {
  it("adds every column across the days of the month", () => {
    const totals = sumColumns([
      dayRow({ welcome: { sent: 30, replies: 3, appointments: 1, appointmentsFromInsight: 1, sales: 0, salesFromInsight: 0 } }),
      dayRow({ welcome: { sent: 20, replies: 2, appointments: 2, appointmentsFromInsight: 0, sales: 1, salesFromInsight: 0 } }),
    ]);

    expect(totals.welcomeSent).toBe(50);
    expect(totals.welcomeReplies).toBe(5);
    expect(totals.welcomeAppointments).toBe(3);
    expect(totals.welcomeSales).toBe(1);
  });

  it("folds the archived outbound aggregate into the outbound messages total", () => {
    const totals = sumColumns([
      dayRow({
        isArchived: true,
        outbound: {
          comments: 0,
          stories: 0,
          archivedMessages: 11,
          replies: 4,
          appointments: 1,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
      }),
      dayRow({
        outbound: {
          comments: 2,
          stories: 3,
          archivedMessages: null,
          replies: 1,
          appointments: 0,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
      }),
    ]);

    expect(totals.outboundMessages).toBe(16);
  });

  it("derives the row totals from the three channels, never from stored values", () => {
    const totals = sumColumns([
      dayRow({
        welcome: { sent: 0, replies: 0, appointments: 1, appointmentsFromInsight: 0, sales: 1, salesFromInsight: 0 },
        inbound: { received: 0, appointments: 2, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
        totalAppointments: 3,
        totalSales: 1,
      }),
    ]);

    expect(totals.totalAppointments).toBe(3);
    expect(totals.totalSales).toBe(1);
  });
});

describe("ratio", () => {
  it("returns the ratio when the denominator is positive", () => {
    expect(ratio(3, 12)).toBe(0.25);
  });

  it("returns null when the denominator is zero — not NaN, not 0%", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
  });
});

describe("conversionRates", () => {
  it("chains each step onto the previous one", () => {
    const totals = sumColumns([
      dayRow({
        welcome: { sent: 100, replies: 10, appointments: 5, appointmentsFromInsight: 0, sales: 1, salesFromInsight: 0 },
      }),
    ]);

    const rates = conversionRates(totals);

    expect(rates.welcomeReplyRate).toBeCloseTo(0.1);
    expect(rates.welcomeAppointmentRate).toBeCloseTo(0.5);
    expect(rates.welcomeSaleRate).toBeCloseTo(0.2);
  });

  it("computes the overall sale rate over the total appointments of all channels", () => {
    const totals = sumColumns([
      dayRow({
        welcome: { sent: 0, replies: 0, appointments: 2, appointmentsFromInsight: 0, sales: 1, salesFromInsight: 0 },
        inbound: { received: 0, appointments: 2, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
        totalAppointments: 4,
        totalSales: 1,
      }),
    ]);

    expect(conversionRates(totals).overallSaleRate).toBeCloseTo(0.25);
  });

  it("leaves every rate null on an empty month", () => {
    const rates = conversionRates(sumColumns([]));

    expect(Object.values(rates).every((rate) => rate === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/totals.test.ts`
Expected: FAIL — moduli inesistenti.

- [ ] **Step 3: Scrivere `totals.ts`**

```ts
import type { MonthDayRow } from "@/server/insight/get-month-view";

/**
 * Riga "Totale mese" e riga "Conversione" della tabella.
 *
 * Funzioni pure, senza database: nel foglio Excel questi erano `SUM` scritti a
 * mano riga per riga, e infatti cinque righe erano senza formula (settembre 2026
 * mostrava zero appuntamenti pur avendone). Qui il totale non può mancare.
 */
export interface ColumnTotals {
  readonly welcomeSent: number;
  readonly welcomeReplies: number;
  readonly welcomeAppointments: number;
  readonly welcomeSales: number;
  /** Commenti + storie del periodo vivo PIÙ l'aggregato dei giorni di archivio. */
  readonly outboundMessages: number;
  readonly outboundReplies: number;
  readonly outboundAppointments: number;
  readonly outboundSales: number;
  readonly inboundReceived: number;
  readonly inboundAppointments: number;
  readonly inboundSales: number;
  readonly totalAppointments: number;
  readonly totalSales: number;
}

export interface ConversionRates {
  readonly welcomeReplyRate: number | null;
  readonly welcomeAppointmentRate: number | null;
  readonly welcomeSaleRate: number | null;
  readonly outboundReplyRate: number | null;
  readonly outboundAppointmentRate: number | null;
  readonly outboundSaleRate: number | null;
  readonly inboundAppointmentRate: number | null;
  readonly inboundSaleRate: number | null;
  readonly overallSaleRate: number | null;
}

/** `null` quando il denominatore è zero: "non calcolabile", non NaN né 0%. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function sumColumns(days: readonly MonthDayRow[]): ColumnTotals {
  const totals = {
    welcomeSent: 0,
    welcomeReplies: 0,
    welcomeAppointments: 0,
    welcomeSales: 0,
    outboundMessages: 0,
    outboundReplies: 0,
    outboundAppointments: 0,
    outboundSales: 0,
    inboundReceived: 0,
    inboundAppointments: 0,
    inboundSales: 0,
    totalAppointments: 0,
    totalSales: 0,
  };

  for (const day of days) {
    totals.welcomeSent += day.welcome.sent;
    totals.welcomeReplies += day.welcome.replies;
    totals.welcomeAppointments += day.welcome.appointments;
    totals.welcomeSales += day.welcome.sales;

    // I giorni di archivio hanno UN solo valore outbound (il foglio non separa
    // commenti e storie); quelli vivi hanno le due colonne. Il totale li somma.
    totals.outboundMessages +=
      day.outbound.archivedMessages ?? day.outbound.comments + day.outbound.stories;
    totals.outboundReplies += day.outbound.replies;
    totals.outboundAppointments += day.outbound.appointments;
    totals.outboundSales += day.outbound.sales;

    totals.inboundReceived += day.inbound.received;
    totals.inboundAppointments += day.inbound.appointments;
    totals.inboundSales += day.inbound.sales;

    totals.totalAppointments += day.totalAppointments;
    totals.totalSales += day.totalSales;
  }

  return totals;
}

export function conversionRates(totals: ColumnTotals): ConversionRates {
  return {
    welcomeReplyRate: ratio(totals.welcomeReplies, totals.welcomeSent),
    welcomeAppointmentRate: ratio(totals.welcomeAppointments, totals.welcomeReplies),
    welcomeSaleRate: ratio(totals.welcomeSales, totals.welcomeAppointments),
    outboundReplyRate: ratio(totals.outboundReplies, totals.outboundMessages),
    outboundAppointmentRate: ratio(totals.outboundAppointments, totals.outboundReplies),
    outboundSaleRate: ratio(totals.outboundSales, totals.outboundAppointments),
    inboundAppointmentRate: ratio(totals.inboundAppointments, totals.inboundReceived),
    inboundSaleRate: ratio(totals.inboundSales, totals.inboundAppointments),
    overallSaleRate: ratio(totals.totalSales, totals.totalAppointments),
  };
}
```

- [ ] **Step 4: Eseguire il test**

Run: `pnpm test -- src/server/insight/totals.test.ts`
Expected: FAIL sull'import di `MonthDayRow` (il Task 8 lo definisce). Per sbloccare, definire `MonthDayRow` in `get-month-view.ts` **prima** di eseguire: creare il file con le sole interfacce (nessuna funzione) e poi rieseguire. Expected dopo: PASS.

- [ ] **Step 5: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): pure column totals and conversion rates"`

---

### Task 8: Assemblaggio della vista mese

**Files:**
- Create: `src/server/insight/get-month-view.ts`
- Create: `src/server/insight/get-month-view.test.ts`

**Interfaces:**
- Consumes: `getActivityDays`, `getAppointmentCounts`, `getSaleCounts`, `getInsightConfig`, `sumColumns`, `conversionRates`, `utcDayKey`.
- Produces:
  - `interface ChannelDayCounts { readonly appointments: number; readonly appointmentsFromInsight: number; readonly sales: number; readonly salesFromInsight: number }`
  - `interface MonthDayRow { readonly date: string; readonly isArchived: boolean; readonly isFuture: boolean; readonly welcome: ChannelDayCounts & { sent: number; replies: number }; readonly outbound: ChannelDayCounts & { comments: number; stories: number; archivedMessages: number | null; replies: number }; readonly inbound: ChannelDayCounts & { received: number }; readonly totalAppointments: number; readonly totalSales: number }`
  - `interface InsightMonthView { readonly year: number; readonly month: number; readonly days: readonly MonthDayRow[]; readonly totals: ColumnTotals; readonly rates: ConversionRates; readonly containsArchivedDays: boolean; readonly containsLiveDays: boolean; readonly unattributedLeadCount: number }`
  - `getMonthView(deps: InsightDeps, input: unknown): Promise<InsightMonthView | null>` — `null` quando il tenant non ha una provenienza collegata.

**Comportamento:** genera **tutti** i giorni del mese (non solo quelli con una riga), marca come archivio i giorni precedenti a `activeFrom`, come futuri quelli oltre `clockNow`, e per i giorni di archivio prende appuntamenti e vendite dai campi congelati invece che dai conteggi derivati.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/get-month-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { getMonthView } from "@/server/insight/get-month-view";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };
const MID_SEPTEMBER = () => new Date("2026-09-10T12:00:00.000Z");

function seedConfiguredTenant(activeFrom: Date | null = new Date(Date.UTC(2026, 8, 1))) {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id, insightActiveFrom: activeFrom });
  return { store, sourceId: source.id };
}

describe("getMonthView", () => {
  it("returns null when the tenant has no linked source — section unconfigured", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getMonthView(store.deps("org-a"), SEPTEMBER_2026)).toBeNull();
  });

  it("emits one row per calendar day, zero-filled where no row exists", async () => {
    const { store } = seedConfiguredTenant();
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-04", welcomeSent: 33 });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.days).toHaveLength(30);
    expect(view?.days[0].date).toBe("2026-09-01");
    expect(view?.days[0].welcome.sent).toBe(0);
    expect(view?.days[3].welcome.sent).toBe(33);
  });

  it("marks days after today as future", async () => {
    const { store } = seedConfiguredTenant();

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.days.find((day) => day.date === "2026-09-10")?.isFuture).toBe(false);
    expect(view?.days.find((day) => day.date === "2026-09-11")?.isFuture).toBe(true);
  });

  it("marks days before the activation boundary as archive and uses the frozen counts", async () => {
    const { store } = seedConfiguredTenant(new Date(Date.UTC(2026, 8, 5)));
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-02",
      isArchived: true,
      archivedOutboundMessages: 11,
      archivedWelcomeAppointments: 2,
      archivedWelcomeSales: 1,
    });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);
    const archivedDay = view?.days.find((day) => day.date === "2026-09-02");

    expect(archivedDay?.isArchived).toBe(true);
    expect(archivedDay?.outbound.archivedMessages).toBe(11);
    expect(archivedDay?.welcome.appointments).toBe(2);
    expect(archivedDay?.welcome.sales).toBe(1);
    expect(view?.containsArchivedDays).toBe(true);
    expect(view?.containsLiveDays).toBe(true);
  });

  it("fills the derived columns of live days from the real entities", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
      createdFromInsight: true,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);
    const day = view?.days.find((row) => row.date === "2026-09-07");

    expect(day?.welcome.appointments).toBe(1);
    expect(day?.welcome.appointmentsFromInsight).toBe(1);
    expect(day?.totalAppointments).toBe(1);
  });

  it("computes the row total from the three channels", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    for (const channel of [ChatChannel.WELCOME, ChatChannel.OUTBOUND_COMMENT, ChatChannel.INBOUND]) {
      const lead = store.addLead({ organizationId: "org-a", sourceId, chatChannel: channel });
      store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-08" });
    }

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.days.find((day) => day.date === "2026-09-08")?.totalAppointments).toBe(3);
  });

  it("surfaces the count of leads with the linked source but no channel", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({ organizationId: "org-a", sourceId, chatChannel: null });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-09" });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.unattributedLeadCount).toBe(1);
  });

  it("exposes totals and rates for the month", async () => {
    const { store } = seedConfiguredTenant();
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-03",
      welcomeSent: 100,
      welcomeReplies: 10,
    });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.totals.welcomeSent).toBe(100);
    expect(view?.rates.welcomeReplyRate).toBeCloseTo(0.1);
  });

  it("never mixes another tenant's data in", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    store.addActivityDay({ organizationId: "org-b", date: "2026-09-03", welcomeSent: 999 });
    const otherLead = store.addLead({
      organizationId: "org-b",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-b", leadId: otherLead.id, createdAt: "2026-09-03" });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.totals.welcomeSent).toBe(0);
    expect(view?.totals.totalAppointments).toBe(0);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/get-month-view.test.ts`
Expected: FAIL — `getMonthView` non esiste.

- [ ] **Step 3: Scrivere `get-month-view.ts`**

```ts
import { parseInput } from "@/server/validation";
import { periodRange } from "@/server/dashboard/period";
import { getInsightConfig } from "@/server/insight/config";
import { utcDayKey, ZERO_COUNT, type DerivedCount } from "@/server/insight/counts";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { getActivityDays } from "@/server/insight/get-activity-days";
import { getAppointmentCounts } from "@/server/insight/get-appointment-counts";
import { getSaleCounts } from "@/server/insight/get-sale-counts";
import { monthSchema } from "@/server/insight/schemas";
import {
  conversionRates,
  sumColumns,
  type ColumnTotals,
  type ConversionRates,
} from "@/server/insight/totals";

/**
 * Vista completa di un mese: una riga per GIORNO DI CALENDARIO, non solo per i
 * giorni che hanno una riga a database.
 *
 * Le due metà — archivio e dato vivo — escono con la STESSA forma, distinte da
 * `isArchived`: la UI non ha due modalità di rendering, solo celle che sanno se
 * sono modificabili. Per i giorni di archivio appuntamenti e vendite vengono dai
 * campi congelati (nessun lead dietro); per i giorni vivi dai conteggi derivati.
 */
export interface ChannelDayCounts {
  readonly appointments: number;
  readonly appointmentsFromInsight: number;
  readonly sales: number;
  readonly salesFromInsight: number;
}

export interface MonthDayRow {
  /** `YYYY-MM-DD` in UTC. */
  readonly date: string;
  readonly isArchived: boolean;
  readonly isFuture: boolean;
  readonly welcome: ChannelDayCounts & { readonly sent: number; readonly replies: number };
  readonly outbound: ChannelDayCounts & {
    readonly comments: number;
    readonly stories: number;
    /** Valorizzato solo nei giorni di archivio: il foglio non separa i due. */
    readonly archivedMessages: number | null;
    readonly replies: number;
  };
  readonly inbound: ChannelDayCounts & { readonly received: number };
  readonly totalAppointments: number;
  readonly totalSales: number;
}

export interface InsightMonthView {
  readonly year: number;
  readonly month: number;
  readonly days: readonly MonthDayRow[];
  readonly totals: ColumnTotals;
  readonly rates: ConversionRates;
  /** Il mese contiene giorni di archivio: i riepiloghi lo dichiarano nella UI. */
  readonly containsArchivedDays: boolean;
  readonly containsLiveDays: boolean;
  readonly unattributedLeadCount: number;
}

export async function getMonthView(
  deps: InsightDeps,
  input: unknown,
): Promise<InsightMonthView | null> {
  const month = parseInput(monthSchema, input);

  const config = await getInsightConfig(deps);
  if (!config) {
    return null;
  }

  const [activityDays, appointmentCounts, saleCounts] = await Promise.all([
    getActivityDays(deps, month),
    getAppointmentCounts(deps, config, month),
    getSaleCounts(deps, config, month),
  ]);

  const activityByDay = new Map(activityDays.map((day) => [utcDayKey(day.date), day]));
  const monthBounds = periodRange(month.year, month.month);
  const todayKey = utcDayKey(clockNow(deps));

  const days: MonthDayRow[] = [];
  for (
    let cursor = new Date(monthBounds.gte);
    cursor < monthBounds.lt;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const dayKey = utcDayKey(cursor);
    const stored = activityByDay.get(dayKey);
    const isArchived = config.activeFrom !== null && cursor < config.activeFrom;

    const derivedAppointments = appointmentCounts.byDay.get(dayKey);
    const derivedSales = saleCounts.get(dayKey);

    const welcome = channelCounts(
      isArchived,
      { appointments: stored?.archivedWelcomeAppointments, sales: stored?.archivedWelcomeSales },
      derivedAppointments?.welcome,
      derivedSales?.welcome,
    );
    const outbound = channelCounts(
      isArchived,
      { appointments: stored?.archivedOutboundAppointments, sales: stored?.archivedOutboundSales },
      derivedAppointments?.outbound,
      derivedSales?.outbound,
    );
    const inbound = channelCounts(
      isArchived,
      { appointments: stored?.archivedInboundAppointments, sales: stored?.archivedInboundSales },
      derivedAppointments?.inbound,
      derivedSales?.inbound,
    );

    days.push({
      date: dayKey,
      isArchived,
      isFuture: dayKey > todayKey,
      welcome: { ...welcome, sent: stored?.welcomeSent ?? 0, replies: stored?.welcomeReplies ?? 0 },
      outbound: {
        ...outbound,
        comments: stored?.outboundComments ?? 0,
        stories: stored?.outboundStories ?? 0,
        archivedMessages: isArchived ? (stored?.archivedOutboundMessages ?? 0) : null,
        replies: stored?.outboundReplies ?? 0,
      },
      inbound: { ...inbound, received: stored?.inboundReceived ?? 0 },
      totalAppointments: welcome.appointments + outbound.appointments + inbound.appointments,
      totalSales: welcome.sales + outbound.sales + inbound.sales,
    });
  }

  const totals = sumColumns(days);

  return {
    year: month.year,
    month: month.month,
    days,
    totals,
    rates: conversionRates(totals),
    containsArchivedDays: days.some((day) => day.isArchived),
    containsLiveDays: days.some((day) => !day.isArchived),
    unattributedLeadCount: appointmentCounts.unattributedLeadCount,
  };
}

/**
 * Un giorno di archivio prende i conteggi congelati (nessun lead dietro); un
 * giorno vivo li prende dalle entità reali.
 */
function channelCounts(
  isArchived: boolean,
  frozen: { appointments?: number | null; sales?: number | null },
  derivedAppointments: DerivedCount = ZERO_COUNT,
  derivedSales: DerivedCount = ZERO_COUNT,
): ChannelDayCounts {
  if (isArchived) {
    return {
      appointments: frozen.appointments ?? 0,
      appointmentsFromInsight: 0,
      sales: frozen.sales ?? 0,
      salesFromInsight: 0,
    };
  }
  return {
    appointments: derivedAppointments.total,
    appointmentsFromInsight: derivedAppointments.fromInsight,
    sales: derivedSales.total,
    salesFromInsight: derivedSales.fromInsight,
  };
}
```

- [ ] **Step 4: Eseguire i test**

Run: `pnpm test -- src/server/insight/`
Expected: PASS, inclusi i test di `totals.test.ts` che ora trovano `MonthDayRow`.

- [ ] **Step 5: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): assemble the month view merging live and archived days"`

---

### Task 9: Salvataggio dei contatori manuali

**Files:**
- Modify: `src/server/insight/schemas.ts`
- Create: `src/server/insight/save-activity-day.ts`
- Create: `src/server/insight/save-activity-day.test.ts`

**Interfaces:**
- Consumes: `InsightDeps`, `clockNow`, `getInsightConfig`, `parseInput`, `ValidationError` (`@/lib/errors` — verificare il nome esatto usato da `parseInput`).
- Produces:
  - `saveActivityDaySchema` (Zod): `{ date: string YYYY-MM-DD; welcomeSent: int ≥0; welcomeReplies: int ≥0; outboundComments: int ≥0; outboundStories: int ≥0; outboundReplies: int ≥0; inboundReceived: int ≥0 }` con due `refine`:
    - `welcomeReplies ≤ welcomeSent`
    - `outboundReplies ≤ outboundComments + outboundStories`
  - `saveActivityDay(deps: InsightDeps, input: unknown): Promise<void>`

**Regole di rifiuto:** giorno futuro, giorno di archivio (`date < insightActiveFrom`), interi negativi, risposte superiori ai messaggi. Le prime due si verificano nell'use case (dipendono da stato), le altre nello schema.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/save-activity-day.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { saveActivityDay } from "@/server/insight/save-activity-day";
import { InsightStore } from "@/server/insight/test-helpers";

const MID_SEPTEMBER = () => new Date("2026-09-10T12:00:00.000Z");

function validCounters(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-09-09",
    welcomeSent: 30,
    welcomeReplies: 3,
    outboundComments: 2,
    outboundStories: 1,
    outboundReplies: 2,
    inboundReceived: 1,
    ...overrides,
  };
}

function seedConfiguredTenant(activeFrom: Date | null = new Date(Date.UTC(2026, 8, 1))) {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id, insightActiveFrom: activeFrom });
  return store;
}

describe("saveActivityDay", () => {
  it("creates the row when the day has none yet", async () => {
    const store = seedConfiguredTenant();

    await saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters());

    const saved = store.chatActivityDays.find((day) => day.organizationId === "org-a");
    expect(saved?.welcomeSent).toBe(30);
    expect(saved?.isArchived).toBe(false);
  });

  it("updates the row when it already exists — one row per day per tenant", async () => {
    const store = seedConfiguredTenant();
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-09", welcomeSent: 5 });

    await saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters({ welcomeSent: 42 }));

    const rows = store.chatActivityDays.filter((day) => day.organizationId === "org-a");
    expect(rows).toHaveLength(1);
    expect(rows[0].welcomeSent).toBe(42);
  });

  it("rejects more welcome replies than welcome messages sent", async () => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(
        store.deps("org-a", MID_SEPTEMBER),
        validCounters({ welcomeSent: 3, welcomeReplies: 5 }),
      ),
    ).rejects.toThrow();
  });

  it("rejects more outbound replies than comments plus stories", async () => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(
        store.deps("org-a", MID_SEPTEMBER),
        validCounters({ outboundComments: 1, outboundStories: 1, outboundReplies: 5 }),
      ),
    ).rejects.toThrow();
  });

  it("rejects negative counters", async () => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters({ inboundReceived: -1 })),
    ).rejects.toThrow();
  });

  it("refuses to write a future day", async () => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters({ date: "2026-09-11" })),
    ).rejects.toThrow();
  });

  it("refuses to write an archived day — history is read-only", async () => {
    const store = seedConfiguredTenant(new Date(Date.UTC(2026, 8, 5)));

    await expect(
      saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters({ date: "2026-09-02" })),
    ).rejects.toThrow();
  });

  it("writes into the caller's tenant only", async () => {
    const store = seedConfiguredTenant();
    store.addOrganization({ id: "org-b", insightSourceId: null });

    await saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters());

    expect(store.chatActivityDays.every((day) => day.organizationId === "org-a")).toBe(true);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/save-activity-day.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Estendere `schemas.ts`**

```ts
const counter = z.coerce.number().int().min(0).max(100_000);

/**
 * Contatori manuali di una giornata.
 *
 * I due `refine` sono il controllo che nel foglio Excel manca: 24 giorni hanno
 * più risposte outbound che messaggi inviati e 5 più risposte welcome che
 * welcome, errori di battitura che nessuno ha mai visto. Qui il salvataggio si
 * rifiuta e spiega perché.
 */
export const saveActivityDaySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .transform((day) => new Date(`${day}T00:00:00.000Z`)),
    welcomeSent: counter,
    welcomeReplies: counter,
    outboundComments: counter,
    outboundStories: counter,
    outboundReplies: counter,
    inboundReceived: counter,
  })
  .refine((counters) => counters.welcomeReplies <= counters.welcomeSent, {
    path: ["welcomeReplies"],
    message: "insight.errors.repliesExceedWelcome",
  })
  .refine(
    (counters) =>
      counters.outboundReplies <= counters.outboundComments + counters.outboundStories,
    { path: ["outboundReplies"], message: "insight.errors.repliesExceedOutbound" },
  );

export type SaveActivityDayInput = z.infer<typeof saveActivityDaySchema>;
```

I due `message` sono CHIAVI i18n, non testo: il layer UI le traduce (stesso pattern degli errori di campo già in uso nelle Server Action).

- [ ] **Step 4: Scrivere `save-activity-day.ts`**

```ts
import { ValidationError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { getInsightConfig } from "@/server/insight/config";
import { utcDayKey } from "@/server/insight/counts";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { saveActivityDaySchema } from "@/server/insight/schemas";

/**
 * Salva (crea o aggiorna) i sei contatori manuali di una giornata.
 *
 * Due rifiuti che dipendono dallo stato e non possono stare nello schema:
 *  - **giorno futuro**: non si registra attività che non è ancora avvenuta;
 *  - **giorno di archivio** (`date < insightActiveFrom`): lo storico importato
 *    dall'Excel è in sola lettura, il presente non lo riscrive e viceversa.
 *
 * L'upsert sulla chiave `(organizationId, date)` garantisce una riga sola per
 * giorno: salvare due volte non duplica.
 */
export async function saveActivityDay(deps: InsightDeps, input: unknown): Promise<void> {
  const counters = parseInput(saveActivityDaySchema, input);

  const today = utcDayKey(clockNow(deps));
  const requestedDay = utcDayKey(counters.date);
  if (requestedDay > today) {
    throw new ValidationError({ date: ["insight.errors.futureDay"] });
  }

  const config = await getInsightConfig(deps);
  if (config?.activeFrom && counters.date < config.activeFrom) {
    throw new ValidationError({ date: ["insight.errors.archivedDay"] });
  }

  const { date, ...manualCounters } = counters;

  await deps.prisma.chatActivityDay.upsert({
    where: { organizationId_date: { organizationId: deps.actor.organizationId, date } },
    create: { organizationId: deps.actor.organizationId, date, ...manualCounters },
    update: manualCounters,
  });

  await deps.audit.record({
    action: "insight.activityDay.save",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "ChatActivityDay",
    entityId: requestedDay,
  });
}
```

`ValidationError` prende una mappa `campo -> messaggi` (`src/lib/errors.ts`), la stessa forma prodotta da `parseInput`: il layer form la legge già così, senza casi speciali.

- [ ] **Step 5: Eseguire il test**

Run: `pnpm test -- src/server/insight/save-activity-day.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): save manual activity counters with server-side validation"`

---

### Task 10: Campo "Canale" sul lead

**Files:**
- Modify: `src/server/leads/schemas.ts`
- Modify: `src/server/leads/create-lead.ts`
- Modify: `src/server/leads/update-lead.ts`
- Modify: `src/server/leads/create-lead.test.ts`
- Modify: `src/server/leads/update-lead.test.ts`
- Modify: `src/server/leads/selectors.ts` (esporre `chatChannel` nel dettaglio)
- Modify: `src/components/leads/new-lead-dialog.tsx`
- Modify: `src/components/leads/detail/…` (dialogo di modifica: individuare il file reale)

**Interfaces:**
- Consumes: `createLeadSchema`/`updateLeadSchema` esistenti, `assertSourceBelongsToTenant`.
- Produces: `chatChannel?: ChatChannel | null` su entrambi gli schemi; `createLead` e `updateLead` che lo persistono; `requireChannelForLinkedSource(deps, sourceId, chatChannel)` — helper condiviso che solleva `ValidationError` quando la provenienza è quella collegata e il canale manca.

**Perché obbligatorio solo lì:** senza il canale un lead Instagram non finisce in nessuna colonna e la tabella diverge dalla pipeline in modo inspiegabile. L'obbligo è mirato: nessun attrito sui lead di altra provenienza.

- [ ] **Step 1: Scrivere i test**

In `src/server/leads/create-lead.test.ts`:

```ts
it("stores the chat channel when provided", async () => {
  const { deps, store, sourceId } = seedTenant();

  const { id } = await createLead(deps, {
    firstName: "Marco",
    lastName: "Bianchi",
    sourceId,
    chatChannel: ChatChannel.OUTBOUND_STORY,
  });

  expect(store.leads.find((lead) => lead.id === id)?.chatChannel).toBe(
    ChatChannel.OUTBOUND_STORY,
  );
});

it("requires a chat channel when the source is the one linked to Insight & Stats", async () => {
  const { deps, sourceId } = seedTenant({ insightSourceId: "same" });

  await expect(
    createLead(deps, { firstName: "Marco", lastName: "Bianchi", sourceId }),
  ).rejects.toThrow(ValidationError);
});

it("does not require a chat channel for any other source", async () => {
  const { deps, otherSourceId } = seedTenant({ insightSourceId: "same" });

  await expect(
    createLead(deps, { firstName: "Marco", lastName: "Bianchi", sourceId: otherSourceId }),
  ).resolves.toBeDefined();
});
```

In `src/server/leads/update-lead.test.ts`, l'equivalente per la modifica: cambiare la provenienza a quella collegata senza indicare il canale deve fallire; indicandolo deve salvarlo.

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/server/leads/create-lead.test.ts`
Expected: FAIL — `chatChannel` non riconosciuto dallo schema.

- [ ] **Step 3: Estendere gli schemi**

In `src/server/leads/schemas.ts`, aggiungere a `createLeadSchema` e `updateLeadSchema`:

```ts
  // Canale della chat da cui nasce il lead (sezione Insight & Stats).
  // Obbligatorio solo quando `sourceId` è la provenienza collegata al tenant:
  // il controllo è nell'use case perché dipende dalla configurazione, non
  // dall'input (vedi `requireChannelForLinkedSource`).
  chatChannel: z.nativeEnum(ChatChannel).nullable().optional(),
```

- [ ] **Step 4: Scrivere l'helper condiviso**

Nuovo file `src/server/leads/chat-channel.ts` — usato da `createLead`, `updateLead` e dalla creazione da cella, così la regola vive in un posto solo:

```ts
import type { ChatChannel } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import type { LeadDeps } from "@/server/leads/deps";

/**
 * Il canale di chat è obbligatorio quando la provenienza del lead è quella
 * collegata a Insight & Stats: un lead senza canale non finirebbe in nessuna
 * colonna e la sezione divergerebbe dalla pipeline senza spiegazione.
 *
 * Il vincolo NON è nello schema Zod perché dipende dalla configurazione del
 * tenant (`Organization.insightSourceId`), non dalla forma dell'input.
 */
export async function requireChannelForLinkedSource(
  deps: LeadDeps,
  sourceId: string | null | undefined,
  chatChannel: ChatChannel | null | undefined,
): Promise<void> {
  if (!sourceId || chatChannel) {
    return;
  }

  const organization = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: { insightSourceId: true },
  });

  if (organization?.insightSourceId === sourceId) {
    throw new ValidationError({ chatChannel: ["leads.errors.chatChannelRequired"] });
  }
}
```

- [ ] **Step 5: Usarlo negli use case**

In `create-lead.ts`, subito dopo `assertSourceBelongsToTenant`, chiamare `await requireChannelForLinkedSource(deps, data.sourceId, data.chatChannel)` e aggiungere `chatChannel: data.chatChannel ?? null` al `data` della `create`. Stessa cosa in `update-lead.ts`, usando la provenienza risultante dopo l'aggiornamento (quella nuova se fornita, altrimenti quella già sul lead).

- [ ] **Step 6: Eseguire i test**

Run: `pnpm test -- src/server/leads/`
Expected: PASS.

- [ ] **Step 7: Aggiungere il select nei form**

In `src/components/leads/new-lead-dialog.tsx` e nel dialogo di modifica: un `<Select>` "Canale" con le quattro opzioni, che **compare solo** quando la provenienza selezionata coincide con quella collegata (prop `insightSourceId` passata dal Server Component che già carica le `sources`). Le etichette arrivano da `useChatChannelLabel()` (Task 13), non da stringhe scritte nel componente.

- [ ] **Step 8: Verificare**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: tutto verde.

- [ ] **Step 9: Commit**

Comando: `git add src/server/leads src/components/leads` poi `git commit -m "feat(leads): chat channel field, required for the Insight-linked source"`

---

### Task 11: Creazione di lead + appuntamento da una cella

**Files:**
- Create: `src/server/insight/create-lead-from-cell.ts`
- Create: `src/server/insight/create-lead-from-cell.test.ts`
- Modify: `src/server/insight/schemas.ts`

**Interfaces:**
- Consumes: `InsightDeps`, `getInsightConfig`, `parseInput`, `resolveCapital` (`@/lib/capital`), `LeadStage`, `AppointmentStatus`.
- Produces:
  - `createLeadFromCellSchema`: `{ firstName; lastName; email?; phone?; chatChannel: ChatChannel; appointmentAt: Date; reason: string; capitalAmount?; capitalBracket? }`
  - `createLeadFromCell(deps, input): Promise<{ leadId: string; appointmentId: string }>`

**Invarianti:** provenienza forzata a `config.sourceId` (mai dall'input), `createdFromInsight = true`, lead e appuntamento creati **nella stessa transazione** — nessun lead orfano se la seconda scrittura fallisce.

- [ ] **Step 1: Scrivere il test**

`src/server/insight/create-lead-from-cell.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { createLeadFromCell } from "@/server/insight/create-lead-from-cell";
import { InsightStore } from "@/server/insight/test-helpers";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Marco",
    lastName: "Bianchi",
    chatChannel: ChatChannel.OUTBOUND_COMMENT,
    appointmentAt: "2026-09-12T10:30:00.000Z",
    reason: "Call conoscitiva",
    ...overrides,
  };
}

function seedConfiguredTenant() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, sourceId: source.id };
}

describe("createLeadFromCell", () => {
  it("creates the lead with the linked source and the cell's channel", async () => {
    const { store, sourceId } = seedConfiguredTenant();

    const { leadId } = await createLeadFromCell(store.deps("org-a"), validInput());
    const lead = store.leads.find((row) => row.id === leadId);

    expect(lead?.sourceId).toBe(sourceId);
    expect(lead?.chatChannel).toBe(ChatChannel.OUTBOUND_COMMENT);
    expect(lead?.stage).toBe(LeadStage.TO_HANDLE);
  });

  it("marks the lead as created from the Insight section", async () => {
    const { store } = seedConfiguredTenant();

    const { leadId } = await createLeadFromCell(store.deps("org-a"), validInput());

    expect(store.leads.find((row) => row.id === leadId)?.createdFromInsight).toBe(true);
  });

  it("creates the appointment linked to the new lead", async () => {
    const { store } = seedConfiguredTenant();

    const { leadId, appointmentId } = await createLeadFromCell(store.deps("org-a"), validInput());
    const appointment = store.appointments.find((row) => row.id === appointmentId);

    expect(appointment?.leadId).toBe(leadId);
    expect(appointment?.startAt).toEqual(new Date("2026-09-12T10:30:00.000Z"));
  });

  it("ignores any source sent by the client — the tenant configuration wins", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });

    const { leadId } = await createLeadFromCell(
      store.deps("org-a"),
      validInput({ sourceId: otherSource.id }),
    );

    expect(store.leads.find((row) => row.id === leadId)?.sourceId).toBe(sourceId);
  });

  it("refuses to create anything when the tenant has no linked source", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    await expect(createLeadFromCell(store.deps("org-a"), validInput())).rejects.toThrow();
    expect(store.leads).toHaveLength(0);
  });

  it("leaves no orphan lead when the appointment cannot be created", async () => {
    const { store } = seedConfiguredTenant();
    store.failNextAppointmentCreate();

    await expect(createLeadFromCell(store.deps("org-a"), validInput())).rejects.toThrow();
    expect(store.leads).toHaveLength(0);
  });

  it("requires the channel", async () => {
    const { store } = seedConfiguredTenant();

    await expect(
      createLeadFromCell(store.deps("org-a"), validInput({ chatChannel: undefined })),
    ).rejects.toThrow();
  });

  it("writes into the caller's tenant only", async () => {
    const { store } = seedConfiguredTenant();

    await createLeadFromCell(store.deps("org-a"), validInput());

    expect(store.leads.every((lead) => lead.organizationId === "org-a")).toBe(true);
    expect(store.appointments.every((row) => row.organizationId === "org-a")).toBe(true);
  });
});
```

`failNextAppointmentCreate()` va aggiunto a `InsightStore`: fa fallire la prossima `appointment.create` e, dentro `$transaction`, annulla le scritture della callback (il fake tiene una copia degli array prima di eseguirla e la ripristina in caso di errore). È il minimo che serve per verificare l'assenza di lead orfani senza un database vero.

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/create-lead-from-cell.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Estendere `schemas.ts`**

```ts
export const createLeadFromCellSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  // Il canale arriva dalla CELLA cliccata, non da una scelta libera dell'utente.
  chatChannel: z.nativeEnum(ChatChannel),
  appointmentAt: z.coerce.date(),
  reason: z.string().trim().min(1).max(200),
  capitalAmount: z.coerce.number().nonnegative().optional(),
  capitalBracket: z.nativeEnum(CapitalBracket).optional(),
});
```

Allineare i limiti di lunghezza a quelli già usati in `createLeadSchema` invece di sceglierne di nuovi.

- [ ] **Step 4: Scrivere `create-lead-from-cell.ts`**

```ts
import { AppointmentStatus, LeadStage } from "@/generated/prisma/enums";
import { resolveCapital } from "@/lib/capital";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { getInsightConfig } from "@/server/insight/config";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { createLeadFromCellSchema } from "@/server/insight/schemas";

/**
 * Crea lead e appuntamento insieme, dal clic su una cella "Appuntamenti".
 *
 * Provenienza e canale NON arrivano dal client: la provenienza è quella
 * configurata per il tenant e il canale è quello della colonna cliccata (già
 * validato dallo schema). Un client che provasse a inviarne altri viene ignorato.
 *
 * Le due scritture stanno in UNA transazione: se l'appuntamento fallisce non
 * resta un lead orfano che gonfierebbe la pipeline senza comparire in tabella.
 */
export interface CreateLeadFromCellResult {
  readonly leadId: string;
  readonly appointmentId: string;
}

export async function createLeadFromCell(
  deps: InsightDeps,
  input: unknown,
): Promise<CreateLeadFromCellResult> {
  const data = parseInput(createLeadFromCellSchema, input);

  const config = await getInsightConfig(deps);
  if (!config) {
    throw new NotFoundError("Insight section is not configured for this tenant");
  }

  const capital = resolveCapital({
    capitalAmount: data.capitalAmount,
    capitalBracket: data.capitalBracket,
  });
  const now = clockNow(deps);

  const created = await deps.prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        organizationId: deps.actor.organizationId,
        ownerId: deps.actor.userId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
        sourceId: config.sourceId,
        chatChannel: data.chatChannel,
        createdFromInsight: true,
        stage: LeadStage.TO_HANDLE,
        stageChangedAt: now,
        capitalBracket: capital?.capitalBracket ?? null,
        capitalAmount: capital?.capitalAmount ?? null,
      },
      select: { id: true },
    });

    const appointment = await tx.appointment.create({
      data: {
        organizationId: deps.actor.organizationId,
        ownerId: deps.actor.userId,
        leadId: lead.id,
        startAt: data.appointmentAt,
        reason: data.reason,
        status: AppointmentStatus.PENDING,
      },
      select: { id: true },
    });

    return { leadId: lead.id, appointmentId: appointment.id };
  });

  await deps.audit.record({
    action: "insight.lead.createFromCell",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: created.leadId,
    meta: { chatChannel: data.chatChannel, appointmentId: created.appointmentId },
  });

  return created;
}
```

- [ ] **Step 5: Eseguire il test**

Run: `pnpm test -- src/server/insight/create-lead-from-cell.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): create lead and appointment from a table cell in one transaction"`

---

### Task 12: Drill-down — i lead dietro una cella

**Files:**
- Create: `src/server/insight/list-cell-leads.ts`
- Create: `src/server/insight/list-cell-leads.test.ts`
- Modify: `src/server/insight/schemas.ts`
- Create: `src/server/insight/index.ts` (barrel, come `src/server/leads/index.ts`)

**Interfaces:**
- Consumes: `getAppointmentCounts`/`getSaleCounts` (stessa logica di attribuzione — riusare le funzioni, non riscrivere le query), `channelGroupOf`.
- Produces:
  - `cellLeadsSchema`: `{ date: YYYY-MM-DD; group: "welcome" | "outbound" | "inbound"; metric: "appointments" | "sales" }`
  - `interface CellLead { readonly id: string; readonly firstName: string; readonly lastName: string; readonly stage: LeadStage; readonly createdFromInsight: boolean }`
  - `listCellLeads(deps, input): Promise<CellLead[]>`

**Attenzione alla duplicazione:** l'attribuzione giorno/canale è già in `get-appointment-counts.ts` e `get-sale-counts.ts`. Estrarre da entrambe una funzione che restituisce la lista `{ leadId, dayKey, group }` e farla usare sia ai conteggi sia al drill-down. Nessuna seconda implementazione della regola "primo appuntamento" / "ultimo WON".

- [ ] **Step 1: Rifattorizzare i due moduli di conteggio**

Estrarre in `src/server/insight/attribution.ts`:

```ts
export interface AttributedLead {
  readonly leadId: string;
  readonly dayKey: string;
  readonly group: ChannelGroup;
  readonly createdFromInsight: boolean;
}

/** Lead attribuiti al mese per gli APPUNTAMENTI (regola del primo appuntamento). */
export async function attributeAppointments(
  deps: InsightDeps,
  config: InsightConfig,
  month: MonthInput,
): Promise<{ attributed: AttributedLead[]; unattributedLeadCount: number }>;

/** Lead attribuiti al mese per le VENDITE (ultimo passaggio a WON, stage corrente WON). */
export async function attributeSales(
  deps: InsightDeps,
  config: InsightConfig,
  month: MonthInput,
): Promise<AttributedLead[]>;
```

`getAppointmentCounts` e `getSaleCounts` diventano l'aggregazione di queste liste in mappe di `DerivedCount`. I test già scritti nei Task 5 e 6 devono continuare a passare senza modifiche: sono la rete di sicurezza del rifattoro.

- [ ] **Step 2: Eseguire i test esistenti dopo il rifattoro**

Run: `pnpm test -- src/server/insight/`
Expected: PASS — nessun test modificato.

- [ ] **Step 3: Scrivere il test del drill-down**

`src/server/insight/list-cell-leads.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { listCellLeads } from "@/server/insight/list-cell-leads";
import { InsightStore } from "@/server/insight/test-helpers";

function seedConfiguredTenant() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, sourceId: source.id };
}

describe("listCellLeads", () => {
  it("lists the leads behind an appointments cell", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
      firstName: "Marco",
      lastName: "Bianchi",
      stage: LeadStage.CALL_SCHEDULED,
      createdFromInsight: true,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-07",
      group: "welcome",
      metric: "appointments",
    });

    expect(leads).toEqual([
      {
        id: lead.id,
        firstName: "Marco",
        lastName: "Bianchi",
        stage: LeadStage.CALL_SCHEDULED,
        createdFromInsight: true,
      },
    ]);
  });

  it("lists the leads behind a sales cell", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.INBOUND,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-15",
    });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-15",
      group: "inbound",
      metric: "sales",
    });

    expect(leads.map((row) => row.id)).toEqual([lead.id]);
  });

  it("returns an empty list for another channel's cell on the same day", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-07",
      group: "inbound",
      metric: "appointments",
    });

    expect(leads).toEqual([]);
  });

  it("never returns another tenant's leads", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-b", leadId: lead.id, createdAt: "2026-09-07" });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-07",
      group: "welcome",
      metric: "appointments",
    });

    expect(leads).toEqual([]);
  });

  it("rejects a malformed date", async () => {
    const { store } = seedConfiguredTenant();

    await expect(
      listCellLeads(store.deps("org-a"), {
        date: "07/09/2026",
        group: "welcome",
        metric: "appointments",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/list-cell-leads.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 5: Aggiungere `cellLeadsSchema` a `schemas.ts`**

```ts
/**
 * Coordinate della cella su cui si è cliccato. `group` e `metric` sono chiusi:
 * il client non sceglie una query, sceglie una cella che esiste in tabella.
 */
export const cellLeadsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .transform((day) => new Date(`${day}T00:00:00.000Z`)),
  group: z.enum(["welcome", "outbound", "inbound"]),
  metric: z.enum(["appointments", "sales"]),
});
```

- [ ] **Step 6: Scrivere `list-cell-leads.ts`**

```ts
import type { LeadStage } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import { attributeAppointments, attributeSales } from "@/server/insight/attribution";
import { getInsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { cellLeadsSchema } from "@/server/insight/schemas";

/**
 * I lead che stanno dietro al numero di una cella calcolata.
 *
 * Riusa la STESSA attribuzione dei conteggi (`attribution.ts`): il popover non
 * può mostrare un elenco diverso dal numero che lo ha aperto.
 */
export interface CellLead {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stage: LeadStage;
  readonly createdFromInsight: boolean;
}

export async function listCellLeads(deps: InsightDeps, input: unknown): Promise<CellLead[]> {
  const cell = parseInput(cellLeadsSchema, input);

  const config = await getInsightConfig(deps);
  if (!config) {
    throw new NotFoundError("Insight section is not configured for this tenant");
  }

  const month = { year: cell.date.getUTCFullYear(), month: cell.date.getUTCMonth() + 1 };
  const attributed =
    cell.metric === "appointments"
      ? (await attributeAppointments(deps, config, month)).attributed
      : await attributeSales(deps, config, month);

  const dayKey = cell.date.toISOString().slice(0, 10);
  const leadIds = attributed
    .filter((entry) => entry.dayKey === dayKey && entry.group === cell.group)
    .map((entry) => entry.leadId);

  if (leadIds.length === 0) {
    return [];
  }

  return deps.prisma.lead.findMany({
    where: { id: { in: leadIds } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stage: true,
      createdFromInsight: true,
    },
  });
}
```

- [ ] **Step 7: Eseguire il test**

Run: `pnpm test -- src/server/insight/`
Expected: PASS.

- [ ] **Step 8: Scrivere il barrel `index.ts`**

Esportare solo ciò che serve fuori dal modulo: `getMonthView`, `saveActivityDay`, `createLeadFromCell`, `listCellLeads`, `getInsightConfig`, `buildInsightDeps` e i tipi pubblici. Stessa forma di `src/server/leads/index.ts`.

- [ ] **Step 9: Commit**

Comando: `git add src/server/insight` poi `git commit -m "feat(insight): shared attribution and cell drill-down"`

---

### Task 13: Stringhe, navigazione e guscio della pagina

**Files:**
- Modify: `messages/it.json`, `messages/en.json`
- Create: `src/i18n/…` voce per `useChatChannelLabel` (individuare il file reale delle label enum, es. `src/i18n/enum-labels.ts`)
- Modify: `src/server/organization/get-shell-branding.ts`
- Modify: `src/components/layout/nav-items.ts`
- Modify: `src/components/layout/sidebar-nav.tsx`, `sidebar.tsx`, `header.tsx`, `mobile-drawer.tsx` (propagazione della label)
- Modify: `src/app/[locale]/(app)/layout.tsx`
- Create: `src/app/[locale]/(app)/insight/page.tsx`
- Modify: `src/components/layout/sidebar-nav.test.tsx`

**Interfaces:**
- Consumes: `getTenantFeatureFlags`, `enabledFeatureKeys`, `requirePermission`, `getShellBranding`, `getMonthView`, `buildInsightDeps`.
- Produces:
  - `ShellBranding.insightSourceLabel: string | null`
  - voce di navigazione `{ messageKey: "insight", href: "/insight", icon: InsightIcon, feature: "insightStats" }`
  - `useChatChannelLabel(): (channel: ChatChannel) => string`
  - pagina `/insight` che rende la tabella o lo stato "da configurare".

- [ ] **Step 1: Aggiungere le stringhe**

In `messages/it.json`, nuovo namespace `insight` con almeno: `title` (`"{source} Stats"`), `titleFallback` (`"Insight & Stats"`), `unconfigured.title`/`unconfigured.description`, intestazioni di colonna (`columns.welcomeSent`, `columns.replies`, `columns.comments`, `columns.stories`, `columns.received`, `columns.appointments`, `columns.sales`), gruppi (`groups.welcome`, `groups.outbound`, `groups.inbound`, `groups.total`), righe di riepilogo (`summary.total`, `summary.conversion`, `summary.mixedPeriod`), archivio (`archive.badge`, `archive.messages`), KPI (`kpis.*`), avviso (`unattributed.message`), tooltip (`tooltip.composition`), errori (`errors.repliesExceedWelcome`, `errors.repliesExceedOutbound`, `errors.futureDay`, `errors.archivedDay`), dialogo (`newLead.*`), popover (`cellLeads.*`).

In `nav`, la chiave `insight` con valore `"{source} Stats"`.
In `enum.chatChannel`: `WELCOME` → "Welcome", `OUTBOUND_COMMENT` → "Commento", `OUTBOUND_STORY` → "Storia", `INBOUND` → "Inbound".
In `leads.errors`: `chatChannelRequired`.

Replicare **tutte** le chiavi in `messages/en.json`. Nessun testo scritto nei componenti.

- [ ] **Step 2: Estendere `getShellBranding`**

Aggiungere alla `select` esistente (nessuna query in più):

```ts
      insightSource: { select: { label: true } },
```

e al risultato `insightSourceLabel: org?.insightSource?.label ?? null`.

- [ ] **Step 3: Aggiungere la voce di navigazione**

In `nav-items.ts`: estendere `NavMessageKey` con `"insight"` e aggiungere la voce con `feature: "insightStats"`, subito dopo `dashboard`. Serve una nuova icona in `src/components/layout/icons.tsx` (coerente con le esistenti: `currentColor`, `viewBox="0 0 24 24"`).

`visibleNavItems` funziona già così com'è: filtra sulla presenza del flag. Nessuna modifica.

- [ ] **Step 4: Propagare la label dinamica**

`layout.tsx` passa `insightSourceLabel={branding.insightSourceLabel}` a `Sidebar` e `Header`; `SidebarNav` risolve l'etichetta con `t(item.messageKey, { source: insightSourceLabel ?? "" })` **solo** per la voce `insight`, e usa `titleFallback` quando la label è `null`. Troncamento con ellissi via classe Tailwind (`truncate`) e `title` completo sull'elemento.

- [ ] **Step 5: Aggiornare il test della navigazione**

In `sidebar-nav.test.tsx`, due casi: con `insightStats` spento la voce non compare; con flag acceso e provenienza "Instagram" la voce si chiama "Instagram Stats".

- [ ] **Step 6: Scrivere la pagina**

`src/app/[locale]/(app)/insight/page.tsx` — Server Component sul modello di `dashboard/page.tsx`:

```tsx
import { notFound } from "next/navigation";

/**
 * Insight & Stats (docs/superpowers/specs/2026-09-10-insight-stats-design.md).
 *
 * Guardie, in quest'ordine:
 *  1. feature flag `insightStats` spento ⇒ `notFound()` — un 404, non un 403:
 *     un 403 confermerebbe l'esistenza della sezione (stesso pattern di
 *     `settings/integrations/page.tsx`);
 *  2. capability `insight.view` mancante ⇒ `requirePermission` solleva 403.
 *
 * Con il flag acceso ma nessuna provenienza collegata la pagina spiega cosa
 * manca, invece di mostrare una tabella vuota e inspiegabile.
 */
export default async function InsightPage({ searchParams }) {
  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.insightStats) {
    notFound();
  }
  requirePermission(ctx.role, "insight.view");

  const { year, month } = resolveMonthFromSearchParams(await searchParams, new Date());
  const view = await getMonthView(buildInsightDeps(ctx), { year, month });

  if (!view) {
    return <UnconfiguredNotice />;
  }

  return <InsightMonth view={view} canEdit={can(ctx.role, "insight.edit")} />;
}
```

`resolveMonthFromSearchParams` è una funzione locale che legge `?year=&month=` con `monthSchema` e cade sul mese corrente quando mancano o sono invalidi (stesso comportamento tollerante del filtro dashboard: parametri URL sono input non fidato, non devono far esplodere la pagina).

Verificare i nomi reali di `requireTenantContext` e `requirePermission` in `src/lib/tenant.ts` / `src/lib/rbac.ts` e usare quelli.

- [ ] **Step 7: Verificare**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: verde.

- [ ] **Step 8: Commit**

Comando: `git add messages src/i18n src/components/layout src/server/organization src/app` poi `git commit -m "feat(insight): navigation, dynamic section title and page shell"`

---

### Task 14: Server Actions di scrittura

**Files:**
- Create: `src/app/[locale]/(app)/insight/actions.ts`
- Create: `src/app/[locale]/(app)/insight/actions.test.ts`

**Interfaces:**
- Consumes: `saveActivityDay`, `createLeadFromCell`, `listCellLeads`, `ActionState`/`toActionState` (`src/server/actions/action-result.ts`), `requireTenantContext`, `requirePermission`, `getTenantFeatureFlags`.
- Produces:
  - `saveActivityDayAction(prevState: ActionState, formData: FormData): Promise<ActionState>`
  - `createLeadFromCellAction(prevState: ActionState, formData: FormData): Promise<ActionState>`
  - `listCellLeadsAction(input: { date: string; group: string; metric: string }): Promise<CellLead[]>`

**Guardie obbligatorie in OGNI action**, nell'ordine: sessione → feature flag → capability → validazione. Il flag va ricontrollato qui e non solo nella pagina: una Server Action è un endpoint a sé.

- [ ] **Step 1: Scrivere i test**

`src/app/[locale]/(app)/insight/actions.test.ts` — seguire la struttura dei test di action già presenti (es. `settings/data-retention/actions.test.ts`), con i moduli di sessione e contesto mockati:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, ValidationError } from "@/lib/errors";

/**
 * Stessa impostazione di `settings/data-retention/actions.test.ts`: si usa il
 * VERO `requirePermission`, così il diniego per baseUser è verificato contro la
 * matrice reale. Si mockano solo contesto tenant, flag e costruttori di deps.
 */
const requireTenantContext = vi.fn();
const getTenantFeatureFlags = vi.fn();
const buildInsightDeps = vi.fn((..._a: unknown[]) => ({ kind: "insight" }));
const saveActivityDay = vi.fn();
const createLeadFromCell = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantContext: (...a: unknown[]) => requireTenantContext(...a),
}));
vi.mock("@/server/tenant/feature-flags", () => ({
  getTenantFeatureFlags: (...a: unknown[]) => getTenantFeatureFlags(...a),
}));
vi.mock("@/server/insight", async () => {
  const actual = await vi.importActual<typeof import("@/server/insight")>("@/server/insight");
  return {
    ...actual,
    buildInsightDeps: (...a: unknown[]) => buildInsightDeps(...a),
    saveActivityDay: (...a: unknown[]) => saveActivityDay(...a),
    createLeadFromCell: (...a: unknown[]) => createLeadFromCell(...a),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createLeadFromCellAction,
  saveActivityDayAction,
} from "@/app/[locale]/(app)/insight/actions";

const PRO = { kind: "tenant", role: "proUser", organizationId: "org_a", userId: "u" };
const BASE = { kind: "tenant", role: "baseUser", organizationId: "org_a", userId: "u" };
const FLAGS_ON = { insightStats: true, leads: true };
const FLAGS_OFF = { insightStats: false, leads: true };
const IDLE = { status: "idle" } as const;

function counterForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    date: "2026-09-09",
    welcomeSent: "30",
    welcomeReplies: "3",
    outboundComments: "2",
    outboundStories: "1",
    outboundReplies: "2",
    inboundReceived: "1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

function leadForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    firstName: "Marco",
    lastName: "Bianchi",
    chatChannel: "OUTBOUND_COMMENT",
    appointmentAt: "2026-09-12T10:30",
    reason: "Call conoscitiva",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }
  return form;
}

afterEach(() => vi.clearAllMocks());

describe("saveActivityDayAction", () => {
  it("saves the counters and returns success", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    saveActivityDay.mockResolvedValue(undefined);

    const state = await saveActivityDayAction(IDLE, counterForm());

    expect(buildInsightDeps).toHaveBeenCalledWith(PRO);
    expect(saveActivityDay).toHaveBeenCalledWith(
      { kind: "insight" },
      expect.objectContaining({ date: "2026-09-09", welcomeSent: "30" }),
    );
    expect(state.status).toBe("success");
  });

  it("returns an error state when the tenant has the feature flag off", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_OFF);

    const state = await saveActivityDayAction(IDLE, counterForm());

    expect(state.status).toBe("error");
    expect(saveActivityDay).not.toHaveBeenCalled();
  });

  it("returns an error state when the role lacks insight.edit", async () => {
    // baseUser vede la tabella ma non modifica i volumi di attività.
    requireTenantContext.mockResolvedValue(BASE);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);

    const state = await saveActivityDayAction(IDLE, counterForm());

    expect(state.status).toBe("error");
    expect(saveActivityDay).not.toHaveBeenCalled();
  });

  it("maps validation issues onto field errors (replies exceeding messages)", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    saveActivityDay.mockRejectedValue(
      new ValidationError({ welcomeReplies: ["insight.errors.repliesExceedWelcome"] }),
    );

    const state = await saveActivityDayAction(
      IDLE,
      counterForm({ welcomeSent: "3", welcomeReplies: "5" }),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.welcomeReplies).toBe("insight.errors.repliesExceedWelcome");
  });

  it("rejects an unauthenticated caller before touching the use case", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());

    const state = await saveActivityDayAction(IDLE, counterForm());

    expect(state.status).toBe("error");
    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
    expect(saveActivityDay).not.toHaveBeenCalled();
  });

  it("uses the tenant from the session, never one supplied by the client", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    saveActivityDay.mockResolvedValue(undefined);

    await saveActivityDayAction(IDLE, counterForm({ organizationId: "org_b" }));

    expect(buildInsightDeps).toHaveBeenCalledWith(PRO);
    expect(getTenantFeatureFlags).toHaveBeenCalledWith("org_a");
  });
});

describe("createLeadFromCellAction", () => {
  it("creates lead and appointment and returns success", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    createLeadFromCell.mockResolvedValue({ leadId: "lead_1", appointmentId: "appt_1" });

    const state = await createLeadFromCellAction(IDLE, leadForm());

    expect(createLeadFromCell).toHaveBeenCalledWith(
      { kind: "insight" },
      expect.objectContaining({ chatChannel: "OUTBOUND_COMMENT" }),
    );
    expect(state.status).toBe("success");
  });

  it("is allowed for baseUser, who holds lead.create", async () => {
    requireTenantContext.mockResolvedValue(BASE);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    createLeadFromCell.mockResolvedValue({ leadId: "lead_1", appointmentId: "appt_1" });

    const state = await createLeadFromCellAction(IDLE, leadForm());

    expect(state.status).toBe("success");
  });

  it("returns an error state when the feature flag is off", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_OFF);

    const state = await createLeadFromCellAction(IDLE, leadForm());

    expect(state.status).toBe("error");
    expect(createLeadFromCell).not.toHaveBeenCalled();
  });

  it("surfaces a missing channel as a field error", async () => {
    requireTenantContext.mockResolvedValue(PRO);
    getTenantFeatureFlags.mockResolvedValue(FLAGS_ON);
    createLeadFromCell.mockRejectedValue(
      new ValidationError({ chatChannel: ["insight.errors.channelRequired"] }),
    );

    const form = leadForm();
    form.delete("chatChannel");
    const state = await createLeadFromCellAction(IDLE, form);

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.chatChannel).toBe("insight.errors.channelRequired");
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/app/[locale]/(app)/insight/actions.test.ts`
Expected: FAIL — modulo inesistente.

- [ ] **Step 3: Scrivere le action**

```ts
"use server";

import { revalidatePath } from "next/cache";

/**
 * Una Server Action è un endpoint a sé: flag e capability si verificano QUI,
 * non solo nella pagina che ha reso il form. Nascondere un bottone è cosmetica.
 */
async function requireInsightContext(capability: "insight.view" | "insight.edit") {
  const ctx = await requireTenantContext();
  const flags = await getTenantFeatureFlags(ctx.organizationId);
  if (!flags.insightStats) {
    throw new NotFoundError("Insight section is disabled for this tenant");
  }
  requirePermission(ctx.role, capability);
  return ctx;
}

export async function saveActivityDayAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return toActionState(async () => {
    const ctx = await requireInsightContext("insight.edit");
    await saveActivityDay(buildInsightDeps(ctx), Object.fromEntries(formData));
    revalidatePath("/insight");
  });
}
```

`createLeadFromCellAction` è analoga ma richiede `"insight.view"` più `"lead.create"` (così `baseUser` può creare un lead da una cella senza poter modificare i contatori) e, dopo il successo, invalida sia `/insight` sia `/leads`.

`listCellLeadsAction` è una action di sola lettura chiamata dal popover: richiede `"insight.view"` e restituisce direttamente l'elenco.

Verificare il nome e la firma reali di `toActionState` in `src/server/actions/action-result.ts` e adeguarsi.

- [ ] **Step 4: Eseguire i test**

Run: `pnpm test -- src/app/[locale]/(app)/insight/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Comando: `git add src/app` poi `git commit -m "feat(insight): server actions with flag, capability and validation guards"`

---

### Task 15: La tabella

**Files:**
- Create: `src/components/insight/activity-table.tsx`
- Create: `src/components/insight/manual-cell.tsx`
- Create: `src/components/insight/derived-cell.tsx`
- Create: `src/components/insight/month-nav.tsx`
- Create: `src/components/insight/insight-kpis.tsx`
- Create: `src/components/insight/unattributed-notice.tsx`
- Create: `src/components/insight/activity-table.test.tsx`
- Riferimento visivo: `docs/superpowers/specs/assets/2026-09-10-insight-stats-mockup.html`

**Interfaces:**
- Consumes: `InsightMonthView`, `MonthDayRow`, `saveActivityDayAction`, `useTranslations`, i componenti di `src/components/ui`.
- Produces: `<ActivityTable view={view} canEdit={boolean} />`.

**Vincoli:**
- Nessun colore, raggio o font scritto a mano: solo utility Tailwind mappate sui token (`bg-panel`, `text-muted`, `border-line`, `rounded-input`, `font-mono`…). Il mockup usa i token reali, quindi le classi si ricavano da lì.
- Tabella HTML vera (`<table>`, `<thead>`, `<th scope>`, `<caption>` per lettore di schermo), non `div` con `role`.
- Contrasto AA e focus visibile su ogni cella interattiva.
- Valori assenti: trattino, non `0` — uno zero è un dato, l'assenza no.
- La distinzione archivio non è affidata al solo colore: icona più etichetta testuale.

- [ ] **Step 1: Scrivere il test dei componenti**

`src/components/insight/activity-table.test.tsx` (Testing Library, come gli altri test di componente del progetto):

```tsx
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

import { ActivityTable } from "@/components/insight/activity-table";
import type { InsightMonthView, MonthDayRow } from "@/server/insight/get-month-view";
import { conversionRates, sumColumns } from "@/server/insight/totals";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
  listCellLeadsAction: vi.fn().mockResolvedValue([]),
  createLeadFromCellAction: vi.fn(),
}));

function day(date: string, overrides: Partial<MonthDayRow> = {}): MonthDayRow {
  return {
    date,
    isArchived: false,
    isFuture: false,
    welcome: {
      sent: 0,
      replies: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    outbound: {
      comments: 0,
      stories: 0,
      archivedMessages: null,
      replies: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    inbound: {
      received: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    totalAppointments: 0,
    totalSales: 0,
    ...overrides,
  };
}

function view(days: MonthDayRow[]): InsightMonthView {
  const totals = sumColumns(days);
  return {
    year: 2026,
    month: 9,
    days,
    totals,
    rates: conversionRates(totals),
    containsArchivedDays: days.some((row) => row.isArchived),
    containsLiveDays: days.some((row) => !row.isArchived),
    unattributedLeadCount: 0,
  };
}

/** Riga della tabella corrispondente a un giorno, individuata dalla sua intestazione. */
function rowOf(date: string) {
  return screen.getByRole("row", { name: new RegExp(date.slice(-2)) });
}

describe("ActivityTable", () => {
  it("renders one row per day of the month", () => {
    const days = Array.from({ length: 30 }, (_, index) =>
      day(`2026-09-${String(index + 1).padStart(2, "0")}`),
    );

    render(<ActivityTable view={view(days)} canEdit />);

    // 30 giorni + 2 righe di intestazione + 2 righe di riepilogo
    expect(screen.getAllByRole("row")).toHaveLength(34);
  });

  it("renders editable inputs on live days when the user can edit", () => {
    render(<ActivityTable view={view([day("2026-09-07", { welcome: { ...day("x").welcome, sent: 67 } })])} canEdit />);

    const input = within(rowOf("2026-09-07")).getByRole("spinbutton", { name: /welcome/i });
    expect(input).toHaveValue(67);
    expect(input).not.toBeDisabled();
  });

  it("renders read-only values on archived days", () => {
    const archived = day("2026-09-02", {
      isArchived: true,
      outbound: { ...day("x").outbound, archivedMessages: 11 },
      welcome: { ...day("x").welcome, appointments: 2 },
    });

    render(<ActivityTable view={view([archived])} canEdit />);
    const row = within(rowOf("2026-09-02"));

    expect(row.queryByRole("spinbutton")).toBeNull();
    expect(row.queryByRole("button")).toBeNull();
    // La distinzione non è affidata al solo colore: c'è un'etichetta testuale.
    expect(row.getByText(/archivio/i)).toBeInTheDocument();
  });

  it("renders a dash, not a zero, for an empty derived cell", () => {
    render(<ActivityTable view={view([day("2026-09-03")])} canEdit />);

    const appointmentCell = within(rowOf("2026-09-03")).getByRole("button", {
      name: /appuntamenti welcome/i,
    });
    expect(appointmentCell).toHaveTextContent("–");
    expect(appointmentCell).not.toHaveTextContent("0");
  });

  it("disables future days", () => {
    render(<ActivityTable view={view([day("2026-09-30", { isFuture: true })])} canEdit />);
    const row = within(rowOf("2026-09-30"));

    expect(row.getByRole("spinbutton", { name: /welcome/i })).toBeDisabled();
    expect(row.queryByRole("button", { name: /appuntamenti/i })).toBeNull();
  });

  it("renders the totals and conversion rows", () => {
    const days = [
      day("2026-09-01", { welcome: { ...day("x").welcome, sent: 100, replies: 10 } }),
    ];

    render(<ActivityTable view={view(days)} canEdit />);

    const totalsRow = within(screen.getByRole("row", { name: /totale mese/i }));
    expect(totalsRow.getByText("100")).toBeInTheDocument();
    const conversionRow = within(screen.getByRole("row", { name: /conversione/i }));
    expect(conversionRow.getByText("10,0%")).toBeInTheDocument();
  });

  it("renders an em dash for a rate whose denominator is zero", () => {
    render(<ActivityTable view={view([day("2026-09-01")])} canEdit />);

    expect(within(screen.getByRole("row", { name: /conversione/i })).getAllByText("—").length)
      .toBeGreaterThan(0);
  });

  it("shows the mixed-period notice when the month spans the activation boundary", () => {
    const days = [day("2026-09-01", { isArchived: true }), day("2026-09-10")];

    render(<ActivityTable view={view(days)} canEdit />);

    expect(screen.getByText(/archivio e dato vivo/i)).toBeInTheDocument();
  });

  it("renders read-only cells for a user without insight.edit", () => {
    render(<ActivityTable view={view([day("2026-09-07")])} canEdit={false} />);

    expect(screen.queryByRole("spinbutton")).toBeNull();
    // le celle calcolate restano apribili: la lettura non è un privilegio di scrittura
    expect(screen.getByRole("button", { name: /appuntamenti welcome/i })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ActivityTable view={view([day("2026-09-07")])} canEdit />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
```

I nomi accessibili usati dalle query (`appuntamenti welcome`, `totale mese`, `conversione`) devono corrispondere agli `aria-label` e alle stringhe i18n definite nel Task 13: se non combaciano, il test è la prima cosa che se ne accorge.

Gli helper `day()` e `view()` servono anche al test delle schede (Task 17): metterli in `src/components/insight/test-fixtures.ts` e importarli da entrambi i file, non copiarli.

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/components/insight/activity-table.test.tsx`
Expected: FAIL — componenti inesistenti.

- [ ] **Step 3: Scrivere `manual-cell.tsx`**

Client component: input numerico che salva **all'uscita dal campo** e solo se il valore è cambiato, con stato per riga (`idle` / `saving` / `saved` / `error`). Navigazione: `Tab` fra colonne è quella nativa; le frecce su/giù spostano alla stessa colonna del giorno precedente/successivo (`onKeyDown` con `ArrowUp`/`ArrowDown` e un `ref` per riga+colonna). `aria-label` che descrive cella e giorno per esteso ("Welcome inviati, 7 settembre"), perché l'intestazione da sola non basta a chi naviga a lettore di schermo.

Gli errori di validazione tornano dalla action come chiavi i18n e si mostrano sotto la riga, non in un alert globale.

- [ ] **Step 4: Scrivere `derived-cell.tsx`**

`<button>` con il numero (o il trattino). `aria-label` che include il conteggio, il canale e il giorno; la composizione ("8 creati da qui, 2 inseriti da lista lead o pipeline") sta in un elemento associato via `aria-describedby`, così è disponibile anche senza mouse. Sui giorni di archivio e sui giorni futuri il componente rende uno `<span>`, non un bottone: ciò che non è azionabile non deve essere raggiungibile da Tab.

- [ ] **Step 5: Scrivere `activity-table.tsx`**

Intestazioni su due livelli con `colSpan`, colonna del giorno `sticky` a sinistra, scorrimento orizzontale sul contenitore. Righe di piè di tabella con totali e tassi (`—` quando il tasso è `null`). Quando `view.containsArchivedDays && view.containsLiveDays`, mostrare l'avviso di periodo misto sopra le due righe di riepilogo.

- [ ] **Step 6: Scrivere `month-nav.tsx`, `insight-kpis.tsx`, `unattributed-notice.tsx`**

`month-nav`: due bottoni e un selettore mese/anno che aggiornano `?year=&month=` (link, non stato client, così la pagina resta condivisibile e il server rende i dati). `insight-kpis`: riusa `Card` da `src/components/ui` e lo stile dei KPI della dashboard invece di crearne uno nuovo. `unattributed-notice`: banner con conteggio e link alla lista lead filtrata; non compare quando il conteggio è zero.

- [ ] **Step 7: Eseguire i test**

Run: `pnpm test -- src/components/insight/`
Expected: PASS.

- [ ] **Step 8: Commit**

Comando: `git add src/components/insight` poi `git commit -m "feat(insight): month table with inline editing and derived cells"`

---

### Task 16: Dialogo di creazione e popover di drill-down

**Files:**
- Create: `src/components/insight/new-lead-from-cell-dialog.tsx`
- Create: `src/components/insight/cell-leads-popover.tsx`
- Create: `src/components/insight/new-lead-from-cell-dialog.test.tsx`
- Create: `src/components/insight/cell-leads-popover.test.tsx`

**Interfaces:**
- Consumes: `Modal`, `Input`, `Select`, `Button` da `src/components/ui`; `createLeadFromCellAction`, `listCellLeadsAction`; `StagePill` da `src/components/leads/stage-pill.tsx` (riuso, non un secondo componente di stato).
- Produces: `<NewLeadFromCellDialog date group open onOpenChange />`, `<CellLeadsPopover date group metric count />`.

- [ ] **Step 1: Scrivere i test**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { CellLeadsPopover } from "@/components/insight/cell-leads-popover";
import { NewLeadFromCellDialog } from "@/components/insight/new-lead-from-cell-dialog";

const createLeadFromCellAction = vi.fn();
const listCellLeadsAction = vi.fn();

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  createLeadFromCellAction: (...a: unknown[]) => createLeadFromCellAction(...a),
  listCellLeadsAction: (...a: unknown[]) => listCellLeadsAction(...a),
}));

describe("NewLeadFromCellDialog", () => {
  const cell = { date: "2026-09-10", channel: ChatChannel.OUTBOUND_COMMENT };

  it("shows the source and channel as locked, taken from the cell", () => {
    render(
      <NewLeadFromCellDialog {...cell} sourceLabel="Instagram" open onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText(/commento/i)).toBeInTheDocument();
    // bloccati: nessun campo modificabile per provenienza e canale
    expect(screen.queryByRole("combobox", { name: /provenienza/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /canale/i })).toBeNull();
  });

  it("submits lead fields plus appointment date and time", async () => {
    createLeadFromCellAction.mockResolvedValue({ status: "success" });
    render(
      <NewLeadFromCellDialog {...cell} sourceLabel="Instagram" open onOpenChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole("textbox", { name: /nome/i }), "Marco");
    await userEvent.type(screen.getByRole("textbox", { name: /cognome/i }), "Bianchi");
    await userEvent.type(screen.getByLabelText(/ora/i), "10:30");
    await userEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() => expect(createLeadFromCellAction).toHaveBeenCalled());
    const submitted = createLeadFromCellAction.mock.calls[0][1] as FormData;
    expect(submitted.get("firstName")).toBe("Marco");
    expect(submitted.get("chatChannel")).toBe(ChatChannel.OUTBOUND_COMMENT);
    expect(String(submitted.get("appointmentAt"))).toContain("2026-09-10");
  });

  it("shows field errors returned by the action", async () => {
    createLeadFromCellAction.mockResolvedValue({
      status: "error",
      fieldErrors: { firstName: "errors.required" },
    });
    render(
      <NewLeadFromCellDialog {...cell} sourceLabel="Instagram" open onOpenChange={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /nome/i })).toHaveAccessibleDescription(
        /required/i,
      ),
    );
  });

  it("closes on success", async () => {
    const onOpenChange = vi.fn();
    createLeadFromCellAction.mockResolvedValue({ status: "success" });
    render(
      <NewLeadFromCellDialog {...cell} sourceLabel="Instagram" open onOpenChange={onOpenChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /salva/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <NewLeadFromCellDialog {...cell} sourceLabel="Instagram" open onOpenChange={vi.fn()} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("CellLeadsPopover", () => {
  const appointmentsCell = {
    date: "2026-09-07",
    group: "welcome" as const,
    metric: "appointments" as const,
    count: 3,
    fromInsight: 2,
  };

  const leads = [
    {
      id: "lead_1",
      firstName: "Marco",
      lastName: "Bianchi",
      stage: LeadStage.CALL_SCHEDULED,
      createdFromInsight: true,
    },
    {
      id: "lead_2",
      firstName: "Elena",
      lastName: "Rossi",
      stage: LeadStage.WON,
      createdFromInsight: false,
    },
  ];

  it("lists the leads with their current stage", async () => {
    listCellLeadsAction.mockResolvedValue(leads);
    render(<CellLeadsPopover {...appointmentsCell} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText("Marco Bianchi")).toBeInTheDocument();
    expect(screen.getByText(/call schedulata/i)).toBeInTheDocument();
    expect(screen.getByText(/vinta/i)).toBeInTheDocument();
  });

  it("shows the composition line", async () => {
    listCellLeadsAction.mockResolvedValue(leads);
    render(<CellLeadsPopover {...appointmentsCell} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByText(/2 creati.*1 inserit/i)).toBeInTheDocument();
  });

  it("offers 'add a lead' on an appointments cell", async () => {
    listCellLeadsAction.mockResolvedValue(leads);
    render(<CellLeadsPopover {...appointmentsCell} />);

    await userEvent.click(screen.getByRole("button"));

    expect(await screen.findByRole("button", { name: /aggiungi un lead/i })).toBeInTheDocument();
  });

  it("does NOT offer 'add a lead' on a sales cell", async () => {
    // una vendita nasce chiudendo il lead in pipeline, non qui
    listCellLeadsAction.mockResolvedValue(leads);
    render(<CellLeadsPopover {...appointmentsCell} metric="sales" />);

    await userEvent.click(screen.getByRole("button"));

    await screen.findByText("Marco Bianchi");
    expect(screen.queryByRole("button", { name: /aggiungi un lead/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `pnpm test -- src/components/insight/`
Expected: FAIL.

- [ ] **Step 3: Scrivere il dialogo**

Struttura e `useActionState` identici a `NewLeadDialog` (`src/components/leads/new-lead-dialog.tsx`), che è il pattern del progetto. Differenze:
- provenienza e canale mostrati come campi **bloccati** (testo più `<input type="hidden">`), presi dalla cella;
- due campi in più, data e ora dell'appuntamento, come già fa `appointment-dialog.tsx` (che usa data e ora separate: riusare lo stesso approccio, non introdurne un terzo);
- il campo "Motivo" dell'appuntamento con un valore iniziale sensato ma modificabile.

- [ ] **Step 4: Scrivere il popover**

Basato sul primitivo Radix già in uso nel progetto (verificare se esiste un `Popover` in `src/components/ui`; se non c'è, usare `Modal` invece di aggiungere una dipendenza nuova). Carica l'elenco al momento dell'apertura tramite `listCellLeadsAction`, mostra nome, `StagePill` e link al dettaglio del lead, poi la riga di composizione. Sulle celle "Appuntamenti" in fondo il bottone che apre il dialogo di creazione; sulle celle "Vendite" no.

- [ ] **Step 5: Eseguire i test**

Run: `pnpm test -- src/components/insight/`
Expected: PASS.

- [ ] **Step 6: Commit**

Comando: `git add src/components/insight` poi `git commit -m "feat(insight): cell drill-down popover and new-lead dialog"`

---

### Task 17: Vista telefono

**Files:**
- Create: `src/components/insight/activity-day-cards.tsx`
- Create: `src/components/insight/activity-day-cards.test.tsx`
- Modify: `src/app/[locale]/(app)/insight/page.tsx`

**Interfaces:**
- Consumes: gli stessi `MonthDayRow`, `ManualCell`, `DerivedCell` della tabella.
- Produces: `<ActivityDayCards view={view} canEdit={boolean} />`.

**Vincolo:** una tabella da quindici colonne non si legge su telefono. Le schede mostrano gli stessi dati e le stesse interazioni, non un sottoinsieme.

- [ ] **Step 1: Scrivere il test**

```tsx
import { render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";

import { ActivityDayCards } from "@/components/insight/activity-day-cards";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
  listCellLeadsAction: vi.fn().mockResolvedValue([]),
  createLeadFromCellAction: vi.fn(),
}));

// `day` e `view` sono gli stessi helper del test della tabella: estrarli in
// `src/components/insight/test-fixtures.ts` e importarli in entrambi i file,
// invece di copiarli.
import { day, view } from "@/components/insight/test-fixtures";

describe("ActivityDayCards", () => {
  it("renders one card per day with the three channel blocks", () => {
    render(<ActivityDayCards view={view([day("2026-09-07"), day("2026-09-08")])} canEdit />);

    const cards = screen.getAllByRole("group");
    expect(cards).toHaveLength(2);
    const first = within(cards[0]);
    expect(first.getByText(/welcome/i)).toBeInTheDocument();
    expect(first.getByText(/outbound/i)).toBeInTheDocument();
    expect(first.getByText(/inbound/i)).toBeInTheDocument();
  });

  it("keeps the cells editable on live days", () => {
    render(<ActivityDayCards view={view([day("2026-09-07")])} canEdit />);

    expect(screen.getByRole("spinbutton", { name: /welcome/i })).not.toBeDisabled();
  });

  it("marks archived days as read-only", () => {
    render(<ActivityDayCards view={view([day("2026-09-02", { isArchived: true })])} canEdit />);

    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByText(/archivio/i)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ActivityDayCards view={view([day("2026-09-07")])} canEdit />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/components/insight/activity-day-cards.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Scrivere il componente e collegarlo**

Riusa `ManualCell` e `DerivedCell`: nessuna seconda implementazione delle celle. Nella pagina, tabella e schede convivono con le utility responsive (`hidden md:block` / `md:hidden`), come già fatto altrove nel progetto — verificare il pattern esistente e seguirlo.

- [ ] **Step 4: Verificare a mano sui tre formati**

Run: `pnpm dev` e controllare a 375px, 768px e 1440px: colonna data fissa e scorrimento orizzontale su tablet, schede su telefono, tabella intera su desktop. Verificare la navigazione da tastiera (Tab e frecce) e il focus sempre visibile.

- [ ] **Step 5: Commit**

Comando: `git add src/components/insight src/app` poi `git commit -m "feat(insight): phone card view sharing the table cells"`

---

### Task 18: Import dello storico

**Files:**
- Create: `scripts/import-insight-history.ts`
- Create: `src/server/insight/import-history.ts` (logica pura e testabile)
- Create: `src/server/insight/import-history.test.ts`
- Modify: `package.json` (script `db:import-insight`)

**Interfaces:**
- Consumes: `exceljs` o `xlsx` — **verificare quale libreria è già in dipendenza** (l'export xlsx in `src/server/privacy/export-lead-data-xlsx.ts` ne usa già una) e riusare quella, senza aggiungerne una seconda.
- Produces:
  - `interface ImportedDay { date: string; welcomeSent; welcomeReplies; outboundMessages; outboundReplies; inboundReceived; welcomeAppointments; welcomeSales; outboundAppointments; outboundSales; inboundAppointments; inboundSales }`
  - `interface ImportAnomaly { row: number; column: string; kind: "nonNumeric" | "negative" | "repliesExceedMessages" | "duplicateDate"; value: string }`
  - `interface ImportReport { days: ImportedDay[]; anomalies: ImportAnomaly[]; monthlyTotals: Record<string, ColumnTotals> }`
  - `parseChatSheet(rows: readonly (readonly unknown[])[]): ImportReport` — funzione pura sui valori delle celle, senza I/O.

**Comportamento dello script:** parametri da env — `DATABASE_URL`, `ORG_SLUG`, `FILE`, `ACTIVATION_DATE`, `CONFIRM` (assente = prova a vuoto). Stessa forma di `scripts/backfill-loss-reasons.ts`: fallisce rumorosamente, non crea nulla che non esista.

- [ ] **Step 1: Scrivere il test del parser**

`src/server/insight/import-history.test.ts` — righe costruite a mano, non il file vero (il test non deve dipendere da un xlsx sul disco):

```ts
import { describe, expect, it } from "vitest";

import { parseChatSheet } from "@/server/insight/import-history";

/** Riga giornaliera del foglio: A data, B..L i dodici contatori. */
function sheetRow(date: string, values: readonly (number | string | null)[]): unknown[] {
  return [new Date(`${date}T00:00:00.000Z`), ...values];
}

describe("parseChatSheet", () => {
  it("reads a daily row into the imported shape", () => {
    const report = parseChatSheet([
      sheetRow("2025-06-20", [37, 1, 0, 0, 11, 4, 1, 0, 1, 1, 0]),
    ]);

    expect(report.days).toEqual([
      {
        date: "2025-06-20",
        welcomeSent: 37,
        welcomeReplies: 1,
        welcomeAppointments: 0,
        welcomeSales: 0,
        outboundMessages: 11,
        outboundReplies: 4,
        outboundAppointments: 1,
        outboundSales: 0,
        inboundReceived: 1,
        inboundAppointments: 1,
        inboundSales: 0,
      },
    ]);
    expect(report.anomalies).toEqual([]);
  });

  it("ignores TOT rows and rate rows entirely, recomputing the totals", () => {
    // Nel foglio reale giugno 2025 ha PERCENTUALI nella riga TOT invece delle
    // somme, cinque righe non hanno la formula del totale appuntamenti e una
    // somma parte da un giorno del mese precedente. Fidarsi delle righe TOT
    // importerebbe quegli errori.
    const report = parseChatSheet([
      sheetRow("2025-06-20", [10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-06-21", [20, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ["TOT", 999, 0.0359, 0.217, 0.2, 0, 0, 0, 0, 0, 0, 0],
      [null, null, 0.0359, 0.217, 0.2, null, null, null, null, null, null, null],
    ]);

    expect(report.days).toHaveLength(2);
    expect(report.monthlyTotals["2025-06"].welcomeSent).toBe(30);
  });

  it("drops a non-numeric cell without losing the rest of the day", () => {
    // Riga 430 del file reale: `miru | ha | dimenticato | ciao` nelle colonne B..E.
    const report = parseChatSheet([
      sheetRow("2026-08-15", ["miru", "ha", "dimenticato", "ciao", 4, 2, 0, 0, 1, 0, 0]),
    ]);

    expect(report.days[0]).toMatchObject({
      welcomeSent: 0,
      outboundMessages: 4,
      outboundReplies: 2,
      inboundReceived: 1,
    });
    expect(report.anomalies).toHaveLength(4);
    expect(report.anomalies[0]).toMatchObject({ kind: "nonNumeric", value: "miru" });
  });

  it("imports days where replies exceed messages, but reports them", () => {
    // 24 giorni outbound + 5 welcome nel file reale: il dato storico non si
    // inventa, la validazione stretta vale dal periodo vivo in poi.
    const report = parseChatSheet([
      sheetRow("2025-08-01", [33, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0]),
    ]);

    expect(report.days[0].outboundReplies).toBe(2);
    expect(report.anomalies).toEqual([
      expect.objectContaining({ kind: "repliesExceedMessages", column: "G" }),
    ]);
  });

  it("reports a duplicate date instead of writing it twice", () => {
    const report = parseChatSheet([
      sheetRow("2025-07-01", [11, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-07-01", [99, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]);

    expect(report.days).toHaveLength(1);
    expect(report.days[0].welcomeSent).toBe(11);
    expect(report.anomalies).toEqual([
      expect.objectContaining({ kind: "duplicateDate", value: "2025-07-01" }),
    ]);
  });

  it("rejects a negative counter", () => {
    const report = parseChatSheet([
      sheetRow("2025-07-02", [-5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]);

    expect(report.days[0].welcomeSent).toBe(0);
    expect(report.anomalies).toEqual([
      expect.objectContaining({ kind: "negative", column: "B" }),
    ]);
  });

  it("computes monthly totals from the daily rows", () => {
    const report = parseChatSheet([
      sheetRow("2025-06-30", [10, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-07-01", [20, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    ]);

    expect(report.monthlyTotals["2025-06"].welcomeSent).toBe(10);
    expect(report.monthlyTotals["2025-07"].welcomeSent).toBe(20);
    expect(report.monthlyTotals["2025-06"].totalAppointments).toBe(1);
  });

  it("skips rows whose first cell is not a date", () => {
    const report = parseChatSheet([
      ["GIUGNO", null, null, null, null, null, null, null, null, null, null, null],
      [],
      sheetRow("2025-06-12", [23, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
    ]);

    expect(report.days).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `pnpm test -- src/server/insight/import-history.test.ts`
Expected: FAIL.

- [ ] **Step 3: Scrivere `import-history.ts`**

Mappa delle colonne del foglio (indici a base zero, foglio **Chat**):

| Colonna | Indice | Destinazione |
|---|---|---|
| A data | 0 | `date` |
| B Welcome | 1 | `welcomeSent` |
| C Risposte | 2 | `welcomeReplies` |
| D Appuntamenti | 3 | `welcomeAppointments` (congelato) |
| E Vendite | 4 | `welcomeSales` (congelato) |
| F Messaggi | 5 | `outboundMessages` (aggregato, non separabile) |
| G Risposte | 6 | `outboundReplies` |
| H Appuntamenti | 7 | `outboundAppointments` (congelato) |
| I Vendite | 8 | `outboundSales` (congelato) |
| J Ricevuti | 9 | `inboundReceived` |
| K Appuntamenti | 10 | `inboundAppointments` (congelato) |
| L Vendite | 11 | `inboundSales` (congelato) |

Regole: si considera riga giornaliera **solo** quella la cui colonna A contiene una data; tutto il resto (righe `TOT`, righe dei tassi, righe vuote) viene saltato. Ogni cella non numerica viene scartata singolarmente e registrata fra le anomalie con riga, colonna e valore.

- [ ] **Step 4: Eseguire il test**

Run: `pnpm test -- src/server/insight/import-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Scrivere lo script**

```
DATABASE_URL="$PROD_DB_URL" ORG_SLUG=fabio \
  FILE="base/Sponsorizzate Instagram.xlsx" ACTIVATION_DATE=2026-09-01 \
  pnpm db:import-insight
```

Sequenza:
1. risolvere il tenant dallo slug (assente ⇒ errore, mai creazione);
2. leggere il foglio `Chat` e passarlo a `parseChatSheet`;
3. **rifiutare** ogni giorno con `date >= ACTIVATION_DATE` — l'archivio non sovrascrive il dato vivo, nemmeno per errore — segnalandoli nel report;
4. stampare il riepilogo: giorni letti, totali per mese, elenco anomalie;
5. senza `CONFIRM=yes`, fermarsi qui (prova a vuoto);
6. con la conferma, upsert su `(organizationId, date)` con `isArchived: true`, i contatori manuali importabili e i conteggi congelati; poi impostare `Organization.insightActiveFrom`;
7. scrivere il report in `backups/insight-import-<timestamp>.txt`.

- [ ] **Step 6: Prova a vuoto sul file reale**

Run: il comando sopra **senza** `CONFIRM`, puntando a un database locale.
Expected: 476 giorni letti, totali mensili confrontabili con l'Excel, fra le anomalie la riga 430 e i 29 giorni con risposte superiori ai messaggi. Nessuna scrittura.

- [ ] **Step 7: Verificare l'idempotenza**

Eseguire due volte con la conferma su un database locale: il numero di righe in `ChatActivityDay` non cambia fra la prima e la seconda esecuzione.

- [ ] **Step 8: Commit**

Comando: `git add scripts src/server/insight package.json` poi `git commit -m "feat(insight): one-off importer for the spreadsheet history"`

---

### Task 19: End-to-end

**Files:**
- Create: `tests/e2e/insight.spec.ts`
- Modify: `prisma/seed-helpers.ts` (accendere `insightStats` e collegare Instagram per il tenant di prova)

**Interfaces:**
- Consumes: gli storage state autenticati già prodotti dal progetto `setup` di Playwright.
- Produces: la verifica del comportamento che distingue la sezione dal foglio.

- [ ] **Step 1: Preparare il seed**

Nel tenant di prova: `featureFlags.insightStats = true` e `insightSourceId` puntato alla `LeadSource` "Instagram" già creata da `DEFAULT_LEAD_SOURCES`. Lasciare `insightActiveFrom` null (nessun archivio nel seed): l'archivio si verifica negli unit test, l'e2e serve al flusso vivo.

- [ ] **Step 2: Scrivere il test**

```ts
test("un lead creato da una cella compare negli appuntamenti del giorno, e la vendita nel giorno della chiusura", async ({ page }) => {
  // 1. apri /insight sul mese corrente
  // 2. la cella Appuntamenti di oggi, canale Welcome, mostra un trattino
  // 3. cliccala: si apre il dialogo con provenienza e canale bloccati
  // 4. compila nome, cognome, data e ora dell'appuntamento, salva
  // 5. la cella di oggi mostra 1
  // 6. vai in pipeline e sposta il lead in Vinta
  // 7. torna in /insight: la cella Vendite di OGGI mostra 1
  //    (il giorno della chiusura, non quello dell'appuntamento)
});

test("la sezione non esiste per un tenant con il flag spento", async ({ page }) => {
  // /insight risponde 404 e la voce di menu non compare
});

test("i contatori manuali si salvano uscendo dal campo", async ({ page }) => {
  // scrivi 30 in Welcome inviati, esci dal campo, ricarica: il valore è ancora lì
});
```

Scrivere per esteso i selettori seguendo lo stile degli e2e già presenti in `tests/e2e/` (ruoli e nomi accessibili, non selettori CSS fragili).

- [ ] **Step 3: Eseguire gli e2e**

Run: `pnpm test:e2e -- insight`
Expected: PASS. Serve un Postgres effimero e le variabili di seed (vedi la nota in `docs/07` / memoria di progetto sul setup e2e locale).

- [ ] **Step 4: Suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: tutto verde. Riportare i numeri reali, non "dovrebbe passare".

- [ ] **Step 5: Aggiornare la documentazione**

- `docs/03-modello-dati.md`: nuovo enum, campi su `Lead`/`Organization`, modello `ChatActivityDay`.
- `docs/02-specifiche-funzionali.md`: la sezione e le due capability nella matrice RBAC.
- `docs/04-api.md`: le Server Action della sezione.
- `CLAUDE.md`: il comando `pnpm db:import-insight` fra quelli del progetto.

- [ ] **Step 6: Commit**

Comando: `git add tests prisma docs CLAUDE.md` poi `git commit -m "test(insight): end-to-end cell-to-sale flow and docs update"`

---

## Note per chi esegue

**Ordine.** I task 1–12 sono il dominio e vanno in ordine: ognuno poggia sui tipi del precedente. Dal 13 in poi la UI può procedere in parallelo al 18 (import), che non dipende da nessun componente.

**Il rifattoro del Task 12 non è opzionale.** Se `list-cell-leads` reimplementa la regola "primo appuntamento" invece di riusare `attribution.ts`, popover e cella possono mostrare numeri diversi. È esattamente il tipo di divergenza che questa sezione esiste per eliminare.

**Se un nome non torna.** Il piano cita firme reali (`parseInput`, `ValidationError`, `toActionState`, `requirePermission`, `getTenantPrisma`): se il codice dice altro, vince il codice. Non introdurre una seconda variante di qualcosa che esiste già.

**Fuori perimetro, da non aggiungere di iniziativa:** esportazione, grafici di andamento, confronto fra mesi, vista annuale. L'esportazione in particolare è rimandata perché formato e perimetro non sono ancora decisi con l'utente: il mockup mostra un bottone "Esporta" che la v1 **non** implementa — non va reso.

**Quando l'esportazione verrà definita:** riusare `src/server/privacy/export-lead-data-xlsx.ts`, che genera già xlsx nel progetto. Nessuna seconda libreria.
