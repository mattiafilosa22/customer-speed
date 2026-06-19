import { parseInput } from "@/server/validation";
import type { AdminDeps } from "@/server/admin/deps";
import { paginationSchema } from "@/server/admin/schemas";

/**
 * Paginated list of ALL tenants with synthetic per-tenant metrics (docs/04
 * §4.10 GET /admin/organizations), for the admin tenants table.
 *
 * Cross-tenant by design — uses the BASE client. No tenant filter (the operator
 * sees every organization). The read is audited by the calling Server Component
 * (`admin.tenants.view`).
 *
 * Performance (docs/00 §3 — ZERO N+1, all counts DB-side):
 *  - ONE `findMany` (paginated) for the page of organizations,
 *  - ONE `user.groupBy(organizationId)` and ONE `lead.groupBy(organizationId)`
 *    restricted to the page's ids → counts folded into a Map.
 *  Three queries total regardless of page size; never a count-per-row loop.
 *
 * The user count excludes the global `superAdmin` (it does not belong to any
 * operational tenant); the lead count excludes soft-deleted leads (the base
 * client does NOT auto-apply the soft-delete filter, so we apply it explicitly).
 */

export interface OrganizationListItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly appName: string;
  readonly customDomain: string | null;
  /** A tenant is "suspended" when it has no active users (see suspend use case). */
  readonly isSuspended: boolean;
  readonly userCount: number;
  readonly leadCount: number;
  readonly createdAt: Date;
}

export interface OrganizationListResult {
  readonly items: ReadonlyArray<OrganizationListItem>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export async function listOrganizations(
  deps: AdminDeps,
  input: unknown,
): Promise<OrganizationListResult> {
  const { page, pageSize } = parseInput(paginationSchema, input);
  const skip = (page - 1) * pageSize;

  const [total, organizations] = await Promise.all([
    deps.prisma.organization.count(),
    deps.prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        name: true,
        slug: true,
        appName: true,
        customDomain: true,
        createdAt: true,
      },
    }),
  ]);

  const ids = organizations.map((o) => o.id);

  // Counts for ONLY the page's organizations, grouped DB-side. Empty `ids`
  // short-circuits to avoid a pointless `IN ()` query.
  const [userGroups, activeUserGroups, leadGroups] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          deps.prisma.user.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: ids }, role: { not: "superAdmin" } },
            _count: { _all: true },
          }),
          deps.prisma.user.groupBy({
            by: ["organizationId"],
            where: {
              organizationId: { in: ids },
              role: { not: "superAdmin" },
              isActive: true,
            },
            _count: { _all: true },
          }),
          deps.prisma.lead.groupBy({
            by: ["organizationId"],
            where: { organizationId: { in: ids }, deletedAt: null },
            _count: { _all: true },
          }),
        ]);

  const userCountByOrg = new Map(userGroups.map((g) => [g.organizationId, g._count._all]));
  const activeUserCountByOrg = new Map(
    activeUserGroups.map((g) => [g.organizationId, g._count._all]),
  );
  const leadCountByOrg = new Map(leadGroups.map((g) => [g.organizationId, g._count._all]));

  const items: OrganizationListItem[] = organizations.map((org) => {
    const userCount = userCountByOrg.get(org.id) ?? 0;
    const activeUserCount = activeUserCountByOrg.get(org.id) ?? 0;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      appName: org.appName,
      customDomain: org.customDomain,
      // A tenant with users but none active is considered suspended.
      isSuspended: userCount > 0 && activeUserCount === 0,
      userCount,
      leadCount: leadCountByOrg.get(org.id) ?? 0,
      createdAt: org.createdAt,
    };
  });

  return { items, total, page, pageSize };
}
