-- Enable Row-Level Security on all public tables.
--
-- WHY: Supabase auto-exposes a PostgREST API over the `public` schema reachable
-- with the project URL + anon key. Without RLS, that API grants anyone full
-- read/write/delete on every table (Supabase advisor: `rls_disabled_in_public`).
--
-- HOW: We enable RLS WITHOUT adding any policy. RLS is deny-by-default, so the
-- `anon` / `authenticated` PostgREST roles lose all access. The application is
-- unaffected: it connects via Prisma as the table-owner role (`postgres`), and
-- table owners bypass RLS (we deliberately do NOT use FORCE ROW LEVEL SECURITY).
-- Tenant isolation continues to be enforced at the application layer by the
-- Prisma client extension (src/lib/prisma-tenant.ts); this migration only closes
-- the Supabase public-API hole. `ENABLE ROW LEVEL SECURITY` is idempotent.

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StageHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalCrmRef" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LossReason" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipelineStageConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CalendarConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- Prisma's own migration-bookkeeping table is created by the migrate engine
-- (not by a migration), so guard it. Owners still bypass RLS here too.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;
