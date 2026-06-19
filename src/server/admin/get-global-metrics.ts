import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import type { AdminDeps } from "@/server/admin/deps";

/**
 * Global, CROSS-TENANT metrics for the admin dashboard (docs/08 Fase 7
 * "metriche globali"). superAdmin only; the read is audited by the calling
 * Server Component (`admin.metrics.view`) so this cross-tenant access is
 * traceable (docs/06 §6.4).
 *
 * Performance (docs/00 §3 — every figure computed DB-side, ZERO records loaded):
 *  - `organization.count()` → tenant total,
 *  - `user.count()` (excluding the global superAdmin) → users total,
 *  - `lead.count()` (excluding soft-deleted) → leads total,
 *  - `lead.count(stage = WON)` → won total (for a global conversion rate),
 *  - `invoice.aggregate(_sum: netAmount)` → aggregate net revenue across tenants.
 * Five independent counts/aggregates, run concurrently; never a `findMany`.
 *
 * The base client is used (cross-tenant); it does NOT auto-apply the soft-delete
 * filter, so `deletedAt: null` is set explicitly on lead counts.
 */

export interface GlobalMetrics {
  readonly tenantCount: number;
  readonly userCount: number;
  readonly leadCount: number;
  readonly wonCount: number;
  /** Conversion rate as a 0..1 ratio (won / leads); 0 when there are no leads. */
  readonly convRate: number;
  /** Aggregate net revenue (EUR) across ALL tenants, as a serializable number. */
  readonly netRevenue: number;
}

export async function getGlobalMetrics(deps: AdminDeps): Promise<GlobalMetrics> {
  const [tenantCount, userCount, leadCount, wonCount, revenue] = await Promise.all([
    deps.prisma.organization.count(),
    deps.prisma.user.count({ where: { role: { not: "superAdmin" } } }),
    deps.prisma.lead.count({ where: { deletedAt: null } }),
    deps.prisma.lead.count({ where: { deletedAt: null, stage: LeadStage.WON } }),
    deps.prisma.invoice.aggregate({ _sum: { netAmount: true } }),
  ]);

  const convRate = leadCount === 0 ? 0 : wonCount / leadCount;
  const netRevenue = revenue._sum.netAmount
    ? new Prisma.Decimal(revenue._sum.netAmount).toNumber()
    : 0;

  return { tenantCount, userCount, leadCount, wonCount, convRate, netRevenue };
}
