import { z } from "zod";

import { Role } from "@/generated/prisma/enums";

/**
 * Zod schemas for the cross-tenant admin domain (docs/02 §2.1, docs/04 §4.10) —
 * the single source of truth for the input shapes at the admin Server Action
 * boundary (docs/00 §2). Types are inferred, never hand-written.
 *
 * Theme/brand updates reuse the existing white-label schemas
 * (`src/server/organization/schemas.ts`) and use cases — they are NOT re-declared
 * here. This module covers only the admin-specific shapes: tenant creation /
 * settings and per-tenant user management.
 */

/**
 * A URL/path-safe slug: lowercase letters, digits and hyphens, 2–40 chars, no
 * leading/trailing/double hyphens. Drives subdomain routing (docs/03), so it must
 * be DNS-label friendly.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters")
  .max(40, "Slug must be at most 40 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and single hyphens");

/** Optional custom domain (host only). Empty string → null (clears it). */
const customDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253, "Domain is too long")
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/,
    "Enter a valid domain (e.g. crm.example.com)",
  )
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/**
 * Pagination — cursor-based is overkill for the (small) tenant/user lists, but
 * offset pagination is still MANDATORY (docs/00 §3) so the lists never do an
 * unbounded `findMany`. Page is 1-based; size is capped.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Roles assignable to a user WITHIN a tenant (never `superAdmin`). */
const tenantRoleSchema = z.enum([Role.proUser, Role.baseUser]);

/** Create-tenant payload: organization + its first proUser (atomic). */
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: slugSchema,
  appName: z.string().trim().min(1, "App name is required").max(60),
  /** First admin user provisioned with the tenant. Always a proUser. */
  owner: z.object({
    name: z.string().trim().min(1, "Owner name is required").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  }),
});
export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

/** Update-tenant SETTINGS payload (identity + slug/domain). Theme/brand are
 * handled by the reused white-label use cases; feature flags by their own action. */
export const updateOrganizationSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  appName: z.string().trim().min(1, "App name is required").max(60).optional(),
  slug: slugSchema.optional(),
  customDomain: customDomainSchema,
});
export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;

/** Per-module feature flag toggles (matches `featureFlagsSchema` keys). */
export const updateFeatureFlagsSchema = z.object({
  organizationId: z.string().min(1),
  flags: z.object({
    leads: z.boolean(),
    pipeline: z.boolean(),
    dashboard: z.boolean(),
    appointments: z.boolean(),
    invoices: z.boolean(),
    calendarIntegrations: z.boolean(),
  }),
});
export type UpdateFeatureFlagsInput = z.input<typeof updateFeatureFlagsSchema>;

/** Suspend (deactivate) / activate a whole tenant. */
export const setOrganizationActiveSchema = z.object({
  organizationId: z.string().min(1),
  active: z.boolean(),
});
export type SetOrganizationActiveInput = z.input<typeof setOrganizationActiveSchema>;

/** Read a single organization. */
export const organizationIdSchema = z.object({
  organizationId: z.string().min(1),
});

/** List users of a tenant (paginated). */
export const listUsersSchema = paginationSchema.extend({
  organizationId: z.string().min(1),
});
export type ListUsersInput = z.input<typeof listUsersSchema>;

/** Create a user inside a tenant (invite flow: no password set here). */
export const createUserSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role: tenantRoleSchema,
});
export type CreateUserInput = z.input<typeof createUserSchema>;

/** Update a user inside a tenant: role and/or active state. */
export const updateUserSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: tenantRoleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

/** Trigger a password reset email for a tenant user. */
export const resetUserPasswordSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});
export type ResetUserPasswordInput = z.input<typeof resetUserPasswordSchema>;
