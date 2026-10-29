import { describe, expect, it } from "vitest";

import {
  checkAppRoleUnaffectedByRls,
  checkRlsEnabledEverywhere,
  decideMigrations,
  type AppRole,
  type DatabaseInspector,
  type TableSecurity,
} from "@/lib/release-db-checks";

const OWNER: AppRole = { name: "postgres", superuser: false, bypassRls: false };

function inspector(
  role: AppRole,
  tables: TableSecurity[],
  probeErrors: Record<string, string> = {},
): DatabaseInspector & { probed: string[] } {
  const probed: string[] = [];
  return {
    probed,
    appRole: async () => role,
    tables: async () => tables,
    probeUnfiltered: async (table) => {
      probed.push(table);
      return probeErrors[table] ?? null;
    },
  };
}

const table = (name: string, overrides: Partial<TableSecurity> = {}): TableSecurity => ({
  table: name,
  rlsEnabled: true,
  ownedByAppRole: true,
  ...overrides,
});

describe("checkAppRoleUnaffectedByRls", () => {
  it("passes when the app role owns every table and reads them unfiltered", async () => {
    const db = inspector(OWNER, [table("Lead"), table("ChatActivityDay", { rlsEnabled: false })]);
    await expect(checkAppRoleUnaffectedByRls(db, { requireTables: true })).resolves.toEqual({ ok: true, problems: [] });
    expect(db.probed).toEqual(["Lead", "ChatActivityDay"]);
  });

  it("fails a role that neither owns a table nor bypasses RLS, before any migration enables it", async () => {
    const db = inspector({ name: "app_rw", superuser: false, bypassRls: false }, [
      table("Lead"),
      table("ChatActivityDay", { rlsEnabled: false, ownedByAppRole: false }),
    ]);
    const result = await checkAppRoleUnaffectedByRls(db, { requireTables: true });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.stringContaining('"app_rw" neither owns "ChatActivityDay"')]);
  });

  it("accepts a non-owner role with BYPASSRLS", async () => {
    const db = inspector({ name: "service", superuser: false, bypassRls: true }, [table("Lead", { ownedByAppRole: false })]);
    await expect(checkAppRoleUnaffectedByRls(db, { requireTables: true })).resolves.toMatchObject({ ok: true });
  });

  it("reports what the database itself refuses, even when the catalog looks fine", async () => {
    const db = inspector(OWNER, [table("Lead")], { Lead: "permission denied for table Lead" });
    const result = await checkAppRoleUnaffectedByRls(db, { requireTables: true });
    expect(result.problems).toEqual([expect.stringContaining("permission denied for table Lead")]);
  });

  it("lets the first deploy through on an empty database, but not a post-check", async () => {
    const db = inspector(OWNER, []);
    await expect(checkAppRoleUnaffectedByRls(db, { requireTables: false })).resolves.toEqual({ ok: true, problems: [] });
    await expect(checkAppRoleUnaffectedByRls(db, { requireTables: true })).resolves.toMatchObject({ ok: false });
  });

  it("ignores Prisma's bookkeeping table and refuses an empty schema", async () => {
    const db = inspector(OWNER, [table("_prisma_migrations", { ownedByAppRole: false })]);
    const result = await checkAppRoleUnaffectedByRls(db, { requireTables: true });
    expect(db.probed).toEqual([]);
    expect(result.problems).toEqual([expect.stringContaining("No tables found")]);
  });
});

describe("checkRlsEnabledEverywhere", () => {
  it("names every public table exposed without RLS, Prisma's table included", async () => {
    const db = inspector(OWNER, [
      table("Lead"),
      table("ChatActivityDay", { rlsEnabled: false }),
      table("_prisma_migrations", { rlsEnabled: false }),
    ]);
    const result = await checkRlsEnabledEverywhere(db);
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain('"ChatActivityDay"');
  });

  it("passes when every table has RLS", async () => {
    await expect(checkRlsEnabledEverywhere(inspector(OWNER, [table("Lead")]))).resolves.toEqual({ ok: true, problems: [] });
  });
});

describe("decideMigrations", () => {
  it("migrates production and non-Vercel runs (CI, manual)", () => {
    expect(decideMigrations({ VERCEL_ENV: "production" }).apply).toBe(true);
    expect(decideMigrations({}).apply).toBe(true);
  });

  it("never migrates a preview unless it declares its own database", () => {
    expect(decideMigrations({ VERCEL_ENV: "preview" }).apply).toBe(false);
    expect(decideMigrations({ VERCEL_ENV: "development" }).apply).toBe(false);
    expect(decideMigrations({ VERCEL_ENV: "preview", ALLOW_PREVIEW_MIGRATIONS: "1" }).apply).toBe(false);
    expect(decideMigrations({ VERCEL_ENV: "preview", ALLOW_PREVIEW_MIGRATIONS: "true" }).apply).toBe(true);
  });
});
