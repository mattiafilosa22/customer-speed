import { parseInput } from "@/server/validation";
import type { OrganizationDeps } from "@/server/organization/deps";
import { updateBrandingSchema } from "@/server/organization/schemas";

/**
 * Persist the tenant's BRAND identity (docs/05 §5.4): platform name, logo,
 * textual mark fallback, favicon and the "powered by" toggle.
 *
 * Validation is the existing `updateBrandingSchema` (Zod): `appName` required,
 * `markFallback` ≤ 3 chars (upper-cased), image refs constrained to PNG/SVG data
 * URLs or http(s) URLs with a size guard. `null` clears an asset.
 *
 * Storage note (this phase): uploaded images are accepted as data URLs and
 * stored directly in TEXT columns — no blob storage yet. The schema caps the
 * size; the TODO to move to object storage is documented in the Prisma schema.
 *
 * Isolation: writes `where: { id: actor.organizationId }` (server context).
 */
export interface UpdateBrandingResult {
  readonly ok: true;
}

export async function updateOrganizationBranding(
  deps: OrganizationDeps,
  input: unknown,
): Promise<UpdateBrandingResult> {
  const data = parseInput(updateBrandingSchema, input);

  await deps.prisma.organization.update({
    where: { id: deps.actor.organizationId },
    data: {
      appName: data.appName,
      poweredBy: data.poweredBy,
      // `undefined` leaves the column untouched; `null` clears it.
      logoUrl: data.logoUrl,
      faviconUrl: data.faviconUrl,
      markFallback: data.markFallback,
    },
  });

  await deps.audit.record({
    action: "settings.branding.update",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Organization",
    entityId: deps.actor.organizationId,
    meta: {
      appName: data.appName,
      poweredBy: data.poweredBy,
      hasLogo: data.logoUrl != null,
      hasFavicon: data.faviconUrl != null,
      mark: data.markFallback,
    },
  });

  return { ok: true };
}
