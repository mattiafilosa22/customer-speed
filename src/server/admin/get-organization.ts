import { NotFoundError } from "@/lib/errors";
import { parseFeatureFlags, type FeatureFlags } from "@/lib/feature-flags";
import { parseInput } from "@/server/validation";
import type { AdminDeps } from "@/server/admin/deps";
import { organizationIdSchema } from "@/server/admin/schemas";

/**
 * Full configuration view of a single tenant for the admin detail page
 * (docs/04 §4.10). Cross-tenant read on the BASE client; audited by the calling
 * Server Component (`admin.organization.view`). Returns identity + parsed
 * feature flags + synthetic metrics. The
 * white-label theme/brand is loaded separately via the REUSED
 * `getOrganizationBranding` use case (one source of truth for the panel).
 *
 * Performance: one `findUnique` (selected fields) + two DB-side counts, run
 * concurrently. Never loads rows to count them.
 */

export interface OrganizationDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly appName: string;
  readonly customDomain: string | null;
  readonly featureFlags: FeatureFlags;
  readonly userCount: number;
  readonly leadCount: number;
  readonly createdAt: Date;
}

export async function getOrganization(
  deps: AdminDeps,
  input: unknown,
): Promise<OrganizationDetail> {
  const { organizationId } = parseInput(organizationIdSchema, input);

  const [org, userCount, leadCount] = await Promise.all([
    deps.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        appName: true,
        customDomain: true,
        featureFlags: true,
        createdAt: true,
      },
    }),
    deps.prisma.user.count({
      where: { organizationId, role: { not: "superAdmin" } },
    }),
    deps.prisma.lead.count({ where: { organizationId, deletedAt: null } }),
  ]);

  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    appName: org.appName,
    customDomain: org.customDomain,
    featureFlags: parseFeatureFlags(org.featureFlags),
    userCount,
    leadCount,
    createdAt: org.createdAt,
  };
}
