-- Enable Row-Level Security on "ChatActivityDay".
--
-- WHY: the table was created by 20260910150541_insight_stats, AFTER the
-- one-off hardening in 20260630120000_enable_rls_public_tables, so it shipped
-- with RLS disabled. Supabase exposes every `public` table through PostgREST
-- (project URL + anon key) and grants `anon` / `authenticated` full privileges
-- on new tables, so anyone holding the public anon key could read, insert,
-- update and delete every tenant's Insight & Stats counters (Supabase advisor:
-- `rls_disabled_in_public`).
--
-- HOW (same model as 20260630120000_enable_rls_public_tables):
--   1. ENABLE ROW LEVEL SECURITY → deny-by-default for every non-owner role.
--   2. On Supabase only (the roles do not exist on local/CI Postgres):
--      - REVOKE the default table privileges from `anon` / `authenticated`,
--        so the PostgREST API fails with "permission denied" instead of
--        silently returning an empty set;
--      - an explicit RESTRICTIVE deny-all policy for those roles. Restrictive
--        policies are AND-ed with permissive ones, so a permissive policy added
--        later by mistake (e.g. from the Supabase dashboard) still cannot open
--        the table to the public API.
--
-- The application is unaffected: it connects via Prisma as the table-owner role
-- (`postgres` on Supabase), and table owners bypass RLS (we deliberately do NOT
-- use FORCE ROW LEVEL SECURITY). Tenant isolation stays enforced by the Prisma
-- client extension (src/lib/prisma-tenant.ts). Every statement is idempotent.

ALTER TABLE "ChatActivityDay" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "ChatActivityDay" FROM anon, authenticated';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'ChatActivityDay'
        AND policyname = 'ChatActivityDay_deny_public_api'
    ) THEN
      EXECUTE 'CREATE POLICY "ChatActivityDay_deny_public_api" ON "ChatActivityDay"
               AS RESTRICTIVE FOR ALL TO anon, authenticated
               USING (false) WITH CHECK (false)';
    END IF;
  END IF;
END $$;
