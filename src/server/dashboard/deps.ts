import type { TenantPrismaClient } from "@/lib/prisma-tenant";

/**
 * Dependencies for the dashboard use cases.
 *
 * The dashboard is READ-ONLY (KPI aggregates + lists), so unlike `LeadDeps` /
 * `PipelineDeps` it needs neither an audit logger nor a write actor — only the
 * TENANT-SCOPED Prisma client (forces `organizationId` + soft-delete default at
 * the data layer, docs/00 §3). Smaller interface = Interface Segregation
 * (docs/00 §1): the use cases depend on exactly what they use.
 *
 * `now` is an injectable clock so the "days in stage" computation in
 * `getActiveLeads` is deterministic in tests.
 */
export interface DashboardDeps {
  readonly prisma: TenantPrismaClient;
  /** Injectable clock for deterministic day counters in tests. */
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<DashboardDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
