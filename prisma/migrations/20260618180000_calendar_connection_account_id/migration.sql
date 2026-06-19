-- Fase 6 — Integrazioni calendario.
-- CalendarConnection: aggiunta `providerAccountId` (id stabile dell'account
-- presso il provider) per mappare in modo SICURO un webhook in ingresso alla
-- connessione che lo possiede (e quindi al tenant), senza fidarsi del payload.
-- Aggiunto anche `updatedAt` per tracciare il refresh dei token.

-- AlterTable
ALTER TABLE "CalendarConnection" ADD COLUMN "providerAccountId" TEXT;
ALTER TABLE "CalendarConnection" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "CalendarConnection_provider_providerAccountId_idx" ON "CalendarConnection"("provider", "providerAccountId");
