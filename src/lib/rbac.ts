import type { Role } from "@/generated/prisma/enums";

/**
 * Role-Based Access Control (RBAC).
 *
 * Permissions are modeled as **capabilities** (verbs on resources), mapped to
 * roles per the default matrix in `docs/02-specifiche-funzionali.md` §2.1.
 * Enforcement is **server-side** on every Server Action / Route Handler via
 * `requirePermission()` — hiding UI is cosmetic only (`docs/06` §6.3).
 *
 * The mapping is the *default*; `docs/02` notes it is configurable per tenant to
 * modulate `baseUser`. This module is the single source of truth for the default
 * and is structured so a per-tenant override layer can wrap it later without
 * changing call sites.
 */

/**
 * Exhaustive list of capabilities. Adding a feature → add a capability here and
 * map it below. `Capability` is derived from this tuple so the type stays in
 * sync with the runtime list (no drift).
 */
export const CAPABILITIES = [
  // Dashboard
  "dashboard.view",
  // Pipeline
  "pipeline.view",
  "pipeline.move", // drag/move a lead between stages (baseUser allowed)
  "pipeline.configureStages", // hide/show stages, ordering
  // Leads
  "lead.view",
  "lead.create",
  "lead.update",
  "lead.delete",
  "lead.setCapital",
  "lead.note", // notes & per-lead data
  // Invoices
  "invoice.create",
  // Appointments & calendar
  "appointment.manage",
  "calendar.integrations",
  // Tenant settings & users
  "settings.tenant", // theme, app name, feature flags (proUser limited)
  "users.manage", // manage users within the tenant
  // Cross-tenant admin area
  "admin.tenants", // create/configure tenants — superAdmin only
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Capabilities granted to each role (default matrix, docs/02 §2.1).
 *
 * `superAdmin` is the product/reseller operator: it is NOT an operational CRM
 * user. It owns the cross-tenant admin area; operational tenant capabilities
 * (creating leads, etc.) are exercised within a tenant by proUser/baseUser. We
 * therefore grant `superAdmin` the global/admin and read capabilities and gate
 * tenant-operational writes to the tenant roles, matching the matrix where
 * superAdmin is "globale" for dashboard/pipeline but not an operator.
 */
const ROLE_CAPABILITIES: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  superAdmin: new Set<Capability>([
    "admin.tenants",
    "dashboard.view",
    "pipeline.view",
    "pipeline.configureStages",
    "lead.view",
    "lead.create",
    "lead.update",
    "lead.delete",
    "lead.setCapital",
    "lead.note",
    "invoice.create",
    "appointment.manage",
    "calendar.integrations",
    "settings.tenant",
    "users.manage",
  ]),
  proUser: new Set<Capability>([
    "dashboard.view",
    "pipeline.view",
    "pipeline.move",
    "pipeline.configureStages",
    "lead.view",
    "lead.create",
    "lead.update",
    "lead.delete",
    "lead.setCapital",
    "lead.note",
    "invoice.create",
    "appointment.manage",
    "calendar.integrations",
    "settings.tenant",
    "users.manage",
  ]),
  baseUser: new Set<Capability>([
    "dashboard.view",
    "pipeline.view",
    "pipeline.move", // "sola lettura + sposta"
    "lead.view",
    "lead.create",
    "lead.update",
    "lead.setCapital",
    "lead.note",
    // NOT granted: lead.delete, pipeline.configureStages, invoice.create,
    // appointment.manage, calendar.integrations, settings.tenant, users.manage,
    // admin.tenants
  ]),
};

/** Pure predicate: does `role` hold `capability`? Side-effect free, testable. */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/**
 * Error thrown when an authenticated principal lacks a capability.
 * Carries an HTTP 403 status so Route Handlers can map it directly.
 */
export class ForbiddenError extends Error {
  readonly status = 403 as const;
  readonly capability: Capability;
  constructor(capability: Capability) {
    super(`Missing permission: ${capability}`);
    this.name = "ForbiddenError";
    this.capability = capability;
  }
}

/**
 * Server-side enforcement. Throws {@link ForbiddenError} (→ 403) when the role
 * lacks the capability. Call this at the start of every protected action AFTER
 * resolving the request context (auth → RBAC → tenant → Zod → use case).
 */
export function requirePermission(role: Role, capability: Capability): void {
  if (!can(role, capability)) {
    throw new ForbiddenError(capability);
  }
}
