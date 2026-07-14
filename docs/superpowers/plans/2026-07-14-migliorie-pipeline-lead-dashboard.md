# Migliorie pipeline, lead detail, dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementare le 5 migliorie approvate (spec `docs/superpowers/specs/2026-07-14-migliorie-pipeline-lead-dashboard-design.md`) + 1 fix banale: nuovi stage pipeline, motivo di perdita personalizzato + gestione Impostazioni, form modifica lead, prossimo appuntamento su card kanban, filtro data dashboard, riordino Note/Appuntamenti.

**Architecture:** Segue esattamente i pattern già stabiliti nel repo (verificati in questa sessione): use case in `src/server/<dominio>/`, Server Action in `src/app/[locale]/(app)/<area>/actions.ts`, componenti client per editor inline (pattern `capital-select.tsx`) o dialog (pattern `new-lead-dialog.tsx`), Settings CRUD (pattern `data-retention-panel.tsx` appena costruito), RBAC via `requirePermission`/capability esistenti, i18n IT+EN in `messages/*.json`, tenant isolation via `deps.prisma` tenant-scoped.

**Tech Stack:** Next.js App Router, Prisma 7 + PostgreSQL, Zod, Tailwind + shadcn/Radix, next-intl, Vitest + Playwright.

## Global Constraints

- Ogni query passa per `organizationId` (client tenant-scoped `deps.prisma`, mai `prisma` nudo) — docs/00 §1, CLAUDE.md.
- RBAC server-side su ogni Server Action/route (`requirePermission`), mai solo nascondere bottoni — CLAUDE.md.
- Validazione Zod su ogni confine (form/API), mai dentro i use case — docs/00 §2.
- Stringhe UI in `messages/it.json` (default) + `messages/en.json`, mai testo hard-coded — CLAUDE.md.
- WCAG 2.1 AA: focus visibile, label/aria, navigazione da tastiera — CLAUDE.md.
- Responsive mobile/tablet/desktop — CLAUDE.md.
- Migrazioni Prisma additive, mai modificate a posteriori — CLAUDE.md.
- Commit piccoli e atomici — CLAUDE.md.
- **Sicurezza dati al rilascio**: tutte le migrazioni di questo piano sono additive (nuovi valori enum, nuove colonne nullable) — nessun drop, nessuna rinomina, nessuna trasformazione distruttiva. Prima di eseguire `prisma migrate deploy` contro la produzione (Supabase, nessun backup automatico sul piano free), lanciare `DATABASE_URL="<prod>" pnpm db:backup pre-<nome-migrazione>` (script `scripts/backup-db.sh`, verificato in questa sessione) come rete di sicurezza.

---

## Task 1: Migrazione schema — nuovi stage + motivo custom + gestione LossReason

**Files:**
- Modify: `prisma/schema.prisma` (enum `LeadStage`, model `Lead`, model `LossReason`)
- Create: `prisma/migrations/<timestamp>_pipeline_extras/migration.sql`

**Interfaces:**
- Produce: enum values `LeadStage.PRESENTATION_CALL_2`, `LeadStage.STANDBY`; campo `Lead.lossReasonCustomText String?`; campi `LossReason.isActive Boolean @default(true)`, `LossReason.sortOrder Int @default(0)`.
- Consumato da: Task 2 (i18n/stage tokens), Task 3 (dialog + Impostazioni + validazione), tutti i test successivi.

- [ ] **Step 1: Aggiungere i due valori all'enum `LeadStage`**

In `prisma/schema.prisma`, nell'enum `LeadStage` (righe ~41-51), inserire nella posizione corretta:
```prisma
enum LeadStage {
  TO_HANDLE // Da gestire
  TAKEN // Preso in carico
  CALL_SCHEDULED // Call schedulata
  WAITING_DOCS // Attesa documenti
  PRESENTATION_CALL // Call presentazione
  PRESENTATION_CALL_2 // Seconda call
  WAITING_DECISION // Attesa decisione
  STANDBY // Stand by
  WAITING_PAYMENT // Attesa pagamento
  WON // Vinta (terminale)
  LOST // Persa (terminale)
}
```

- [ ] **Step 2: Aggiungere `lossReasonCustomText` al model `Lead`**

Subito sotto il campo `lossReasonId`/`lossReason` esistente (cercare "dati per lead persi" / "Dati per lead persi" nel commento):
```prisma
  // Motivo di perdita PERSONALIZZATO (testo libero, alternativa a lossReasonId
  // quando l'utente sceglie "Altro"). Mutuamente esclusivo con lossReasonId —
  // validato in changeStageSchema, non a livello DB.
  lossReasonCustomText String? @db.VarChar(500)
```

- [ ] **Step 3: Aggiungere `isActive`/`sortOrder` al model `LossReason`**

```prisma
model LossReason {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  label     String
  isActive  Boolean @default(true) // disattivato: resta sui lead esistenti, sparisce dal picker per i nuovi
  sortOrder Int     @default(0)
  leads     Lead[]

  @@unique([organizationId, label])
  // Elenco motivi del tenant ordinato + filtro attivi (Settings + select "sposta in Perso").
  @@index([organizationId, sortOrder])
}
```

- [ ] **Step 4: Generare e applicare la migrazione**

```bash
cd /Users/mattiafilosa/Claude/Projects/CRM
pnpm prisma migrate dev --name pipeline_extras
```
Se il tool segnala drift preesistente NON collegato a questo task, NON eseguire `migrate reset` — scrivere la migration a mano nello stesso stile delle altre migration additive del repo (vedi `20260713120000_add_lead_retention_months` come precedente) e applicare con `pnpm prisma migrate deploy`.

Contenuto atteso della migration (adattare se `prisma migrate dev` genera SQL diverso, purché equivalente):
```sql
-- AlterEnum
ALTER TYPE "LeadStage" ADD VALUE 'PRESENTATION_CALL_2';
ALTER TYPE "LeadStage" ADD VALUE 'STANDBY';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "lossReasonCustomText" VARCHAR(500);

-- AlterTable
ALTER TABLE "LossReason" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LossReason" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LossReason_organizationId_sortOrder_idx" ON "LossReason"("organizationId", "sortOrder");
```

Nota Postgres: se `prisma migrate dev` fallisce mettendo `ADD VALUE` nella stessa transazione di altri statement, dividere in due migration separate (prima l'`ALTER TYPE`, poi tutto il resto) — è un vincolo noto di Postgres su enum + transazioni.

- [ ] **Step 5: Rigenerare il client ed eseguire il typecheck**

```bash
pnpm prisma generate
pnpm typecheck
```
Expected: nessun errore.

- [ ] **Step 6: Aggiornare `docs/03-modello-dati.md`**

Aggiungere una riga in "3.3.1 Scostamenti" che documenti i 3 campi nuovi e i 2 valori enum nuovi, stesso stile delle righe già presenti per `leadRetentionMonths`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations docs/03-modello-dati.md
git commit -m "feat(db): stage pipeline seconda-call/stand-by, motivo perdita custom, LossReason isActive/sortOrder"
```

---

## Task 2: Nuovi stage in i18n, color token, default `PipelineStageConfig`

**Files:**
- Modify: `messages/it.json`, `messages/en.json` (namespace `enum.leadStage`)
- Modify: `src/components/pipeline/stage-tokens.ts` (`DEFAULT_STAGE_TOKENS`)
- Modify: file CSS/tema dove sono definite le custom properties `--stage-*` (cercare dove sono usate `--stage-to-handle` ecc. — verosimilmente nel seed `INDIGO_THEME.stageColors` di `prisma/seed-helpers.ts` E in un file di default theme CSS lato client — leggere entrambi prima di editare)
- Modify: `src/server/pipeline/get-pipeline-config.ts` (default `sortOrder` per stage senza riga `PipelineStageConfig`)
- Test: aggiornare/estendere test esistenti di `get-pipeline-config.test.ts` se presente

**Interfaces:**
- Consuma: `LeadStage.PRESENTATION_CALL_2`, `LeadStage.STANDBY` (Task 1).
- Produce: label localizzate, colori, e sortOrder di default corretti — consumati da Task 5 (kanban card) e da qualunque punto che itera su `Object.values(LeadStage)` (es. `update-stage-dialog.tsx`, che non va modificato: enumera già tutti i valori dinamicamente).

- [ ] **Step 1: Leggere lo stato attuale prima di editare**

```bash
grep -n "TO_HANDLE\|leadStage" /Users/mattiafilosa/Claude/Projects/CRM/messages/it.json
grep -n "DEFAULT_STAGE_TOKENS" -A 15 /Users/mattiafilosa/Claude/Projects/CRM/src/components/pipeline/stage-tokens.ts
grep -rn "stage-to-handle\|stageColors" /Users/mattiafilosa/Claude/Projects/CRM/prisma/seed-helpers.ts
grep -rln "stage-to-handle" /Users/mattiafilosa/Claude/Projects/CRM/src
```

- [ ] **Step 2: Aggiungere le due label in `messages/it.json` e `messages/en.json`**

Nel namespace `enum.leadStage`, tra `PRESENTATION_CALL` e `WAITING_DECISION` aggiungere `PRESENTATION_CALL_2: "Seconda call"`; tra `WAITING_DECISION` e `WAITING_PAYMENT` aggiungere `STANDBY: "Stand by"`. In `en.json`: `"Second call"` e `"Standby"`.

- [ ] **Step 3: Verificare la parità messaggi**

```bash
npx vitest run src/i18n/messages.test.ts
```
Expected: PASS (nessuna chiave orfana/mancante tra it/en).

- [ ] **Step 4: Aggiungere i due color token**

In `DEFAULT_STAGE_TOKENS` (`stage-tokens.ts`), inserire `PRESENTATION_CALL_2: "--stage-presentation-2"` e `STANDBY: "--stage-standby"` nelle posizioni corrispondenti. Nel/i file dove sono definite le variabili CSS `--stage-*` di default (trovato allo Step 1), aggiungere le due nuove variabili con un colore distinto dagli 8 esistenti (scegliere due tonalità non già usate nella palette `INDIGO_THEME.stageColors` di `seed-helpers.ts` e applicare la STESSA coppia di colori in entrambi i posti, altrimenti demo/preview divergono).

- [ ] **Step 5: Default `sortOrder` per i due nuovi stage in `getPipelineConfig`**

Leggere `src/server/pipeline/get-pipeline-config.ts` per intero. Il meccanismo di "sintetizza default per stage mancanti" deve produrre, per un tenant che non ha ancora una riga `PipelineStageConfig` per `PRESENTATION_CALL_2`/`STANDBY`, un `sortOrder` che li colloca esattamente tra PRESENTATION_CALL/WAITING_DECISION e WAITING_DECISION/WAITING_PAYMENT — non in coda. Se il default è generato da un array ordinato tipo `PIPELINE_STAGES` (vedi `prisma/seed-helpers.ts`), verificare che quell'array sia la stessa fonte usata anche da `getPipelineConfig` (se sono due liste separate che rischiano di divergere, allinearle) e aggiungere lì i due stage nella posizione corretta con `sortOrder` conseguente (es. rinumerare tutta la sequenza 0..9).

- [ ] **Step 6: Aggiornare `PIPELINE_STAGES` in `prisma/seed-helpers.ts`**

Aggiungere le due righe nella posizione corretta con `colorToken` corrispondente ai due nuovi token CSS, rinumerando `sortOrder` per tutta la sequenza (0..9):
```ts
export const PIPELINE_STAGES: ReadonlyArray<{
  stage: LeadStage;
  sortOrder: number;
  colorToken: string;
}> = [
  { stage: LeadStage.TO_HANDLE, sortOrder: 0, colorToken: "--stage-to-handle" },
  { stage: LeadStage.TAKEN, sortOrder: 1, colorToken: "--stage-taken" },
  { stage: LeadStage.CALL_SCHEDULED, sortOrder: 2, colorToken: "--stage-call-scheduled" },
  { stage: LeadStage.WAITING_DOCS, sortOrder: 3, colorToken: "--stage-waiting-docs" },
  { stage: LeadStage.PRESENTATION_CALL, sortOrder: 4, colorToken: "--stage-presentation" },
  { stage: LeadStage.PRESENTATION_CALL_2, sortOrder: 5, colorToken: "--stage-presentation-2" },
  { stage: LeadStage.WAITING_DECISION, sortOrder: 6, colorToken: "--stage-waiting-decision" },
  { stage: LeadStage.STANDBY, sortOrder: 7, colorToken: "--stage-standby" },
  { stage: LeadStage.WAITING_PAYMENT, sortOrder: 8, colorToken: "--stage-waiting-payment" },
  { stage: LeadStage.WON, sortOrder: 9, colorToken: "--stage-won" },
  { stage: LeadStage.LOST, sortOrder: 10, colorToken: "--stage-lost" },
];
```
Nota: questo cambia il `sortOrder` di WON/LOST per i tenant seedati EX NOVO dopo questa modifica — non tocca `PipelineStageConfig` già esistenti per tenant già seedati (quelli restano con i loro `sortOrder` attuali finché non li riordinano da Settings). Verificare che questo comportamento sia accettabile leggendo `update-stage-visibility.ts`/`reorder-stages.ts` per capire se c'è un meccanismo di "resync" — se non c'è, è un effetto collaterale noto e accettabile (i tenant esistenti vedono i due nuovi stage in coda finché non riordinano manualmente da Settings; documentarlo in `docs/03`).

- [ ] **Step 7: Test**

```bash
pnpm typecheck
npx vitest run src/server/pipeline
```
Expected: PASS. Se `get-pipeline-config.test.ts` esiste e verifica il numero/ordine di stage default, aggiornare le asserzioni per riflettere i 10 stage (non più 9).

- [ ] **Step 8: Verifica manuale nel browser**

Con dev server locale attivo, login come Fabio, aprire `/pipeline`: verificare che compaiano le colonne "Seconda call" e "Stand by" nella posizione corretta, con colore distinto.

- [ ] **Step 9: Commit**

```bash
git add messages/it.json messages/en.json src/components/pipeline/stage-tokens.ts src/server/pipeline/get-pipeline-config.ts prisma/seed-helpers.ts docs/03-modello-dati.md
git commit -m "feat(pipeline): aggiungi stage Seconda call e Stand by (label, colori, default order)"
```

---

## Task 3: Motivo di perdita personalizzato ("Altro") + validazione XOR

**Files:**
- Modify: `src/server/leads/schemas.ts` (`changeStageSchema`)
- Modify: `src/server/leads/change-stage.ts`
- Modify: `src/components/leads/detail/update-stage-dialog.tsx`
- Modify: `src/components/pipeline/loss-reason-dialog.tsx` (stesso pattern usato nel kanban drag&drop)
- Test: `src/server/leads/change-stage.test.ts`, test dei due componenti dialog

**Interfaces:**
- Consuma: `Lead.lossReasonCustomText` (Task 1).
- Produce: `changeStage(deps, leadId, { stage, lossReasonId?, lossReasonCustomText? })` — contratto esteso, i chiamanti esistenti che passano solo `lossReasonId` continuano a funzionare invariati (nuovo campo opzionale, non breaking).

- [ ] **Step 1: Leggere lo stato attuale**

```bash
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/leads/schemas.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/leads/change-stage.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/components/leads/detail/update-stage-dialog.tsx
cat /Users/mattiafilosa/Claude/Projects/CRM/src/components/pipeline/loss-reason-dialog.tsx
```

- [ ] **Step 2: Scrivere il test che fallisce per la validazione XOR**

In `src/server/leads/change-stage.test.ts`, aggiungere:
```ts
it("rejects LOST with both lossReasonId and lossReasonCustomText", async () => {
  const { deps, leadId } = await setupLeadInStage("WAITING_DECISION");
  await expect(
    changeStage(deps, leadId, {
      stage: LeadStage.LOST,
      lossReasonId: "some-existing-id",
      lossReasonCustomText: "Non risponde più alle chiamate",
    }),
  ).rejects.toThrow(); // ValidationError, uno dei due non entrambi
});

it("accepts LOST with only lossReasonCustomText (no lossReasonId)", async () => {
  const { deps, leadId } = await setupLeadInStage("WAITING_DECISION");
  const result = await changeStage(deps, leadId, {
    stage: LeadStage.LOST,
    lossReasonCustomText: "Non risponde più alle chiamate",
  });
  const updated = await deps.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(updated.lossReasonId).toBeNull();
  expect(updated.lossReasonCustomText).toBe("Non risponde più alle chiamate");
});

it("clears lossReasonCustomText when moving away from LOST", async () => {
  const { deps, leadId } = await setupLeadInStage("WAITING_DECISION");
  await changeStage(deps, leadId, { stage: LeadStage.LOST, lossReasonCustomText: "Prezzo troppo alto" });
  await changeStage(deps, leadId, { stage: LeadStage.WAITING_DECISION });
  const updated = await deps.prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  expect(updated.lossReasonCustomText).toBeNull();
  expect(updated.lossReasonId).toBeNull();
});
```
(Adattare `setupLeadInStage` al vero helper già presente nel file — leggere i test esistenti per il pattern esatto di setup/deps.)

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

```bash
npx vitest run src/server/leads/change-stage.test.ts
```
Expected: FAIL (campo `lossReasonCustomText` non esiste ancora nello schema Zod / non gestito da `changeStage`).

- [ ] **Step 4: Estendere `changeStageSchema`**

In `src/server/leads/schemas.ts`, individuare `changeStageSchema` e sostituirlo con una versione che aggiunge `lossReasonCustomText` opzionale e applica un `.superRefine` per l'XOR quando `stage === LOST`:
```ts
export const changeStageSchema = z
  .object({
    stage: z.nativeEnum(LeadStage),
    lossReasonId: z.string().min(1).optional(),
    lossReasonCustomText: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.stage !== LeadStage.LOST) return;
    const hasId = data.lossReasonId !== undefined;
    const hasCustom = data.lossReasonCustomText !== undefined;
    if (hasId === hasCustom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: hasId
          ? "Specify either lossReasonId or lossReasonCustomText, not both"
          : "lossReasonId or lossReasonCustomText is required when moving to LOST",
        path: ["lossReasonId"],
      });
    }
  });
```
(Adattare l'import di `LeadStage`/`z` allo stile già presente nel file; se il file usa già un pattern diverso per enum Zod, riusarlo.)

- [ ] **Step 5: Estendere `changeStage`**

In `change-stage.ts`, dove oggi si scrive `lossReasonId: movingToLost ? data.lossReasonId : null`, aggiungere la scrittura simmetrica di `lossReasonCustomText`:
```ts
const movingToLost = data.stage === LeadStage.LOST;
await tx.lead.update({
  where: { id: leadId },
  data: {
    stage: data.stage,
    stageChangedAt: now,
    lossReasonId: movingToLost ? (data.lossReasonId ?? null) : null,
    lossReasonCustomText: movingToLost ? (data.lossReasonCustomText ?? null) : null,
  },
});
```
Se `data.lossReasonId` è valorizzato, mantenere l'`assertLossReasonBelongsToTenant` esistente invariata (si applica solo quando è presente, non quando si usa il testo custom).

- [ ] **Step 6: Eseguire il test e verificare che passi**

```bash
npx vitest run src/server/leads/change-stage.test.ts
```
Expected: PASS.

- [ ] **Step 7: UI — opzione "Altro" in `update-stage-dialog.tsx`**

Nel `<Select>` dei motivi di perdita (visibile quando lo stage selezionato è LOST), aggiungere in fondo alla lista un'opzione con value sentinella `"__other__"`. Nello stato del componente, quando `reasonId === "__other__"`, mostrare un `<Input>` per il testo libero al posto del select (o sotto), e nel submit passare `lossReasonCustomText` invece di `lossReasonId` quando la sentinella è selezionata. Leggere prima l'esatta struttura dello state/submit del componente (Step 1) per innestare la modifica nello stesso stile (client component, `useActionState` o simile già in uso).

- [ ] **Step 8: Stessa modifica in `loss-reason-dialog.tsx`**

Stesso pattern "Altro" + input, per il flusso drag&drop nel kanban (che usa questo dialog separato, come emerso in una revisione precedente in questa sessione — coerenza tra i due punti di ingresso al medesimo flusso).

- [ ] **Step 9: Stringhe i18n**

Aggiungere in `messages/it.json`/`en.json` sotto `pipeline.lossReason.*`: `other: "Altro"`, `customPlaceholder: "Scrivi il motivo..."` (o chiavi equivalenti coerenti col namespace esistente — leggere le chiavi già presenti in quel namespace prima di aggiungerne di nuove per restare coerenti).

- [ ] **Step 10: Verifica parità messaggi + test componenti**

```bash
npx vitest run src/i18n/messages.test.ts
npx vitest run src/components/leads/detail/update-stage-dialog.test.tsx src/components/pipeline/loss-reason-dialog.test.tsx
```
(Se i file di test dei due componenti non esistono ancora, crearli seguendo lo stile di `data-retention-panel.test.tsx` costruito in questa sessione: render, selezione "Altro", digitazione testo, submit, assert sulla action chiamata con `lossReasonCustomText`.)

- [ ] **Step 11: Typecheck + lint globali**

```bash
pnpm typecheck && pnpm lint
```
Expected: puliti.

- [ ] **Step 12: Commit**

```bash
git add src/server/leads src/components/leads/detail/update-stage-dialog.tsx src/components/pipeline/loss-reason-dialog.tsx messages/it.json messages/en.json
git commit -m "feat(pipeline): motivo di perdita personalizzato (opzione Altro + testo libero)"
```

---

## Task 4: Impostazioni — gestione elenco motivi di perdita (CRUD)

**Files:**
- Create: `src/server/loss-reasons/` (nuovo modulo: `deps.ts`, `schemas.ts`, `list-loss-reasons.ts`, `create-loss-reason.ts`, `update-loss-reason.ts`, `deactivate-loss-reason.ts`, `reorder-loss-reasons.ts`, `index.ts`, relativi `.test.ts`) — oppure, se esiste già un modulo `src/server/leads/loss-reasons*` da estendere invece di crearne uno nuovo, verificarlo prima (grep `listLossReasons` — risulta già in `src/server/leads/reference-data.ts` per la sola lettura: valutare se estendere quel file con create/update/deactivate/reorder invece di un modulo nuovo, per coerenza — decisione da prendere leggendo `reference-data.ts` per intero prima di scegliere)
- Create: `src/app/[locale]/(app)/settings/loss-reasons/page.tsx`, `actions.ts`
- Create: `src/components/settings/loss-reasons-panel.tsx` (+ `.test.tsx`)
- Modify: `src/app/[locale]/(app)/settings/page.tsx` (link card, stesso pattern della card "Conservazione dati")
- Modify: `messages/it.json`, `messages/en.json`

**Interfaces:**
- Consuma: `LossReason.isActive`/`sortOrder` (Task 1); pattern Settings CRUD di riferimento: `src/server/organization/update-retention.ts` + `src/app/[locale]/(app)/settings/data-retention/` (costruiti in questa stessa sessione — usarli come TEMPLATE letterale di struttura file, error handling, RBAC, test).
- Produce: `listLossReasons(deps): Promise<{id,label,isActive,sortOrder}[]>` (sostituisce/estende quello in `reference-data.ts`, che deve continuare a restituire SOLO i reason attivi per il picker "sposta in Perso" — verificare che i due usi, Settings (tutti, anche disattivati) e picker (solo attivi), NON collidano: se serve, aggiungere un parametro `{ includeInactive: boolean }`).

- [ ] **Step 1: Leggere il template di riferimento e il codice esistente**

```bash
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/leads/reference-data.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/organization/update-retention.ts
ls /Users/mattiafilosa/Claude/Projects/CRM/src/app/\[locale\]/\(app\)/settings/data-retention/
cat /Users/mattiafilosa/Claude/Projects/CRM/src/app/\[locale\]/\(app\)/settings/data-retention/actions.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/components/settings/data-retention-panel.tsx
```

- [ ] **Step 2: Scrivere i test dei 4 use case (fallenti)**

Creare `src/server/loss-reasons/loss-reasons.test.ts` (o file separati per use case, seguendo lo stile del modulo `privacy/`) con casi:
- `createLossReason`: crea con `label` + `sortOrder` in coda; rifiuta label duplicata nel tenant (`@@unique([organizationId, label])`); isolamento tenant (non tocca altri tenant).
- `updateLossReason`: rinomina `label`; rifiuta se il nuovo `label` collide con un altro esistente nel tenant.
- `deactivateLossReason`/`reactivateLossReason`: toggle `isActive`; un motivo disattivato resta referenziato dai lead esistenti (non li tocca).
- `reorderLossReasons`: accetta un array ordinato di id, riscrive `sortOrder` 0..N-1; rifiuta id non appartenenti al tenant.
- `listLossReasons(deps, { includeInactive })`: default `includeInactive: false` per il picker, `true` per Settings.

- [ ] **Step 3: Eseguire i test e verificare che falliscano**

```bash
npx vitest run src/server/loss-reasons
```
Expected: FAIL (moduli non esistono).

- [ ] **Step 4: Implementare i use case**

Un file per use case, ciascuno che prende `deps: LossReasonDeps` (client tenant-scoped + audit, stesso pattern di `PrivacyDeps`/organization deps già visti), valida input con Zod (`schemas.ts`), tenant-scoped via `deps.prisma`. Nessun audit trail necessario qui (a differenza del modulo GDPR, queste non sono operazioni sui dati personali — coerente col fatto che `LeadSource` non ha audit).

- [ ] **Step 5: Eseguire i test e verificare che passino**

```bash
npx vitest run src/server/loss-reasons
```
Expected: PASS.

- [ ] **Step 6: Server Actions + pagina Settings**

`src/app/[locale]/(app)/settings/loss-reasons/actions.ts`: 4 action (`createLossReasonAction`, `updateLossReasonAction`, `toggleLossReasonActiveAction`, `reorderLossReasonsAction`), ciascuna `requireTenantContext()` → `requirePermission(role, "settings.tenant")` → use case. `page.tsx`: Server Component che fa `listLossReasons(deps, { includeInactive: true })` e passa al panel client, stesso schema di `data-retention/page.tsx`.

- [ ] **Step 7: Componente `LossReasonsPanel`**

Client component: lista dei motivi con label, badge attivo/disattivato, bottoni rinomina/disattiva-riattiva, frecce su/giù (o drag) per riordinare, form "Aggiungi motivo" in fondo. WCAG: ogni azione ha un `aria-label` esplicito con il nome del motivo (es. "Disattiva: Budget insufficiente"), focus visibile, operabile da tastiera (frecce riordino devono avere un'alternativa non-drag, come già fatto per `reorder-stages` — verificare come quel componente gestisce il riordino accessibile e riusare lo stesso pattern).

- [ ] **Step 8: Link card in Settings**

In `settings/page.tsx`, aggiungere una card "Motivi di perdita" identica per struttura a quella di "Conservazione dati" (stesso gating `can(role, "settings.tenant")`).

- [ ] **Step 9: `listLossReasons` per il picker — solo attivi**

Verificare/adattare `src/server/leads/reference-data.ts` (`listLossReasons`) così che il picker "sposta in Perso" (`update-stage-dialog.tsx`, `loss-reason-dialog.tsx`) riceva SOLO i motivi con `isActive: true`, ordinati per `sortOrder`. Se `reference-data.ts` diventa ridondante col nuovo modulo, valutare se farlo diventare un thin re-export di `listLossReasons(deps, { includeInactive: false })` dal nuovo modulo, per non duplicare la query.

- [ ] **Step 10: Stringhe i18n**

`messages/it.json`/`en.json`: namespace `settings.lossReasons.*` (title, add button, rename, deactivate, reactivate, empty state, conferme), seguendo lo stile del namespace `dataRetention.*` già presente.

- [ ] **Step 11: Test componente + parità i18n**

```bash
npx vitest run src/components/settings/loss-reasons-panel.test.tsx
npx vitest run src/i18n/messages.test.ts
```
Expected: PASS.

- [ ] **Step 12: Typecheck + lint + suite completa**

```bash
pnpm typecheck && pnpm lint && pnpm test
```
Expected: tutto verde.

- [ ] **Step 13: Verifica manuale nel browser**

Login Fabio locale → Impostazioni → Motivi di perdita: aggiungere un motivo, rinominarlo, disattivarlo, riordinare. Poi aprire un lead e verificare che il disattivato non compaia più nel picker "sposta in Perso" ma un lead che lo usava già lo mostri ancora in dettaglio/storico.

- [ ] **Step 14: Commit**

```bash
git add src/server/loss-reasons src/app/[locale]/(app)/settings src/components/settings/loss-reasons-panel.tsx src/server/leads/reference-data.ts messages/it.json messages/en.json
git commit -m "feat(settings): gestione CRUD motivi di perdita (aggiungi/rinomina/disattiva/riordina)"
```

- [ ] **Step 15: Dashboard — bucket "Altro" per motivi custom**

Leggere `src/server/dashboard/get-lost-breakdown.ts` per intero. Adattare la query/aggregazione: i lead con `lossReasonId: null` e `lossReasonCustomText: { not: null }` vanno raggruppati in una riga aggiuntiva `{ label: "Altro" (i18n), count }`. Aggiungere/estendere il test esistente con un lead perso con motivo custom e verificare che compaia nel bucket "Altro" senza spezzare il breakdown per stringa unica.

```bash
npx vitest run src/server/dashboard/get-lost-breakdown.test.ts
```
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add src/server/dashboard/get-lost-breakdown.ts src/server/dashboard/get-lost-breakdown.test.ts messages/it.json messages/en.json
git commit -m "feat(dashboard): bucket Altro per motivi di perdita personalizzati nel breakdown"
```

---

## Task 5: Form "Modifica lead"

**Files:**
- Create: `src/components/leads/detail/edit-lead-dialog.tsx` (+ `.test.tsx`)
- Modify: `src/app/[locale]/(app)/leads/[leadId]/page.tsx` (bottone "Modifica" nell'header)
- Modify: `src/app/[locale]/(app)/leads/actions.ts` (verificare se serve una nuova action `updateLeadContactAction` o se una già esistente collegata a `updateLead` è già generica abbastanza — leggere il file per intero prima di aggiungere)
- Modify: `messages/it.json`, `messages/en.json`

**Interfaces:**
- Consuma: `updateLead(deps, leadId, input)` esistente (`src/server/leads/update-lead.ts`, NON modificare — accetta già `firstName`/`lastName`/`email`/`phone`).
- Riferimento UI: `src/components/leads/new-lead-dialog.tsx` (stesso pattern dialog+form, da leggere per intero prima di scrivere `edit-lead-dialog.tsx`).

- [ ] **Step 1: Leggere i riferimenti**

```bash
cat /Users/mattiafilosa/Claude/Projects/CRM/src/components/leads/new-lead-dialog.tsx
cat /Users/mattiafilosa/Claude/Projects/CRM/src/app/\[locale\]/\(app\)/leads/actions.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/leads/update-lead.ts
```

- [ ] **Step 2: Action per l'update anagrafico (se manca)**

Se `leads/actions.ts` non ha già un'action generica che passa `firstName/lastName/email/phone` a `updateLead` con `requirePermission(role, "lead.update")`, aggiungerla (`updateLeadContactAction`), stesso pattern try/catch → i18n error key delle altre action nel file.

- [ ] **Step 3: Test del componente (fallente)**

`edit-lead-dialog.test.tsx`: render con lead esistente, apertura dialog, modifica campi, submit, assert che l'action venga chiamata con i valori corretti; caso errore (es. email invalida) mostra `FormAlert`; focus torna al bottone "Modifica" alla chiusura (stesso fix di focus-restoration già applicato a `Modal` in questa sessione — verificare che sia automatico visto che `Modal` ora lo gestisce da solo).

```bash
npx vitest run src/components/leads/detail/edit-lead-dialog.test.tsx
```
Expected: FAIL (componente non esiste).

- [ ] **Step 4: Implementare `EditLeadDialog`**

Client component, stesso scheletro di `new-lead-dialog.tsx` ma precompilato con i valori attuali del lead (`firstName`, `lastName`, `email`, `phone` passati come props), submit su `updateLeadContactAction`, capability-gated (renderizzato solo se `canUpdate`).

- [ ] **Step 5: Wiring nella pagina lead detail**

In `leads/[leadId]/page.tsx`, aggiungere il bottone "Modifica" nell'header (vicino a `UpdateStageDialog`, prima di `LeadOverflowActions`), visibile solo se `perms.canUpdate`, che apre `EditLeadDialog`.

- [ ] **Step 6: Eseguire test e verificare che passino**

```bash
npx vitest run src/components/leads/detail/edit-lead-dialog.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Stringhe i18n**

`messages/it.json`/`en.json`: `leadDetail.edit.*` (title, campi, salva, annulla, successo).

- [ ] **Step 8: Typecheck + lint + parità i18n**

```bash
pnpm typecheck && pnpm lint
npx vitest run src/i18n/messages.test.ts
```

- [ ] **Step 9: Verifica manuale + a11y smoke**

Nel browser locale: aprire un lead, cliccare "Modifica", cambiare nome/email, salvare, verificare che l'header si aggiorni. Verificare focus da tastiera (Tab fino al bottone, Enter apre, Escape chiude e il focus torna al bottone).

- [ ] **Step 10: Commit**

```bash
git add src/components/leads/detail/edit-lead-dialog.tsx src/app/[locale]/(app)/leads messages/it.json messages/en.json
git commit -m "feat(leads): form di modifica anagrafica lead (nome, cognome, email, telefono)"
```

---

## Task 6: Prossimo appuntamento sulla card kanban

**Files:**
- Modify: `src/server/pipeline/get-board.ts` (`PipelineCard` interface + query)
- Modify: `src/server/pipeline/selectors.ts` se serve un select condiviso per gli appuntamenti
- Modify: `src/components/pipeline/kanban-card.tsx`
- Test: `src/server/pipeline/get-board.test.ts`, `src/components/pipeline/kanban-card.test.tsx`

**Interfaces:**
- Produce: `PipelineCard.nextAppointment: { startAt: string; status: AppointmentStatus } | null`.
- Consuma: `Appointment` model esistente (`leadId`, `startAt`, `status`), nessuna modifica di schema necessaria.

- [ ] **Step 1: Leggere lo stato attuale**

```bash
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/pipeline/get-board.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/pipeline/selectors.ts
```

- [ ] **Step 2: Test fallente su `getBoard`**

In `get-board.test.ts`, aggiungere un caso: un lead con due appuntamenti futuri non cancellati → la card espone solo il più vicino; un lead con appuntamento futuro CANCELLED e nessun altro → `nextAppointment: null`; un lead con appuntamento passato ma nessuno futuro → `nextAppointment: null` (per decisione presa in brainstorming: solo futuri, non cancellati); isolamento tenant (appuntamento di un altro tenant non deve mai comparire).

```bash
npx vitest run src/server/pipeline/get-board.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Estendere `PipelineCard` e la query**

In `get-board.ts`:
```ts
export interface PipelineCard {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stage: LeadStage;
  readonly daysInStage: number;
  readonly capitalBracket: PipelineCardRowCapital;
  readonly capitalAmount: number | null;
  readonly source: { id: string; label: string } | null;
  readonly nextAppointment: { startAt: string; status: AppointmentStatus } | null;
}
```
Dopo la query principale dei lead (che produce `visibleLeadIds`), una seconda query batched tenant-scoped:
```ts
const upcomingAppointments = await deps.prisma.appointment.findMany({
  where: {
    leadId: { in: visibleLeadIds },
    startAt: { gte: clockNow(deps) },
    status: { not: AppointmentStatus.CANCELLED },
  },
  orderBy: { startAt: "asc" },
  select: { leadId: true, startAt: true, status: true },
});
const nextAppointmentByLead = new Map<string, { startAt: string; status: AppointmentStatus }>();
for (const appt of upcomingAppointments) {
  if (appt.leadId && !nextAppointmentByLead.has(appt.leadId)) {
    nextAppointmentByLead.set(appt.leadId, { startAt: appt.startAt.toISOString(), status: appt.status });
  }
}
```
(Adattare il nome dell'helper "now" al pattern deps già in uso nel modulo pipeline — verificare se esiste un `clockNow` equivalente lì o se il modulo usa `new Date()` direttamente; se il modulo NON ha un meccanismo di clock iniettabile, seguire lo stile esistente del file per restare coerenti, non introdurne uno nuovo isolato.) Poi, nel map finale che costruisce ogni `PipelineCard`, aggiungere `nextAppointment: nextAppointmentByLead.get(lead.id) ?? null`.

- [ ] **Step 4: Eseguire test e verificare che passino**

```bash
npx vitest run src/server/pipeline/get-board.test.ts
```
Expected: PASS.

- [ ] **Step 5: UI nella card**

In `kanban-card.tsx`, nel blocco `<div className="flex flex-wrap items-center gap-2">` (quello con capitale/source, righe ~181-193 dopo la rimozione del pill di stage fatta in questa stessa sessione), aggiungere PRIMA o DOPO una riga separata (non nello stesso flex-wrap, per non affollare) con l'appuntamento se presente:
```tsx
{card.nextAppointment ? (
  <p className="label-mono text-muted flex items-center gap-1">
    <CalendarIcon aria-hidden="true" className="h-3.5 w-3.5" />
    {formatDateTimeShort(card.nextAppointment.startAt)}
  </p>
) : null}
```
(Verificare se esiste già un helper `formatDateTimeShort`/icona calendario riusabile nel repo — `src/i18n/format.ts` per la formattazione data, `src/components/ui` o una libreria icone già in uso altrove per l'icona — riusare quelli esistenti, non inventarne di nuovi.)

- [ ] **Step 6: Test componente**

Estendere `kanban-card.test.tsx` con un caso `nextAppointment` presente/assente, verificando che il testo/orario compaia solo quando presente.

```bash
npx vitest run src/components/pipeline/kanban-card.test.tsx
```
Expected: PASS.

- [ ] **Step 7: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 8: Verifica manuale**

Nel browser locale, creare un appuntamento futuro per un lead visibile in board, verificare che compaia sulla card; cancellarlo/spostarlo nel passato, verificare che sparisca.

- [ ] **Step 9: Commit**

```bash
git add src/server/pipeline/get-board.ts src/components/pipeline/kanban-card.tsx
git commit -m "feat(pipeline): mostra il prossimo appuntamento sulla card kanban"
```

---

## Task 7: Filtro data dashboard con calendario (range libero + "ultima settimana")

**Files:**
- Create: `src/components/dashboard/date-range-filter.tsx` (+ `.test.tsx`)
- Create: `src/server/dashboard/date-range.ts` (+ `.test.ts`) — parallelo a `period.ts` esistente, non lo sostituisce
- Modify: `src/app/[locale]/(app)/dashboard/page.tsx`

**Interfaces:**
- Consuma: query param nuovi `from`/`to` (ISO date, `YYYY-MM-DD`), letti accanto (non al posto di) `year`/`month` esistenti.
- Produce: `resolveDateRangeBounds({ from?: string; to?: string; preset?: "lastWeek" }): { gte: Date; lt: Date } | null` — con precedenza su `resolvePeriodBounds`/equivalente quando `from`/`to`/`preset` sono presenti nell'URL.

- [ ] **Step 1: Leggere lo stato attuale**

```bash
cat /Users/mattiafilosa/Claude/Projects/CRM/src/app/\[locale\]/\(app\)/dashboard/page.tsx
cat /Users/mattiafilosa/Claude/Projects/CRM/src/server/dashboard/period.ts
cat /Users/mattiafilosa/Claude/Projects/CRM/src/components/pipeline/period-filter.tsx
```

- [ ] **Step 2: Test fallente per `resolveDateRangeBounds`**

`src/server/dashboard/date-range.test.ts`:
```ts
it("returns null when no from/to/preset given", () => {
  expect(resolveDateRangeBounds({})).toBeNull();
});
it("resolves an explicit from/to as UTC half-open bounds", () => {
  const result = resolveDateRangeBounds({ from: "2026-07-01", to: "2026-07-10" });
  expect(result?.gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  expect(result?.lt.toISOString()).toBe("2026-07-11T00:00:00.000Z"); // "to" incluso -> lt = to+1 giorno
});
it("resolves the lastWeek preset relative to an injected now", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const result = resolveDateRangeBounds({ preset: "lastWeek" }, now);
  expect(result?.gte.toISOString()).toBe("2026-07-07T12:00:00.000Z");
  expect(result?.lt.toISOString()).toBe("2026-07-14T12:00:00.000Z");
});
```

- [ ] **Step 3: Eseguire e verificare fallimento**

```bash
npx vitest run src/server/dashboard/date-range.test.ts
```
Expected: FAIL (modulo non esiste).

- [ ] **Step 4: Implementare `date-range.ts`**

```ts
export interface DateRangeInput {
  readonly from?: string; // YYYY-MM-DD
  readonly to?: string; // YYYY-MM-DD
  readonly preset?: "lastWeek";
}

export function resolveDateRangeBounds(
  input: DateRangeInput,
  now: Date = new Date(),
): { gte: Date; lt: Date } | null {
  if (input.preset === "lastWeek") {
    const lt = now;
    const gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { gte, lt };
  }
  if (input.from && input.to) {
    const gte = new Date(`${input.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${input.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return { gte, lt: toExclusive };
  }
  return null;
}
```
(Verificare contro `period.ts` che il pattern di bound "half-open UTC" sia coerente — riusare la stessa convenzione già in uso lì, non inventarne una diversa.)

- [ ] **Step 5: Eseguire e verificare successo**

```bash
npx vitest run src/server/dashboard/date-range.test.ts
```
Expected: PASS.

- [ ] **Step 6: Componente `DateRangeFilter`**

Client component URL-driven (stesso pattern di `period-filter.tsx`: legge/scrive query param con `router.replace`). Contenuto: due bottoni preset ("Ultima settimana", "Tutto" — quest'ultimo rimuove `from`/`to`/`preset` dall'URL) + due `<input type="date">` (dal/al) con submit su change. Quando `from`/`to`/`preset` sono presenti in URL, questo filtro ha precedenza sul `PeriodFilter` esistente (che resta visibile ma diventa "inerte" finché l'utente non svuota il range — comunicarlo con un piccolo testo di stato, es. "Filtro per intervallo attivo" quando `from`/`to` sono presenti).

- [ ] **Step 7: Wiring in `dashboard/page.tsx`**

Leggere `from`/`to`/`preset` dai searchParams accanto a `year`/`month`. Se `resolveDateRangeBounds` ritorna un valore non-null, usarlo per tutte le query dei widget KPI al posto dei bound anno/mese; altrimenti fallback al comportamento attuale (`year`/`month`, default anno corrente). Verificare quali funzioni dashboard accettano oggi `{ gte, lt }` vs `{ year, month }` — se i widget già accettano bound generici (`{ gte: Date; lt: Date }`) internamente e solo `period.ts` li deriva da year/month, il wiring è immediato; se invece i widget prendono `year`/`month` direttamente, va introdotto un livello comune di bound espliciti condiviso da entrambi i filtri (piccola refactor mirata, non un redesign).

- [ ] **Step 8: Test componente**

`date-range-filter.test.tsx`: click su "Ultima settimana" aggiorna l'URL con `preset=lastWeek`; digitare date in dal/al aggiorna `from`/`to`; click "Tutto" rimuove i tre param.

```bash
npx vitest run src/components/dashboard/date-range-filter.test.tsx
```
Expected: PASS.

- [ ] **Step 9: Stringhe i18n**

`messages/it.json`/`en.json`: `dashboard.dateRange.*` (lastWeek, all, from, to, activeRangeNotice).

- [ ] **Step 10: Typecheck + lint + parità i18n**

```bash
pnpm typecheck && pnpm lint
npx vitest run src/i18n/messages.test.ts
```

- [ ] **Step 11: Verifica manuale**

Nel browser locale, aprire `/dashboard`, cliccare "Ultima settimana", verificare che i KPI si aggiornino e l'URL contenga `preset=lastWeek`; impostare un range dal/al manuale; tornare a "Tutto".

- [ ] **Step 12: Commit**

```bash
git add src/components/dashboard/date-range-filter.tsx src/server/dashboard/date-range.ts src/app/[locale]/(app)/dashboard/page.tsx messages/it.json messages/en.json
git commit -m "feat(dashboard): filtro data con calendario (range libero + ultima settimana)"
```

---

## Task 8: Riordino Note/Appuntamenti nel lead detail (banale)

**Files:**
- Modify: `src/app/[locale]/(app)/leads/[leadId]/page.tsx`

- [ ] **Step 1: Scambiare l'ordine dei due blocchi**

Nella colonna centrale (righe ~186-196 circa, verificare il numero esatto dopo le modifiche dei task precedenti), spostare `AppointmentsPanel` PRIMA di `NotesPanel`:
```tsx
<div className="flex flex-col gap-4">
  {showAppointments ? (
    <AppointmentsPanel leadId={lead.id} appointments={appointments} />
  ) : null}
  <NotesPanel
    leadId={lead.id}
    notes={lead.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt }))}
    canNote={perms.canNote}
  />
  {showInvoices ? <InvoicesPanel leadId={lead.id} invoices={invoices} /> : null}
</div>
```
Aggiornare anche il commento in testa al file che descrive l'ordine ("Notes first... then Appointments") per riflettere il nuovo ordine.

- [ ] **Step 2: Typecheck + test pagina se esistono**

```bash
pnpm typecheck
npx vitest run src/app/\[locale\]/\(app\)/leads
```

- [ ] **Step 3: Verifica manuale + e2e se copre questo layout**

```bash
pnpm test:e2e -- --grep "lead detail"
```
(Solo se esiste un test e2e che asserisce l'ordine dei pannelli — se sì, aggiornarlo di conseguenza; se non esiste, skip.)

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/(app)/leads/[leadId]/page.tsx
git commit -m "fix(leads): appuntamenti sopra le note nel dettaglio lead"
```

---

## Task 9: Revisione finale — isolamento tenant, a11y, suite completa

**Files:** nessuno specifico — revisione trasversale su tutti i file toccati dai Task 1-8.

- [ ] **Step 1: Suite completa**

```bash
cd /Users/mattiafilosa/Claude/Projects/CRM
pnpm typecheck && pnpm lint && pnpm test
```
Expected: tutto verde, nessuna regressione.

- [ ] **Step 2: Revisione isolamento tenant**

Dispatch `tenant-isolation-reviewer` su tutti i file server-side toccati (loss-reasons, change-stage esteso, get-board esteso, date-range, edit-lead action) — READ ONLY, riportare bloccanti vs minori.

- [ ] **Step 3: Revisione accessibilità**

Dispatch `design-system-a11y-engineer` sui nuovi componenti (LossReasonsPanel, EditLeadDialog, DateRangeFilter, opzione "Altro" nei due dialog motivo perdita) — focus, aria-live, contrasto, tastiera.

- [ ] **Step 4: e2e mirati**

Se esistono test e2e su pipeline/lead-detail/dashboard, eseguire l'intera suite e2e:
```bash
pnpm test:e2e
```
Aggiungere nuovi scenari e2e solo per i flussi critici toccati (spostare un lead in Perso con motivo custom; modificare un lead; filtrare la dashboard per ultima settimana) se il progetto ha una convenzione di e2e per flussi critici (docs/00) — seguire lo stile dei test e2e già presenti.

- [ ] **Step 5: Build di produzione**

```bash
pnpm build
```
Expected: nessun errore.

- [ ] **Step 6: Commit finale (se la revisione produce fix)**

```bash
git add -A
git commit -m "fix: correzioni da revisione isolamento tenant/a11y sulle migliorie pipeline"
```
