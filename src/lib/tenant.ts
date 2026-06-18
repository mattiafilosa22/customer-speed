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
 * Resolves the request context from the authenticated session.
 *
 * Fase 1 will implement this against Auth.js:
 *   1. read the session (`auth()`),
 *   2. if absent → throw an `UnauthorizedError`,
 *   3. map the session user to `TenantContext` or `SuperAdminContext`.
 *
 * It is left unimplemented in Fase 0 on purpose: there is no auth yet, and a
 * fake default tenant would risk leaking across tenants if accidentally shipped.
 */
export function getTenantContext(): never {
  throw new Error(
    "getTenantContext() is not wired yet — implemented in Fase 1 (Auth.js). " +
      "Do not call from request handlers until then.",
  );
}
