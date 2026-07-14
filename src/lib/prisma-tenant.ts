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

/**
 * `findUnique`/`findUniqueOrThrow` accept ONLY unique selectors in `where`, so
 * injecting a non-unique `organizationId` into them is a runtime error
 * ("Unknown argument `organizationId`"). Because the tenant filter is exactly
 * "match this id AND this org", the semantically-equivalent and valid form is
 * `findFirst`/`findFirstOrThrow`. We therefore REWRITE the operation when we
 * inject the tenant where-clause. The result is identical (a unique id can
 * match at most one row) but the query is accepted by Prisma.
 */
const FIND_UNIQUE_REWRITE: Readonly<Record<string, Prisma.PrismaAction>> = {
  findUnique: "findFirst",
  findUniqueOrThrow: "findFirstOrThrow",
};

/**
 * Given the original operation, return the operation actually executed after
 * tenant scoping. Only `findUnique*` on a tenant-scoped model is rewritten.
 */
export function rewriteOperationForTenant(model: string | undefined, operation: string): string {
  if (!isTenantScopedModel(model)) {
    return operation;
  }
  return FIND_UNIQUE_REWRITE[operation] ?? operation;
}

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

/** Prisma delegate key for a model name: first letter lowercased (`Lead`→`lead`). */
function lowerFirst(model: string): string {
  return model.length === 0 ? model : model.charAt(0).toLowerCase() + model.slice(1);
}

function injectWhere(args: AnyArgs, organizationId: string): AnyArgs {
  const existingWhere = (args.where as AnyArgs | undefined) ?? {};
  return {
    ...args,
    where: { ...existingWhere, organizationId },
  };
}

/**
 * True when `value` is Prisma's synthetic COMPOUND-unique-key wrapper — the
 * object Prisma generates for a `@@unique([a, b])` constraint, addressed as
 * `where: { a_b: { a, b } }`. Detected structurally: an underscore-joined key
 * whose value is a plain nested object. Every compound key in this schema
 * follows that exact naming convention and no scalar field name contains an
 * underscore, so this heuristic is unambiguous for this codebase.
 */
function isCompoundUniqueKeyWrapper(key: string, value: unknown): value is AnyArgs {
  return (
    key.includes("_") &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

/**
 * Flattens any Prisma compound-unique-key wrapper(s) in a `where` clause to
 * their constituent top-level fields.
 *
 * Needed ONLY for `findUnique`/`findUniqueOrThrow`: those get REWRITTEN to
 * `findFirst`/`findFirstOrThrow` once we inject the (non-unique) tenant filter
 * (see `FIND_UNIQUE_REWRITE`), and `findFirst`'s `WhereInput` — unlike
 * `WhereUniqueInput` — does not understand the synthetic compound-key field
 * name at all ("Unknown argument"). E.g.
 * `{ organizationId_stage: { organizationId, stage } }` → `{ organizationId, stage }`.
 * `update`/`delete`/`upsert` keep `WhereUniqueInput` semantics (never rewritten)
 * so their compound-key `where` must NOT be flattened — this is only called for
 * the two rewritten operations.
 */
function flattenCompoundUniqueWhere(where: AnyArgs): AnyArgs {
  const result: AnyArgs = {};
  for (const [key, value] of Object.entries(where)) {
    if (isCompoundUniqueKeyWrapper(key, value)) {
      Object.assign(result, value);
    } else {
      result[key] = value;
    }
  }
  return result;
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
  if (operation in FIND_UNIQUE_REWRITE) {
    // This operation is about to be rewritten to findFirst* (see
    // `rewriteOperationForTenant`) — flatten any compound-unique-key wrapper in
    // `where` now, since findFirst's `WhereInput` cannot parse it.
    //
    // MUST run BEFORE `injectWhere` below, not after. `flattenCompoundUniqueWhere`
    // spreads the wrapper's nested fields onto the top level with `Object.assign`,
    // which — if it ran after injection — could reintroduce a stale/attacker-
    // controlled `organizationId` from inside the wrapper (e.g. a hypothetical
    // `{ organizationId: "x", organizationId_stage: { organizationId: "evil", ... } }`)
    // and silently overwrite the real tenant id. Flattening first means
    // `injectWhere`'s own `{ ...where, organizationId }` literal is always the
    // LAST write to that key, so the real tenant id always wins regardless of
    // what shape the caller's `where` had. See prisma-tenant.test.ts for the
    // regression test.
    nextArgs = {
      ...nextArgs,
      where: flattenCompoundUniqueWhere((nextArgs.where as AnyArgs | undefined) ?? {}),
    };
  }
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

            // `findUnique*` with an injected non-unique `organizationId` is
            // invalid for Prisma; run the equivalent `findFirst*` instead.
            // `args` is already fully tenant-scoped, and we dispatch on the
            // BASE client so the extension does not re-run (no double scope).
            const rewritten = rewriteOperationForTenant(model, operation);
            if (rewritten !== operation && model) {
              const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[
                lowerFirst(model)
              ];
              const fn = delegate?.[rewritten] as
                | ((a: unknown) => Promise<unknown>)
                | undefined;
              if (typeof fn === "function") {
                return fn.call(delegate, nextArgs) as Promise<unknown>;
              }
            }

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
