import { NotFoundError } from "@/lib/errors";
import { resolveTheme, type Theme } from "@/lib/theme";
import type { OrganizationDeps } from "@/server/organization/deps";

/**
 * The white-label settings of the current tenant, ready for the appearance
 * panel. The theme is parsed/normalized via `resolveTheme` (falls back to the
 * Indigo default if the stored JSON is absent/malformed, so the panel always
 * renders), and the brand assets are returned as-is.
 *
 * Scoped to `actor.organizationId` (server context) — a tenant only ever sees
 * its own organization.
 */
export interface OrganizationBranding {
  readonly appName: string;
  readonly theme: Theme;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly markFallback: string | null;
  readonly poweredBy: boolean;
}

export async function getOrganizationBranding(
  deps: OrganizationDeps,
): Promise<OrganizationBranding> {
  const org = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: {
      appName: true,
      theme: true,
      logoUrl: true,
      faviconUrl: true,
      markFallback: true,
      poweredBy: true,
    },
  });

  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  return {
    appName: org.appName,
    theme: resolveTheme(org.theme),
    logoUrl: org.logoUrl,
    faviconUrl: org.faviconUrl,
    markFallback: org.markFallback,
    poweredBy: org.poweredBy,
  };
}
