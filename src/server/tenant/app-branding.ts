import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/**
 * Resolve the white-label app name to display on UNAUTHENTICATED screens (auth,
 * marketing). For the single-domain model this is the default tenant's
 * `appName`; with subdomain routing it would be derived from the host. Falls
 * back to a neutral product name if the tenant cannot be resolved (e.g. empty
 * DB) so the pages never crash.
 *
 * Read with a tight `select` (no over-fetch). NOT tenant-scoped on purpose —
 * this runs before any session exists.
 */
export async function getPublicAppName(fallback = "CustomerSpeed"): Promise<string> {
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: env.DEFAULT_ORG_SLUG },
      select: { appName: true },
    });
    return org?.appName ?? fallback;
  } catch {
    return fallback;
  }
}
