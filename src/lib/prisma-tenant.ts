import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenant";

/**
 * Tenant isolation at the DATA layer.
 *
 * This is the primary barrier of the multi-tenant model (single-DB, row-level
 * isolation). A Prisma Client extension injects the `organizationId` filter
 * automatically, so an application bug (a forgotten `where`) cannot leak data
 * across tenants. RLS PostgreSQL is recommended as a SECOND barrier (see note
 * at the bottom) but is not required to ship Fase 0.
 *
 * Strategy:
 *  - READ operations (find*, count, aggregate, groupBy, update*, delete*):
 *    merge `organizationId` into `args.where` (AND-combined with caller filters).
 *  - WRITE operations (create, createMany, upsert): force `organizationId` into
 *    the written data so a row can never be created for the wrong tenant.
 *  - Non-tenant-scoped models (e.g. `Organization` itself) are passed through
 *    untouched.
 *
 * ── Status (Fase 1) ─────────────────────────────────────────────────────────
 * Fully wired:
 *   1. `TenantContext` is built from the Auth.js session (`getTenantContext()`).
 *   2. `getTenantPrisma(ctx)` returns the per-request tenant client used for ALL
 *      domain access (see `getTenantPrismaFromContext()` in `src/lib/tenant.ts`).
 *   3. The `superAdmin` path uses the base `prisma` from the audited `(admin)/`
 *      context — never this extension.
 *   4. Soft-delete default filter (`deletedAt: null`) is applied on `Lead` reads,
 *      with an explicit opt-out for erasure/admin flows (`includeSoftDeleted`).
 */

/**
 * Models that carry `organizationId` and must always be tenant-scoped.
 * Kept as an explicit allow-list (not derived) so adding a new domain model is a
 * conscious decision: forget to add it here and isolation would silently not
 * apply, so this list is asserted in tests.
 */
export const TENANT_SCOPED_MODELS = [
  "User",
  "Lead",
  "StageHistory",
  "Note",
  "Appointment",
  "Invoice",
  "ExternalCrmRef",
  "LossReason",
  "LeadSource",
  "PipelineStageConfig",
  "CalendarConnection",
  "Consent",
  "AuditLog",
] as const satisfies readonly Prisma.ModelName[];

type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const TENANT_SCOPED_MODEL_SET: ReadonlySet<string> = new Set(TENANT_SCOPED_MODELS);

function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
  return model !== undefined && TENANT_SCOPED_MODEL_SET.has(model);
}

/** Operations whose `args.where` we must constrain to the tenant. */
const WHERE_OPERATIONS: ReadonlySet<string> = new Set<Prisma.PrismaAction>([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
  "upsert",
]);

/** Operations whose written `data` must carry the tenant id. */
const CREATE_DATA_OPERATIONS: ReadonlySet<string> = new Set<Prisma.PrismaAction>([
  "create",
  "createMany",
  "upsert",
]);

/**
 * READ operations on which we apply the default soft-delete filter. Mutations
 * (update/delete/upsert) are intentionally excluded so the app can still touch a
 * soft-deleted row (e.g. to restore or to hard-erase it).
 */
const READ_OPERATIONS: ReadonlySet<string> = new Set<Prisma.PrismaAction>([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Models with a `deletedAt` soft-delete column. Reads exclude soft-deleted rows
 * by default; mutations and the explicit `includeSoftDeleted` opt-out bypass it.
 */
const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set<Prisma.ModelName>(["Lead"]);

function injectSoftDeleteFilter(args: AnyArgs): AnyArgs {
  const existingWhere = (args.where as AnyArgs | undefined) ?? {};
  // Only default when the caller hasn't expressed an opinion on `deletedAt`,
  // so an explicit `{ deletedAt: { not: null } }` still works.
  if ("deletedAt" in existingWhere) {
    return args;
  }
  return {
    ...args,
    where: { ...existingWhere, deletedAt: null },
  };
}

type AnyArgs = Record<string, unknown>;

function injectWhere(args: AnyArgs, organizationId: string): AnyArgs {
  const existingWhere = (args.where as AnyArgs | undefined) ?? {};
  return {
    ...args,
    where: { ...existingWhere, organizationId },
  };
}

function injectCreateData(args: AnyArgs, organizationId: string): AnyArgs {
  const next: AnyArgs = { ...args };

  // create / upsert.create: single object
  if (next.data && !Array.isArray(next.data)) {
    next.data = { ...(next.data as AnyArgs), organizationId };
  }
  // createMany: array of objects
  if (Array.isArray(next.data)) {
    next.data = (next.data as AnyArgs[]).map((row) => ({ ...row, organizationId }));
  }
  // upsert also writes on update + filters on where
  if (next.update && !Array.isArray(next.update)) {
    next.update = { ...(next.update as AnyArgs) };
  }
  if (next.create && !Array.isArray(next.create)) {
    next.create = { ...(next.create as AnyArgs), organizationId };
  }
  return next;
}

export interface TenantPrismaOptions {
  /**
   * Opt-out of the default soft-delete filter (`deletedAt: null`) on reads.
   * Only for erasure (GDPR right-to-be-forgotten) and admin/restore flows that
   * must see soft-deleted rows. Off by default.
   */
  readonly includeSoftDeleted?: boolean;
}

/**
 * Pure transform: given a model/operation/args, return the args the tenant
 * client would actually run. Extracted so the isolation logic is unit-testable
 * without a DB connection. Non-tenant-scoped models pass through unchanged.
 */
export function applyTenantScope(
  model: string | undefined,
  operation: string,
  args: unknown,
  organizationId: string,
  includeSoftDeleted = false,
): AnyArgs {
  const baseArgs = (args ?? {}) as AnyArgs;
  if (!isTenantScopedModel(model)) {
    return baseArgs;
  }

  let nextArgs = baseArgs;
  if (WHERE_OPERATIONS.has(operation)) {
    nextArgs = injectWhere(nextArgs, organizationId);
  }
  if (CREATE_DATA_OPERATIONS.has(operation)) {
    nextArgs = injectCreateData(nextArgs, organizationId);
  }
  if (!includeSoftDeleted && SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation)) {
    nextArgs = injectSoftDeleteFilter(nextArgs);
  }
  return nextArgs;
}

/**
 * Returns a tenant-bound PrismaClient. Use this — not the base `prisma` — for
 * every request handled in a normal (non-superAdmin) tenant context.
 *
 * It enforces two invariants on every tenant-scoped model:
 *  - the `organizationId` filter / value (cross-tenant isolation), and
 *  - the soft-delete default (`deletedAt: null`) on reads of soft-deletable
 *    models, unless `includeSoftDeleted` is set.
 */
export function getTenantPrisma(ctx: TenantContext, options: TenantPrismaOptions = {}) {
  const { organizationId } = ctx;
  const includeSoftDeleted = options.includeSoftDeleted ?? false;

  return prisma.$extends(
    Prisma.defineExtension({
      name: `tenant(${organizationId})${includeSoftDeleted ? "+deleted" : ""}`,
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            const nextArgs = applyTenantScope(
              model,
              operation,
              args,
              organizationId,
              includeSoftDeleted,
            );
            return query(nextArgs);
          },
        },
      },
    }),
  );
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>;

/*
 * ── Second barrier: PostgreSQL Row Level Security (RLS) — recommended ────────
 * The extension above lives in app code; RLS enforces isolation in the database
 * even if a query bypasses Prisma. Suggested approach (Fase 1+):
 *   1. ALTER TABLE "<each tenant table>" ENABLE ROW LEVEL SECURITY;
 *   2. CREATE POLICY tenant_isolation ON "<table>"
 *        USING ("organizationId" = current_setting('app.current_org', true));
 *   3. set the GUC per request inside a transaction:
 *        SELECT set_config('app.current_org', $orgId, true);
 *   4. run the app with a DB role that is NOT BYPASSRLS.
 * Migrations/seed and the superAdmin context use a privileged role / bypass GUC.
 */
