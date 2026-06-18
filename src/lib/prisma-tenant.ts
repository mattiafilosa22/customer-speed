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
 * ── Fase 0 status ──────────────────────────────────────────────────────────
 * The mechanism is fully implemented and unit-testable. What remains for Fase 1:
 *   1. Build the `TenantContext` from the Auth.js session (`getTenantContext()`).
 *   2. Call `getTenantPrisma(ctx)` per request and use it for ALL domain access.
 *   3. Add the `superAdmin` path (use the base `prisma` from a separate, audited
 *      `(admin)/` context — never this extension).
 *   4. Soft-delete default filter (`deletedAt: null`) — see TODO below.
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

/**
 * Returns a tenant-bound PrismaClient. Use this — not the base `prisma` — for
 * every request handled in a normal (non-superAdmin) tenant context.
 */
export function getTenantPrisma(ctx: TenantContext) {
  const { organizationId } = ctx;

  return prisma.$extends(
    Prisma.defineExtension({
      name: `tenant(${organizationId})`,
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!isTenantScopedModel(model)) {
              return query(args);
            }

            let nextArgs = (args ?? {}) as AnyArgs;

            if (WHERE_OPERATIONS.has(operation)) {
              nextArgs = injectWhere(nextArgs, organizationId);
            }
            if (CREATE_DATA_OPERATIONS.has(operation)) {
              nextArgs = injectCreateData(nextArgs, organizationId);
            }

            // TODO(Fase 1): soft-delete default filter for `Lead`
            //   if (model === "Lead" && reads) nextArgs.where.deletedAt ??= null;
            //   with an explicit opt-out flag for admin/erasure flows.

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
