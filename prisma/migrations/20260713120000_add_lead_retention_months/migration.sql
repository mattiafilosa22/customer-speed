-- AlterTable
-- Data retention lead persi (contenimento spazio DB, piano free Supabase 500MB).
-- null = retention disattivata per il tenant (default per i tenant esistenti,
-- opt-in esplicito come per gli altri feature flag per-tenant).
ALTER TABLE "Organization" ADD COLUMN     "leadRetentionMonths" INTEGER;
