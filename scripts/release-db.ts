/**
 * Database step of a release, run by `vercel-build` before `next build`:
 *
 *   preflight (app role unaffected by RLS) → prisma migrate deploy
 *   → post-checks (app role still unaffected + RLS on every public table)
 *
 * Any failure exits non-zero, which fails the Vercel build: the previous
 * deployment keeps serving traffic. The preflight runs BEFORE any migration,
 * so a misconfigured role stops the release with nothing applied.
 *
 * Checks connect with the RUNTIME url (`DATABASE_URL`, through the same pooler
 * rewrite as the app), so they test the exact role the app queries with;
 * `prisma migrate deploy` keeps using DIRECT_URL/DATABASE_URL as before.
 *
 * Usage: pnpm db:release   (CI and vercel-build)
 */
import "dotenv/config";

import { spawnSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { resolveRuntimeDatabaseUrl } from "../src/lib/database-url";
import {
  checkAppRoleUnaffectedByRls,
  checkRlsEnabledEverywhere,
  decideMigrations,
  type CheckReport,
  type DatabaseInspector,
} from "../src/lib/release-db-checks";

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

function prismaInspector(prisma: PrismaClient): DatabaseInspector {
  return {
    async appRole() {
      const [row] = await prisma.$queryRaw<{ name: string; superuser: boolean; bypassRls: boolean }[]>`
        SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS "bypassRls"
        FROM pg_roles WHERE rolname = current_user`;
      if (!row) throw new Error("current_user not found in pg_roles");
      return row;
    },
    tables() {
      return prisma.$queryRaw<{ table: string; rlsEnabled: boolean; ownedByAppRole: boolean }[]>`
        SELECT c.relname AS "table",
               c.relrowsecurity AS "rlsEnabled",
               pg_has_role(current_user, c.relowner, 'USAGE') AS "ownedByAppRole"
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        ORDER BY c.relname`;
    },
    async probeUnfiltered(table) {
      try {
        // SET LOCAL keeps it inside the transaction (safe with a transaction pooler).
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL row_security = off");
          await tx.$queryRawUnsafe(`SELECT 1 FROM public.${quoteIdent(table)} LIMIT 1`);
        });
        return null;
      } catch (error) {
        return error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) ?? error.message : String(error);
      }
    },
  };
}

function print(title: string, result: CheckReport) {
  if (result.ok) {
    console.info(`✔ ${title}`);
    return;
  }
  console.error(`✖ ${title}`);
  for (const problem of result.problems) console.error(`  - ${problem}`);
}

async function main(): Promise<number> {
  const decision = decideMigrations(process.env);
  console.info(`[release-db] ${decision.reason}`);
  if (!decision.apply) return 0;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error("[release-db] DATABASE_URL is required.");
    return 1;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: resolveRuntimeDatabaseUrl(databaseUrl), max: 1 }) });
  const db = prismaInspector(prisma);
  try {
    const preflight = await checkAppRoleUnaffectedByRls(db, { requireTables: false });
    print("Preflight: the app role is not subject to Row-Level Security", preflight);
    if (!preflight.ok) {
      console.error("[release-db] Aborting BEFORE migrating: nothing was applied.");
      return 1;
    }

    const migrate = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit" });
    if (migrate.status !== 0) {
      console.error("[release-db] prisma migrate deploy failed.");
      return 1;
    }

    const appRole = await checkAppRoleUnaffectedByRls(db, { requireTables: true });
    const rls = await checkRlsEnabledEverywhere(db);
    print("Post-check: the app role still reads every table unfiltered", appRole);
    print("Post-check: Row-Level Security is enabled on every public table", rls);
    return appRole.ok && rls.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("[release-db] Unexpected failure:", error);
    process.exit(1);
  },
);
