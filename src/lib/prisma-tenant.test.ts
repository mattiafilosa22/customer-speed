import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  applyTenantScope,
  getTenantPrisma,
  rewriteOperationForTenant,
  TENANT_SCOPED_MODELS,
} from "@/lib/prisma-tenant";
import type { TenantContext } from "@/lib/tenant";

const ORG = "org_A";

/**
 * These tests guard the tenant-isolation INVARIANTS without a DB:
 *  - every domain (tenant-scoped) model is present in the allow-list, so a
 *    forgotten model can never silently bypass the organizationId filter.
 *
 * Most tests below exercise the pure, extracted `applyTenantScope` transform
 * directly (no DB, no Prisma runtime involved). The `getTenantPrisma()
 * end-to-end` block further down exercises the ACTUAL `$allOperations` hook
 * registered by `getTenantPrisma()` — including the `findUnique* → findFirst*`
 * manual-dispatch branch — against a minimal fake Prisma client, so the wiring
 * inside `getTenantPrisma()` itself (not just `applyTenantScope`) has coverage.
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

  it("injects organizationId into findUnique where on a tenant-scoped model", () => {
    // The where is scoped; the OPERATION must be rewritten too (see below), since
    // findUnique cannot accept a non-unique organizationId selector.
    const out = applyTenantScope("Lead", "findUnique", { where: { id: "lead_1" } }, ORG);
    expect(out.where).toMatchObject({ id: "lead_1", organizationId: ORG });
  });

  it("flattens a compound-unique-key where on findUnique (rewritten to findFirst, whose WhereInput can't parse the synthetic key)", () => {
    // Regression: PipelineStageConfig.findUnique({ where: { organizationId_stage:
    // { organizationId, stage } } }) used to reach Prisma as
    // `{ organizationId_stage: {...}, organizationId }` — invalid for findFirst
    // ("Unknown argument `organizationId_stage`"), breaking setStageColor /
    // updateStageVisibility for EVERY stage in production (never caught before
    // because no test exercised a compound-key findUnique).
    const out = applyTenantScope(
      "PipelineStageConfig",
      "findUnique",
      { where: { organizationId_stage: { organizationId: "org_EVIL", stage: "TAKEN" } } },
      ORG,
    );
    expect(out.where).toEqual({ organizationId: ORG, stage: "TAKEN" });
    expect(out.where).not.toHaveProperty("organizationId_stage");
  });

  it("flattens a compound-unique-key where on findUniqueOrThrow too", () => {
    const out = applyTenantScope(
      "User",
      "findUniqueOrThrow",
      { where: { organizationId_email: { organizationId: "org_EVIL", email: "a@b.test" } } },
      ORG,
    );
    expect(out.where).toEqual({ organizationId: ORG, email: "a@b.test" });
  });

  it("does NOT flatten a compound-unique-key where on update/upsert (they keep WhereUniqueInput, never rewritten)", () => {
    const out = applyTenantScope(
      "PipelineStageConfig",
      "update",
      { where: { organizationId_stage: { organizationId: ORG, stage: "TAKEN" } }, data: {} },
      ORG,
    );
    expect(out.where).toMatchObject({
      organizationId_stage: { organizationId: ORG, stage: "TAKEN" },
    });
  });

  it("REGRESSION: the injected real organizationId always wins over a stale/foreign one nested in a compound-unique wrapper, regardless of key order", () => {
    // Root-cause scenario for the ordering bug: a `where` that combines an
    // explicit top-level `organizationId` with a compound wrapper carrying a
    // DIFFERENT `organizationId` inside it. `flattenCompoundUniqueWhere` used to
    // run AFTER `injectWhere`, so its `Object.assign` could reintroduce the
    // wrapper's stale/foreign id and silently overwrite the real tenant id
    // injected by the server. Flattening now runs BEFORE injection, so
    // `injectWhere`'s own object-literal assignment is always the LAST write —
    // the real `organizationId` (ORG, passed to `applyTenantScope`) must win no
    // matter what value was already present at either level of the caller's
    // `where`.
    const out = applyTenantScope(
      "PipelineStageConfig",
      "findUnique",
      {
        where: {
          organizationId: "org_STALE",
          organizationId_stage: { organizationId: "org_EVIL", stage: "TAKEN" },
        },
      },
      ORG,
    );
    expect(out.where).toEqual({ organizationId: ORG, stage: "TAKEN" });
  });

  it("flattens a THREE-field compound-unique-key where (e.g. CalendarConnection's organizationId_provider_externalEventId)", () => {
    // `isCompoundUniqueKeyWrapper` is a structural heuristic (underscore-joined
    // key + plain-object value) never previously exercised on a 3-field
    // composite key. Verify it generalizes beyond the 2-field cases above.
    const out = applyTenantScope(
      "CalendarConnection",
      "findUnique",
      {
        where: {
          organizationId_provider_externalEventId: {
            organizationId: "org_EVIL",
            provider: "GOOGLE",
            externalEventId: "evt_123",
          },
        },
      },
      ORG,
    );
    expect(out.where).toEqual({
      organizationId: ORG,
      provider: "GOOGLE",
      externalEventId: "evt_123",
    });
    expect(out.where).not.toHaveProperty("organizationId_provider_externalEventId");
  });
});

describe("rewriteOperationForTenant (findUnique → findFirst)", () => {
  it("rewrites findUnique/findUniqueOrThrow to findFirst/findFirstOrThrow on tenant models", () => {
    // findUnique only accepts UNIQUE selectors; injecting organizationId would
    // make Prisma throw at runtime. The equivalent valid form is findFirst.
    expect(rewriteOperationForTenant("Lead", "findUnique")).toBe("findFirst");
    expect(rewriteOperationForTenant("Lead", "findUniqueOrThrow")).toBe("findFirstOrThrow");
    expect(rewriteOperationForTenant("LeadSource", "findUnique")).toBe("findFirst");
  });

  it("does NOT rewrite other operations", () => {
    expect(rewriteOperationForTenant("Lead", "findFirst")).toBe("findFirst");
    expect(rewriteOperationForTenant("Lead", "findMany")).toBe("findMany");
    expect(rewriteOperationForTenant("Lead", "update")).toBe("update");
    expect(rewriteOperationForTenant("Lead", "create")).toBe("create");
  });

  it("does NOT rewrite for non-tenant-scoped models (e.g. Organization)", () => {
    // Organization.findUnique by unique slug must stay findUnique.
    expect(rewriteOperationForTenant("Organization", "findUnique")).toBe("findUnique");
  });
});

/**
 * Fake base Prisma client + a minimal stand-in for the `$extends` runtime.
 *
 * Real `PrismaClient.$extends` is internal wiring we can't instantiate without
 * a DB connection, so this reproduces just the one behaviour `getTenantPrisma()`
 * depends on: for every `<model>.<operation>(args)` call on the EXTENDED
 * client, invoke the registered `query.$allModels.$allOperations({ model,
 * operation, args, query })` hook, where `query(finalArgs)` continues the
 * SAME operation against the base delegate — exactly like real Prisma Client
 * Extensions. `calls` records what actually reached the base delegate, so
 * assertions here exercise `getTenantPrisma()` itself (registration + the
 * findUnique*→findFirst* manual-dispatch branch), not just `applyTenantScope`.
 */
const { fakeBase, calls } = vi.hoisted(() => {
  const modelKeys = ["pipelineStageConfig", "lead"] as const;
  const calls: Array<{ model: string; operation: string; args: unknown }> = [];

  function makeRecordingDelegate(modelKey: string) {
    return new Proxy(
      {},
      {
        get(_target, operation: string) {
          return (args: unknown) => {
            calls.push({ model: modelKey, operation, args });
            return Promise.resolve({ model: modelKey, operation, args });
          };
        },
      },
    );
  }

  const base: Record<string, unknown> = {};
  for (const key of modelKeys) {
    base[key] = makeRecordingDelegate(key);
  }

  type ExtensionConfig = {
    query?: {
      $allModels?: {
        $allOperations?: (params: {
          model: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) => Promise<unknown>;
      };
    };
  };

  base.$extends = (extensionArg: ExtensionConfig | ((client: unknown) => unknown)) => {
    // Real Prisma's `Prisma.defineExtension(objectConfig)` does NOT return the
    // object itself — it returns `(client) => client.$extends(objectConfig)`
    // (see @prisma/client/runtime: `defineExtension = e => typeof e ===
    // "function" ? e : t => t.$extends(e)`), since `getTenantPrisma()` always
    // passes its config through `Prisma.defineExtension(...)`. Mirror that
    // one level of indirection here, otherwise this fake never sees the real
    // `query.$allModels.$allOperations` config and silently no-ops.
    if (typeof extensionArg === "function") {
      return extensionArg(base);
    }
    const allOperations = extensionArg.query?.$allModels?.$allOperations;
    if (!allOperations) return base;
    const extended: Record<string, unknown> = {};
    for (const key of modelKeys) {
      const modelName = key.charAt(0).toUpperCase() + key.slice(1);
      extended[key] = new Proxy(
        {},
        {
          get(_target, operation: string) {
            return (args: unknown) =>
              allOperations({
                model: modelName,
                operation,
                args,
                query: (finalArgs: unknown) => {
                  const baseFn = (
                    base[key] as Record<string, (a: unknown) => Promise<unknown>>
                  )[operation];
                  if (!baseFn) {
                    throw new Error(`fake base delegate has no "${operation}" for "${key}"`);
                  }
                  return baseFn(finalArgs);
                },
              });
          },
        },
      );
    }
    return extended;
  };

  return { fakeBase: base, calls };
});

vi.mock("@/lib/prisma", () => ({ prisma: fakeBase }));

describe("getTenantPrisma() end-to-end (real $allOperations registration, fake delegate)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("scopes + flattens a compound-key findUnique and manually redispatches it to findFirst on the base delegate", async () => {
    const ctx: TenantContext = { kind: "tenant", organizationId: ORG, userId: "user_1", role: "proUser" };

    const tenantClient = getTenantPrisma(ctx);
    await (
      tenantClient as unknown as {
        pipelineStageConfig: { findUnique: (a: unknown) => Promise<unknown> };
      }
    ).pipelineStageConfig.findUnique({
      where: { organizationId_stage: { organizationId: "org_EVIL", stage: "TAKEN" } },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: "pipelineStageConfig",
      // findUnique is manually redispatched to findFirst — never reaches the
      // base delegate as findUnique (Prisma would reject the non-unique where).
      operation: "findFirst",
    });
    expect(calls[0]?.args).toEqual({ where: { organizationId: ORG, stage: "TAKEN" } });
  });

  it("scopes a findMany via the query() continuation and applies the Lead soft-delete default", async () => {
    const ctx: TenantContext = { kind: "tenant", organizationId: ORG, userId: "user_1", role: "proUser" };

    const tenantClient = getTenantPrisma(ctx);
    await (
      tenantClient as unknown as { lead: { findMany: (a: unknown) => Promise<unknown> } }
    ).lead.findMany({ where: { stage: "WON" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: "lead", operation: "findMany" });
    expect(calls[0]?.args).toMatchObject({
      where: { stage: "WON", organizationId: ORG, deletedAt: null },
    });
  });
});
