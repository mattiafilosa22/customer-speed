-- Synthetic test on the RESTORED copy (run as superuser, ON_ERROR_STOP=1).
-- Every assertion RAISEs, so any violation makes psql exit non-zero.

DO $$
DECLARE
  tables int;
BEGIN
  SELECT count(*) INTO tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
  IF tables = 0 THEN
    RAISE EXCEPTION 'synthetic: the restored schema public has no tables';
  END IF;
END $$;

-- The restored copy must be as locked down as production: RLS on every table.
DO $$
DECLARE
  exposed text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO exposed
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'synthetic: Row-Level Security disabled on: %', exposed;
  END IF;
END $$;

-- Supabase's public API roles must not see a single row of any table.
DO $$
DECLARE
  api_role text;
  rel record;
  visible bigint;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    FOR rel IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', api_role);
        EXECUTE format('SELECT count(*) FROM public.%I', rel.relname) INTO visible;
        RESET ROLE;
        IF visible > 0 THEN
          RAISE EXCEPTION 'synthetic: role % can read % row(s) of %', api_role, visible, rel.relname;
        END IF;
      EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE; -- denied outright: exactly what we want
      END;
    END LOOP;
  END LOOP;
END $$;

-- The schema history restored completely: no failed or half-applied migration.
DO $$
DECLARE
  applied int;
  broken int;
BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'synthetic: _prisma_migrations is missing';
  END IF;
  EXECUTE 'SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
                  count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)
           FROM public._prisma_migrations' INTO applied, broken;
  IF applied = 0 OR broken > 0 THEN
    RAISE EXCEPTION 'synthetic: % applied / % unfinished migrations', applied, broken;
  END IF;
END $$;
