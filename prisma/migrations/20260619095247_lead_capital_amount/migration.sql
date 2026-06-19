-- AlterTable
-- Importo esatto del capitale (€), in alternativa alla fascia (capitalBracket).
-- Decimal, mai float (docs/00 §3). La fascia resta come dato derivato dall'importo.
ALTER TABLE "Lead" ADD COLUMN     "capitalAmount" DECIMAL(14,2);
