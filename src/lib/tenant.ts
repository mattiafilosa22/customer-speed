import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  getTenantPrisma,
  type TenantPrismaClient,
  type TenantPrismaOptions,
} from "@/lib/prisma-tenant";
import type { Role } from "@/generated/prisma/enums";

/**
 * Tenant context — single source of truth for "who is asking, and for which
 * organization" on the server.
 *
 * Two mutually exclusive shapes:
 *  - `TenantContext`: a normal user bound to exactly one `organizationId`.
 *    Every domain query is forced to this tenant (see `src/lib/prisma-tenant.ts`).
 *  - `SuperAdminContext`: the explicit, audited cross-tenant context. It is NOT
 *    tenant-scoped by construction, so it must never be used for ordinary
 *    request handling — only for `(admin)/` operations, and every action must be
 *    written to `AuditLog`.
 *
 * NOTE (Fase 0): this is the typed skeleton. Wiring to Auth.js (NextAuth v5)
 * lands in Fase 1, where `getTenantContext()` will read the authenticated
 * session, resolve the user's `organizationId` and `role`, and throw on missing
 * auth. The shapes below are intentionally final so callers can be written
 * against them now.
 */

export interface TenantContext {
  readonly kind: "tenant";
  readonly organizationId: string;
  readonly userId: string;
  readonly role: Exclude<Role, "superAdmin">;
}

export interface SuperAdminContext {
  readonly kind: "superAdmin";
  readonly userId: string;
  readonly role: Extract<Role, "superAdmin">;
  /**
   * Optional target organization the superAdmin is acting on. When set, reads
   * may be scoped to it for convenience; when undefined, the context is truly
   * cross-tenant and every access must be deliberate and audited.
   */
  readonly actingOnOrganizationId?: string;
}

export type RequestContext = TenantContext | SuperAdminContext;

/** Type guard: narrows a context to the tenant-scoped shape. */
export function isTenantContext(ctx: RequestContext): ctx is TenantContext {
  return ctx.kind === "tenant";
}

/** Type guard: narrows a context to the superAdmin shape. */
export function isSuperAdminContext(ctx: RequestContext): ctx is SuperAdminContext {
  return ctx.kind === "superAdmin";
}

/**
 * Resolves the request context from the authenticated Auth.js session.
 *
 *   1. read the session (`auth()`),
 *   2. if absent → throw `UnauthorizedError` (→ 401),
 *   3. re-validate `sessionVersion` against the DB so password changes / forced
 *      logouts invalidate other JWT sessions (stale token → 401),
 *   4. map to `SuperAdminContext` (cross-tenant) or `TenantContext` (scoped).
 *
 * Returns a discriminated union so callers must consciously handle the
 * superAdmin (cross-tenant) path vs the tenant-scoped path.
 */
export async function getTenantContext(): Promise<RequestContext> {
  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.id) {
    throw new UnauthorizedError("No active session");
  }

  // Re-validate against the DB: the token is only trusted if the user still
  // exists, is active, and the sessionVersion matches (invalidate-other-sessions).
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      organizationId: true,
      role: true,
      isActive: true,
      sessionVersion: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    throw new UnauthorizedError("User no longer active");
  }
  if (dbUser.sessionVersion !== sessionUser.sessionVersion) {
    throw new UnauthorizedError("Session has been invalidated");
  }

  if (dbUser.role === "superAdmin") {
    return {
      kind: "superAdmin",
      userId: dbUser.id,
      role: "superAdmin",
    };
  }

  return {
    kind: "tenant",
    organizationId: dbUser.organizationId,
    userId: dbUser.id,
    role: dbUser.role,
  };
}

/**
 * Convenience: resolve the context and assert it is tenant-scoped (the normal
 * case for `(app)/` request handlers). Throws `UnauthorizedError` if a
 * superAdmin reaches a tenant-only route without an explicit acting context.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!isTenantContext(ctx)) {
    throw new UnauthorizedError("Tenant context required");
  }
  return ctx;
}

/**
 * Convenience: resolve the context and assert it is the SUPERADMIN
 * (cross-tenant) shape — the only valid context for the `(admin)/` area. Throws
 * `UnauthorizedError` if a tenant user reaches an admin route/action. Use this
 * AFTER the layout guard as defense-in-depth: every admin Server Action must
 * re-check server-side, never trusting that the layout already gated the page.
 */
export async function requireSuperAdminContext(): Promise<SuperAdminContext> {
  const ctx = await getTenantContext();
  if (!isSuperAdminContext(ctx)) {
    throw new UnauthorizedError("SuperAdmin context required");
  }
  return ctx;
}

/**
 * Returns the per-request, tenant-bound Prisma client for the CURRENT session.
 * This is the client domain code MUST use for tenant-scoped access — it forces
 * `organizationId` and the soft-delete default at the data layer.
 */
export async function getTenantPrismaFromContext(
  options?: TenantPrismaOptions,
): Promise<TenantPrismaClient> {
  const ctx = await requireTenantContext();
  return getTenantPrisma(ctx, options);
}
