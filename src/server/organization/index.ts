/**
 * Organization (white-label settings) use cases — the boundary the appearance &
 * brand panel talks to (docs/00 §1: UI → Server Action → use case → Prisma).
 */
export { buildOrganizationDeps } from "@/server/organization/context-deps";
export type { OrganizationActor, OrganizationDeps } from "@/server/organization/deps";
export { getOrganizationBranding } from "@/server/organization/get-branding";
export type { OrganizationBranding } from "@/server/organization/get-branding";
export { updateOrganizationTheme } from "@/server/organization/update-theme";
export type { UpdateThemeResult } from "@/server/organization/update-theme";
export { updateOrganizationBranding } from "@/server/organization/update-branding";
export type { UpdateBrandingResult } from "@/server/organization/update-branding";
export { updateOrganizationRetention } from "@/server/organization/update-retention";
export type { UpdateRetentionResult } from "@/server/organization/update-retention";
export {
  updateThemeSchema,
  updateBrandingSchema,
  updateRetentionSchema,
} from "@/server/organization/schemas";
export type {
  UpdateThemeInput,
  UpdateBrandingInput,
  UpdateRetentionInput,
} from "@/server/organization/schemas";
