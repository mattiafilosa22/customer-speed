import { describe, expect, it } from "vitest";

import { resolveMigrationDatabaseUrl, resolveRuntimeDatabaseUrl } from "@/lib/database-url";

describe("resolveRuntimeDatabaseUrl", () => {
  it("routes a Supabase session-pooler URL through transaction mode", () => {
    expect(
      resolveRuntimeDatabaseUrl(
        "postgresql://postgres.project:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?schema=public",
      ),
    ).toBe(
      "postgresql://postgres.project:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?schema=public&pgbouncer=true",
    );
  });

  it("leaves local and non-Supabase database URLs unchanged", () => {
    const localUrl = "postgresql://customerspeed:customerspeed@localhost:5544/customerspeed";

    expect(resolveRuntimeDatabaseUrl(localUrl)).toBe(localUrl);
  });
});

describe("resolveMigrationDatabaseUrl", () => {
  it("uses the session/direct URL for migrations when it is configured", () => {
    expect(
      resolveMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://runtime.example:6543/postgres",
        DIRECT_URL: "postgresql://migrations.example:5432/postgres",
      }),
    ).toBe("postgresql://migrations.example:5432/postgres");
  });

  it("falls back to DATABASE_URL for local development", () => {
    expect(
      resolveMigrationDatabaseUrl({
        DATABASE_URL: "postgresql://localhost:5544/customerspeed",
      }),
    ).toBe("postgresql://localhost:5544/customerspeed");
  });

  it("rejects configuration without either database URL", () => {
    expect(() => resolveMigrationDatabaseUrl({})).toThrowError(/DATABASE_URL/);
  });
});
