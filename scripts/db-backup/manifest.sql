-- Backup manifest: what a restore of schema `public` must reproduce exactly.
-- Run with: psql -X -A -t -q -v ON_ERROR_STOP=1  (one line per fact, pipe-separated)
-- Used on the SOURCE (inside the pg_dump snapshot) and on the RESTORED copy;
-- the caller sorts both outputs (LC_ALL=C) and diffs them.

-- Make every text rendering independent of server/session defaults.
SET TimeZone = 'UTC';
SET DateStyle = 'ISO, YMD';
SET IntervalStyle = 'postgres';
SET extra_float_digits = 3;
SET bytea_output = 'hex';

-- rows|<table>|<count>|<md5 of the sorted per-row md5s>  (content, not just counts)
SELECT format(
  'SELECT %L || ''|'' || count(*) || ''|'' || md5(coalesce(string_agg(md5(t::text), '''' ORDER BY md5(t::text) COLLATE "C"), '''')) FROM public.%I t',
  'rows|' || c.relname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname COLLATE "C"
\gexec

-- rls|<table>|<enabled>|<forced>
SELECT 'rls|' || c.relname || '|' || c.relrowsecurity || '|' || c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

-- owner|<relation>|<kind>|<owner>
SELECT 'owner|' || c.relname || '|' || c.relkind::text || '|' || pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f');

-- policy|<table>|<name>|<permissive>|<roles, sorted>|<cmd>|<using>|<with check>
SELECT 'policy|' || tablename || '|' || policyname || '|' || permissive || '|'
  || array_to_string(ARRAY(SELECT r FROM unnest(roles) r ORDER BY r COLLATE "C"), ',') || '|' || cmd
  || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
FROM pg_policies WHERE schemaname = 'public';

-- grant|<relation>|<grantee>|<privilege>|<grantable>|<grantor>  (tables, views, sequences)
SELECT 'grant|' || c.relname || '|'
  || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || '|'
  || a.privilege_type || '|' || a.is_grantable || '|' || pg_get_userbyid(a.grantor)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(c.relacl) a
WHERE n.nspname = 'public' AND c.relacl IS NOT NULL;

-- schemagrant|<grantee>|<privilege>|<grantable>
SELECT 'schemagrant|' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
  || '|' || a.privilege_type || '|' || a.is_grantable
FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'public';

-- migration|<name>  (applied Prisma migrations, if the table exists)
SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'SELECT NULL WHERE false'
  ELSE 'SELECT ''migration|'' || migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL' END
\gexec
