import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { DashboardDeps } from "@/server/dashboard/deps";
import { periodFilter, periodSchema } from "@/server/dashboard/period";

/**
 * Top KPI tiles (docs/02 §2.2, docs/04 §4.2 GET /dashboard/summary).
 *
 * ── Definition of "del periodo" per KPI (documented next to the code, docs/02
 *    §2.2 / docs/03 §3.4) ──────────────────────────────────────────────────────
 *  - `totals`, `won`, `lost`: LEADS whose `createdAt` falls in the period
 *    (docs/02 §2.2: "lead creati nel periodo"). `won`/`lost` additionally filter
 *    by the lead's CURRENT `stage` (WON / LOST). So they are "leads created in the
 *    period that are currently won/lost".
 *  - `convRate` = `won / totals`, a ratio in 0..1 (docs/02 §2.2 chosen formula:
 *    Vinte / Lead totali del periodo). When `totals === 0` the rate is 0 (no
 *    division by zero).
 *  - `netRevenue`: sum of `Invoice.netAmount` for invoices whose `issuedAt` is in
 *    the period AND whose lead is currently `WON` (docs/03 §3.4). Note the
 *    DIFFERENT time anchor: revenue is dated by the INVOICE's `issuedAt`, not the
 *    lead's `createdAt`, because money is recognized when invoiced.
 *
 * Performance (docs/00 §3 — every figure computed DB-side, ZERO records loaded):
 *  - leads: ONE `groupBy(stage)` over the period → totals + won + lost derived
 *    from the grouped counts in memory (a ≤9-entry map),
 *  - revenue: ONE `aggregate(_sum: netAmount)` with a relation filter on the
 *    lead's stage.
 * Two queries total, run concurrently; no `findMany`.
 */

export interface DashboardKpis {
  readonly totals: number;
  readonly won: number;
  readonly lost: number;
  /** Conversion rate as a 0..1 ratio (won / totals); 0 when totals is 0. */
  readonly convRate: number;
  /** Net revenue (EUR) as a JS number — a plain, serializable currency value. */
  readonly netRevenue: number;
}

export async function getDashboardKpis(
  deps: DashboardDeps,
  input: unknown,
): Promise<DashboardKpis> {
  const period = parseInput(periodSchema, input);
  const range = periodFilter(period);

  // Leads created in the period (createdAt anchor), grouped by current stage.
  const leadWhere: Prisma.LeadWhereInput = range ? { createdAt: range } : {};

  // Invoices issued in the period (issuedAt anchor) whose lead is currently WON.
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    lead: { is: { stage: LeadStage.WON } },
    ...(range ? { issuedAt: range } : {}),
  };

  const [grouped, revenue] = await Promise.all([
    deps.prisma.lead.groupBy({ by: ["stage"], where: leadWhere, _count: { _all: true } }),
    deps.prisma.invoice.aggregate({ where: invoiceWhere, _sum: { netAmount: true } }),
  ]);

  let totals = 0;
  let won = 0;
  let lost = 0;
  for (const group of grouped) {
    const count = group._count._all;
    totals += count;
    if (group.stage === LeadStage.WON) won = count;
    else if (group.stage === LeadStage.LOST) lost = count;
  }

  const convRate = totals === 0 ? 0 : won / totals;

  // `_sum.netAmount` is a Prisma.Decimal | null (12,2). Convert to a JS number
  // for serialization to the client; the precision (2 decimals, < 1e10) is well
  // within Number's safe range, and the DB did the summation.
  const netRevenue = revenue._sum.netAmount
    ? new Prisma.Decimal(revenue._sum.netAmount).toNumber()
    : 0;

  return { totals, won, lost, convRate, netRevenue };
}
