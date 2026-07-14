/**
 * Public surface of the dashboard domain module. The dashboard Server Component
 * imports these use cases; it never reaches into Prisma directly (docs/00 §1).
 *
 * All use cases are READ-ONLY, tenant-scoped (via `DashboardDeps`) and compute
 * every figure with DB-side aggregates (count/groupBy/aggregate) — no records
 * are loaded into JS (docs/00 §3, docs/03 §3.4).
 */
export type { DashboardDeps } from "@/server/dashboard/deps";
export { buildDashboardDeps } from "@/server/dashboard/context-deps";
export {
  periodSchema,
  periodRange,
  periodFilter,
  type PeriodInput,
  type PeriodRange,
} from "@/server/dashboard/period";
export {
  resolveDateRangeBounds,
  type DateRangeInput,
  type DateRangeBounds,
} from "@/server/dashboard/date-range";

export { getDashboardKpis, type DashboardKpis } from "@/server/dashboard/get-kpis";
export {
  getPipelineDistribution,
  type PipelineDistributionItem,
  type PipelineDistributionResult,
} from "@/server/dashboard/get-pipeline-distribution";
export {
  getLostBreakdown,
  type LostBreakdownItem,
  type LostBreakdownResult,
} from "@/server/dashboard/get-lost-breakdown";
export {
  getInvoiceSummary,
  type InvoiceSummary,
} from "@/server/dashboard/get-invoice-summary";
export {
  getActiveLeads,
  activeLeadsSchema,
  type ActiveLeadItem,
  type ActiveLeadsResult,
} from "@/server/dashboard/get-active-leads";
