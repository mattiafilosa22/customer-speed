/**
 * Release-time database safety checks (run by `scripts/release-db.ts` inside
 * `vercel-build`, around `prisma migrate deploy`).
 *
 * Two invariants must hold for a release to be safe:
 *
 *  1. The APP role (the user in DATABASE_URL, what Prisma runs as at runtime)
 *     is never filtered by Row-Level Security. RLS is deny-by-default and the
 *     app relies on being the table owner (or BYPASSRLS) — if it is not, a
 *     migration that enables RLS would make every write fail. Checked BEFORE
 *     migrating (so nothing is applied) and again AFTER.
 *  2. Every table in `public` has RLS enabled, so Supabase's public PostgREST
 *     API (anon key) cannot read or write it — the `rls_disabled_in_public`
 *     advisor lint, enforced on every deploy. Checked AFTER migrating.
 *
 * Pure logic only: the queries are injected, so this is unit-testable without
 * a database. No business logic, no env access.
 */

/** Prisma's bookkeeping table: has RLS, but the app never reads it. */
export const PRISMA_MIGRATIONS_TABLE = "_prisma_migrations";

export interface TableSecurity {
  readonly table: string;
  readonly rlsEnabled: boolean;
  /** The app role owns the table (directly or via an inherited role). */
  readonly ownedByAppRole: boolean;
}

export interface AppRole {
  readonly name: string;
  readonly superuser: boolean;
  readonly bypassRls: boolean;
}

export interface DatabaseInspector {
  appRole(): Promise<AppRole>;
  tables(): Promise<readonly TableSecurity[]>;
  /**
   * Reads one row of `table` with `row_security = off`: Postgres then RAISES
   * instead of silently filtering whenever RLS would apply to the role, so a
   * success proves the app sees every row. Returns the error message, or null.
   */
  probeUnfiltered(table: string): Promise<string | null>;
}

export interface CheckReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

const report = (problems: string[]): CheckReport => ({ ok: problems.length === 0, problems });

/**
 * Invariant 1: RLS can never hide rows from (or block writes by) the app.
 * `requireTables`: after migrating the schema cannot be empty; before the very
 * first deploy (or in CI) it legitimately is.
 */
export async function checkAppRoleUnaffectedByRls(
  db: DatabaseInspector,
  { requireTables }: { requireTables: boolean },
): Promise<CheckReport> {
  const role = await db.appRole();
  const tables = (await db.tables()).filter((entry) => entry.table !== PRISMA_MIGRATIONS_TABLE);
  const problems: string[] = [];

  if (requireTables && tables.length === 0) problems.push("No tables found in schema public: is DATABASE_URL pointing at the right database?");

  const exemptByRole = role.superuser || role.bypassRls;
  for (const entry of tables) {
    if (!exemptByRole && !entry.ownedByAppRole) {
      problems.push(
        `App role "${role.name}" neither owns "${entry.table}" nor has BYPASSRLS: with RLS enabled its queries would be filtered and its writes rejected.`,
      );
      continue;
    }
    const error = await db.probeUnfiltered(entry.table);
    if (error) problems.push(`App role "${role.name}" cannot read "${entry.table}" unfiltered: ${error}`);
  }
  return report(problems);
}

/** Invariant 2: nothing in `public` is exposed to Supabase's anon API. */
export async function checkRlsEnabledEverywhere(db: DatabaseInspector): Promise<CheckReport> {
  const exposed = (await db.tables()).filter((entry) => !entry.rlsEnabled).map((entry) => entry.table);
  return report(
    exposed.map(
      (table) => `Table "${table}" has Row-Level Security disabled: Supabase's public API (anon key) can read and write it.`,
    ),
  );
}

export interface MigrationDecision {
  readonly apply: boolean;
  readonly reason: string;
}

/**
 * Production (and any non-Vercel run, e.g. CI) migrates. Vercel previews only
 * migrate when explicitly told they have their own database: by default a
 * preview must never alter whatever database its env points at (possibly prod).
 */
export function decideMigrations(env: { readonly [key: string]: string | undefined }): MigrationDecision {
  const target = env.VERCEL_ENV;
  if (target === undefined || target === "production") {
    return { apply: true, reason: target ? "Vercel production deployment" : "not a Vercel build" };
  }
  if (env.ALLOW_PREVIEW_MIGRATIONS === "true") {
    return { apply: true, reason: `Vercel ${target} deployment with ALLOW_PREVIEW_MIGRATIONS=true (dedicated database)` };
  }
  return {
    apply: false,
    reason: `Vercel ${target} deployment: skipping migrations and DB checks (set ALLOW_PREVIEW_MIGRATIONS=true only if this environment has its own database)`,
  };
}
