import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { applyTenantScope, TENANT_SCOPED_MODELS } from "@/lib/prisma-tenant";

const ORG = "org_A";

/**
 * These tests guard the tenant-isolation INVARIANTS without a DB:
 *  - every domain (tenant-scoped) model is present in the allow-list, so a
 *    forgotten model can never silently bypass the organizationId filter.
 *
 * The actual query injection (where / data / soft-delete) is covered by an
 * integration test that runs `$allOperations` through a fake query function.
 */

// Models that legitimately are NOT tenant-scoped by an organizationId column:
//  - Organization: the tenant root itself.
//  - EmailVerificationToken / PasswordResetToken: scoped to a User (cascade),
//    looked up by their unique tokenHash; never enumerated cross-tenant.
const NON_TENANT_SCOPED: ReadonlySet<string> = new Set<Prisma.ModelName>([
  "Organization",
  "EmailVerificationToken",
  "PasswordResetToken",
]);

describe("TENANT_SCOPED_MODELS allow-list", () => {
  it("covers EVERY domain model (forgetting one fails this test)", () => {
    const allModels = Object.values(Prisma.ModelName) as Prisma.ModelName[];
    const shouldBeScoped = allModels.filter((m) => !NON_TENANT_SCOPED.has(m));

    const scoped = new Set<string>(TENANT_SCOPED_MODELS);
    const missing = shouldBeScoped.filter((m) => !scoped.has(m));

    expect(
      missing,
      `These models carry organizationId but are NOT in TENANT_SCOPED_MODELS: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("does not list non-tenant-scoped models", () => {
    const scoped = new Set<string>(TENANT_SCOPED_MODELS);
    for (const m of NON_TENANT_SCOPED) {
      expect(scoped.has(m), `${m} must not be tenant-scoped`).toBe(false);
    }
  });
});

describe("applyTenantScope (isolation logic)", () => {
  it("injects organizationId into where on reads", () => {
    const out = applyTenantScope("Lead", "findMany", { where: { stage: "WON" } }, ORG);
    expect(out.where).toMatchObject({ stage: "WON", organizationId: ORG });
  });

  it("forces organizationId into create data (cannot write for another tenant)", () => {
    const out = applyTenantScope(
      "Lead",
      "create",
      { data: { firstName: "A", organizationId: "org_EVIL" } },
      ORG,
    );
    expect((out.data as Record<string, unknown>).organizationId).toBe(ORG);
  });

  it("forces organizationId on every row of createMany", () => {
    const out = applyTenantScope(
      "Note",
      "createMany",
      { data: [{ body: "x" }, { body: "y" }] },
      ORG,
    );
    for (const row of out.data as Array<Record<string, unknown>>) {
      expect(row.organizationId).toBe(ORG);
    }
  });

  it("scopes upsert: where + create + organizationId", () => {
    const out = applyTenantScope(
      "LeadSource",
      "upsert",
      { where: { id: "x" }, create: { label: "Funnel" }, update: { label: "Funnel" } },
      ORG,
    );
    expect((out.where as Record<string, unknown>).organizationId).toBe(ORG);
    expect((out.create as Record<string, unknown>).organizationId).toBe(ORG);
  });

  it("excludes soft-deleted Leads on reads by default", () => {
    const out = applyTenantScope("Lead", "findMany", {}, ORG);
    expect((out.where as Record<string, unknown>).deletedAt).toBeNull();
  });

  it("respects an explicit deletedAt filter (does not override)", () => {
    const out = applyTenantScope("Lead", "findMany", { where: { deletedAt: { not: null } } }, ORG);
    expect((out.where as Record<string, unknown>).deletedAt).toEqual({ not: null });
  });

  it("includes soft-deleted Leads when opted out (erasure/admin)", () => {
    const out = applyTenantScope("Lead", "findMany", {}, ORG, true);
    expect((out.where as Record<string, unknown>).deletedAt).toBeUndefined();
  });

  it("does NOT apply soft-delete filter on mutations", () => {
    const out = applyTenantScope("Lead", "update", { where: { id: "x" } }, ORG);
    expect((out.where as Record<string, unknown>).deletedAt).toBeUndefined();
  });

  it("leaves non-tenant-scoped models untouched", () => {
    const input = { where: { slug: "acme" } };
    const out = applyTenantScope("Organization", "findUnique", input, ORG);
    expect(out).toEqual(input);
    expect((out.where as Record<string, unknown>).organizationId).toBeUndefined();
  });
});
