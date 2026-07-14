-- AlterEnum
-- Nuovi stage pipeline: "Seconda call" (dopo la call presentazione) e
-- "Stand by" (parcheggio prima della decisione finale). Solo aggiunta di
-- valori, nessun valore esistente rimosso/rinominato — additivo e sicuro sui
-- dati esistenti.
ALTER TYPE "LeadStage" ADD VALUE 'PRESENTATION_CALL_2';
ALTER TYPE "LeadStage" ADD VALUE 'STANDBY';

-- AlterTable
-- Motivo di perdita PERSONALIZZATO (testo libero, alternativa a lossReasonId
-- quando l'utente sceglie "Altro"). Mutuamente esclusivo con lossReasonId —
-- validato in changeStageSchema, non a livello DB.
ALTER TABLE "Lead" ADD COLUMN "lossReasonCustomText" VARCHAR(500);

-- AlterTable
-- LossReason diventa gestibile da Settings come LeadSource/PipelineStageConfig:
-- isActive per disattivare senza perdere lo storico sui lead già persi con
-- quel motivo, sortOrder per l'ordinamento nel picker.
ALTER TABLE "LossReason" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LossReason" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LossReason_organizationId_sortOrder_idx" ON "LossReason"("organizationId", "sortOrder");
