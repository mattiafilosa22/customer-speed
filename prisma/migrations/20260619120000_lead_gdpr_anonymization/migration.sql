-- Fase 8 — GDPR erasure (right to be forgotten, docs/06 §6.5).
-- Adds an irreversible anonymization marker to Lead. When set, the lead's
-- personal data has been anonymized on the data subject's request while the
-- (now anonymous) row survives for historical aggregates and the legal
-- retention of any linked invoices. See src/server/privacy.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
