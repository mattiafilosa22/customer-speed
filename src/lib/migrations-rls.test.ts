// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard against the `rls_disabled_in_public` regression: Supabase exposes every
 * `public` table through PostgREST with the anon key, so a table created by a
 * migration without RLS is publicly readable AND writable. `ChatActivityDay`
 * slipped through exactly this way (created after the one-off RLS migration).
 *
 * Rule: every `CREATE TABLE` must be followed — in the same or a later
 * migration — by `ALTER TABLE "<name>" ENABLE ROW LEVEL SECURITY`.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../prisma/migrations");

function readMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }));
}

function matchAll(sql: string, pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map((match) => match[1]!);
}

const CREATE_TABLE = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi;
const ENABLE_RLS = /ALTER TABLE\s+"([^"]+)"\s+ENABLE ROW LEVEL SECURITY/gi;

describe("Prisma migrations", () => {
  it("enable Row-Level Security on every table they create", () => {
    const createdAt = new Map<string, number>();
    const rlsEnabledAt = new Map<string, number>();

    readMigrations().forEach(({ sql }, index) => {
      for (const table of matchAll(sql, CREATE_TABLE)) createdAt.set(table, index);
      for (const table of matchAll(sql, ENABLE_RLS)) rlsEnabledAt.set(table, index);
    });

    const unprotected = [...createdAt].filter(([table, created]) => {
      const enabled = rlsEnabledAt.get(table);
      return enabled === undefined || enabled < created;
    });

    expect(createdAt.size).toBeGreaterThan(0);
    expect(unprotected.map(([table]) => table)).toEqual([]);
  });
});
