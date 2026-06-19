-- Fase 6 — Integrazioni calendario.
-- Idempotenza forte del sync provider esterno: un evento esterno
-- (provider + externalEventId) mappa ad UN solo Appointment per tenant.
-- In Postgres i valori NULL sono distinti in un indice UNIQUE, quindi gli
-- appuntamenti manuali (externalEventId = NULL) NON sono vincolati e possono
-- coesistere liberamente. Sostituisce l'indice non-unique creato in init.

-- DropIndex
DROP INDEX "Appointment_organizationId_provider_externalEventId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_organizationId_provider_externalEventId_key" ON "Appointment"("organizationId", "provider", "externalEventId");
