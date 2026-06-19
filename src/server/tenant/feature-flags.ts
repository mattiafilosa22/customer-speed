import { prisma } from "@/lib/prisma";
import {
  type FeatureFlagKey,
  type FeatureFlags,
  parseFeatureFlags,
} from "@/lib/feature-flags";

/**
 * Resolve the typed feature flags for a tenant by its `organizationId`.
 *
 * Reads `Organization.featureFlags` with a tight `select` (no over-fetch). The
 * id comes from the AUTHENTICATED context (session), never from client input, so
 * the base client is fine (it cannot reach another tenant via a server-trusted
 * id). Falls back to defaults if the org row is missing, so the shell always
 * renders.
 */
export async function getTenantFeatureFlags(organizationId: string): Promise<FeatureFlags> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { featureFlags: true },
  });
  return parseFeatureFlags(org?.featureFlags);
}

/** The enabled flag keys (for serializable props passed to client components). */
export function enabledFeatureKeys(flags: FeatureFlags): FeatureFlagKey[] {
  return (Object.keys(flags) as FeatureFlagKey[]).filter((key) => flags[key]);
}
