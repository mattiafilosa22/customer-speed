# Migliorie pipeline, lead detail, dashboard — design

Data: 2026-07-14

## Contesto

Batch di 6 richieste utente. Due risultano già implementate (verificato nel codice):
- **Selettore capitale** (6 fasce 0-50k…>1mln) — già presente e funzionante in `capital-select.tsx`, colonna laterale del lead detail.
- **Uscire dallo stato Perso** — già possibile oggi: `update-stage-dialog.tsx` non blocca l'uscita da LOST, e `change-stage.ts` pulisce `lossReasonId` quando si esce da LOST.

Restano 5 sotto-progetti indipendenti + 1 modifica banale, coperti da questo documento.

## 0. Ordine Note/Appuntamenti (banale)

In `src/app/[locale]/(app)/leads/[leadId]/page.tsx`, colonna centrale: scambiare `AppointmentsPanel` sopra `NotesPanel` (oggi è il contrario). Nessuna logica coinvolta, solo ordine JSX.

## 1. Due nuovi stage pipeline

**Enum**: aggiungere a `LeadStage` in `prisma/schema.prisma`:
- `PRESENTATION_CALL_2` — "Seconda call"
- `STANDBY` — "Stand by"

Migrazione additiva (`ALTER TYPE "LeadStage" ADD VALUE ...`), nessun lead esistente rimappato (i lead restano nel loro stage attuale).

**Sequenza risultante** (10 stage): Da gestire → Preso in carico → Call schedulata → Attesa documenti → Call presentazione → **Seconda call** → Attesa decisione → **Stand by** → Attesa pagamento → Vinta / Persa.

**Cosa serve**:
- `messages/it.json` + `en.json`: nuove chiavi `enum.leadStage.PRESENTATION_CALL_2` / `.STANDBY`.
- `src/components/pipeline/stage-tokens.ts` (`DEFAULT_STAGE_TOKENS`): due nuovi color token (`--stage-presentation-2`, `--stage-standby` o simili), scelti in coerenza con la palette esistente.
- Design system / CSS custom properties: aggiungere i due token colore (docs/05).
- `getPipelineConfig` sintetizza già default per stage senza riga `PipelineStageConfig` — verificare che il default `sortOrder` per i due nuovi stage li collochi nella posizione corretta (tra PRESENTATION_CALL/WAITING_DECISION e WAITING_DECISION/WAITING_PAYMENT), non in coda.
- `docs/03-modello-dati.md`: aggiornare l'enum documentato.

**Nota Postgres**: `ALTER TYPE ... ADD VALUE` non può girare dentro la stessa transazione di altre operazioni sullo stesso enum in alcune versioni — la migration va scritta con attenzione (statement singolo, coerente con le altre migration additive del repo).

## 2. Motivo di perdita personalizzato + gestione Impostazioni

**Schema**:
- `Lead.lossReasonCustomText String?` (nuovo campo) — valorizzato SOLO quando l'utente sceglie "Altro" invece di un `LossReason` dalla lista. Mutuamente esclusivo con `lossReasonId`.
- `LossReason.isActive Boolean @default(true)` (nuovo campo, stesso pattern di `LeadSource.isActive`).
- `LossReason.sortOrder Int @default(0)` (nuovo campo, stesso pattern di `LeadSource.sortOrder`).

**Validazione** (`changeStageSchema` in `src/server/leads/schemas.ts`): per `stage = LOST`, richiedere XOR tra `lossReasonId` (deve appartenere al tenant, `isActive` irrilevante — un motivo disattivato resta selezionabile se già in uso? No: il picker propone solo motivi attivi, ma un lead già assegnato a un motivo poi disattivato NON viene toccato retroattivamente) e `lossReasonCustomText` (stringa non vuota, lunghezza ragionevole es. max 500 caratteri). Errore di validazione se entrambi assenti o entrambi presenti.

**UI dialog stage** (`update-stage-dialog.tsx`): il `<Select>` dei motivi guadagna un'opzione "Altro" in fondo alla lista (solo motivi `isActive`); selezionandola, appare un `Input` di testo libero al posto del select (o accanto), richiesto per confermare.

**Impostazioni — nuova sezione "Motivi di perdita"** (pattern identico a "Conservazione dati" appena costruita): pagina `settings/loss-reasons/`, capability `settings.tenant`. CRUD:
- Aggiungi (nuovo motivo, label + sortOrder in coda)
- Rinomina (label)
- Disattiva/riattiva (`isActive`, mai hard-delete — un `LossReason` disattivato resta referenziato dai lead che lo usano)
- Riordina (`sortOrder`, drag o frecce su/giù, stesso pattern eventualmente riusato da `PipelineStageConfig` reorder)

**Dashboard** (`get-lost-breakdown.ts`): i lead con `lossReasonCustomText` valorizzato (e `lossReasonId` null) vanno aggregati in un bucket unico "Altro" nel breakdown — il testo libero non genera una riga per ogni stringa unica.

## 3. Form "Modifica lead"

Nuovo client component `EditLeadDialog` (pattern identico a `NewLeadDialog` esistente), bottone "Modifica" nell'header di `leads/[leadId]/page.tsx` (capability `lead.update`, già mappata in RBAC). Campi: `firstName`, `lastName`, `email`, `phone`. Submit tramite Server Action già esistente collegata a `updateLead` — il backend accetta già questi campi, serve solo costruire dialog + form + wiring, nessuna modifica a `update-lead.ts`/schema.

`ContactColumn` resta come display; il dialog è l'unico editor per questi campi (coerente col principio già in uso nella pagina: "no fact is duplicated as an editor + a display in the same place" — verrà comunque mostrato un bottone edit vicino a `ContactColumn` o nell'header, da decidere in fase di piano guardando il layout).

## 4. Filtro data dashboard con calendario

Nuovo componente `DateRangeFilter`, aggiunto ACCANTO al `PeriodFilter` esistente in `dashboard/page.tsx` (che resta invariato — è condiviso con pipeline e lista lead, non va toccato).

- Preset: "Ultima settimana" (ultimi 7 giorni), "Tutto" (nessun bound).
- Range libero: due input data (dal / al) — valutare in fase di piano se bastano due `<input type="date">` nativi (semplice, accessibile, zero dipendenze nuove) o serve un vero date-picker component (Radix non ne espone uno nativo). Preferenza di default: due `<input type="date">`, che sono già accessibili e coerenti con "niente dipendenze non necessarie".
- Nuovi query param dedicati (es. `from`/`to`, ISO date), che se presenti hanno precedenza sul filtro anno/mese esistente lato server dashboard (`src/server/dashboard/period.ts` o un nuovo helper `date-range.ts` parallelo).
- I widget KPI della dashboard che oggi usano `resolvePeriodBounds`/equivalente vanno adattati per accettare bound arbitrari, non solo anno/mese.

## 5. Prossimo appuntamento sulla card kanban

`PipelineCard` (`src/server/pipeline/get-board.ts`) guadagna:
```ts
nextAppointment: { startAt: string; status: AppointmentStatus } | null
```

In `getBoard`, dopo la query principale dei lead visibili, una query batched aggiuntiva: `Appointment.findMany({ where: { leadId: { in: visibleLeadIds }, startAt: { gte: now }, status: { not: CANCELLED } }, orderBy: { startAt: "asc" } })`, poi si riduce in memoria al primo per `leadId` (no N+1, una sola query indipendentemente dal numero di card).

UI (`kanban-card.tsx`): riga aggiuntiva con data/ora formattata (icona calendario + `formatDateShort`/orario), renderizzata solo se `nextAppointment` non è null.

## Ordine di implementazione consigliato

1. Migrazione schema unica per tutti i campi nuovi (stage enum, `Lead.lossReasonCustomText`, `LossReason.isActive`/`sortOrder`) — un solo giro di migrazione invece di più.
2. Stage pipeline (2 nuovi stage) — sblocca subito la board con la sequenza corretta.
3. Motivo di perdita custom + Impostazioni — più complesso, tocca use case + RBAC + UI + dashboard.
4. Modifica lead — isolato, backend già pronto.
5. Prossimo appuntamento su card — isolato, solo query + UI.
6. Filtro data dashboard — isolato, solo dashboard.
7. Riordino Note/Appuntamenti — un minuto, in qualunque momento.

Ogni punto è testabile e mergiabile indipendentemente (isolamento tenant + RBAC verificati per ciascuno, coerente con `docs/00`).
