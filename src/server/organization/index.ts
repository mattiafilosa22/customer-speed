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
export {
  updateThemeSchema,
  updateBrandingSchema,
} from "@/server/organization/schemas";
export type {
  UpdateThemeInput,
  UpdateBrandingInput,
} from "@/server/organization/schemas";
