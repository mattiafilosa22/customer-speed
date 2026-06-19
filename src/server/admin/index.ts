/**
 * Cross-tenant admin (superAdmin) use cases — the boundary the `(admin)/` area
 * talks to (docs/00 §1: UI → Server Action/Server Component → use case → Prisma).
 *
 * The superAdmin path is explicit and audited: it uses the BASE Prisma client
 * (NEVER the tenant-scoped one) and every action records an `AuditLog` entry
 * (docs/01 §1.3, docs/06 §6.4). See `deps.ts` for the contract.
 */
export type { AdminActor, AdminDeps } from "@/server/admin/deps";
export { buildAdminDeps, buildOrganizationDepsForTarget } from "@/server/admin/context-deps";

export { listOrganizations } from "@/server/admin/list-organizations";
export type {
  OrganizationListItem,
  OrganizationListResult,
} from "@/server/admin/list-organizations";

export { getOrganization } from "@/server/admin/get-organization";
export type { OrganizationDetail } from "@/server/admin/get-organization";

export { createOrganization } from "@/server/admin/create-organization";
export type { CreateOrganizationResult } from "@/server/admin/create-organization";

export {
  updateOrganization,
  updateOrganizationFeatureFlags,
  setOrganizationActive,
} from "@/server/admin/update-organization";
export type { AdminMutationResult } from "@/server/admin/update-organization";

export { getGlobalMetrics } from "@/server/admin/get-global-metrics";
export type { GlobalMetrics } from "@/server/admin/get-global-metrics";

export {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
} from "@/server/admin/manage-users";
export type {
  AdminUserListItem,
  AdminUserListResult,
  CreateUserResult,
  ResetUserPasswordResult,
} from "@/server/admin/manage-users";

export {
  createOrganizationSchema,
  updateOrganizationSchema,
  updateFeatureFlagsSchema,
  setOrganizationActiveSchema,
  createUserSchema,
  updateUserSchema,
  resetUserPasswordSchema,
  listUsersSchema,
  organizationIdSchema,
  paginationSchema,
  slugSchema,
} from "@/server/admin/schemas";
export type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  UpdateFeatureFlagsInput,
  SetOrganizationActiveInput,
  CreateUserInput,
  UpdateUserInput,
  ResetUserPasswordInput,
  ListUsersInput,
  Pagination,
} from "@/server/admin/schemas";
