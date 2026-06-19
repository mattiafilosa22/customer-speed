import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { DashboardDeps } from "@/server/dashboard/deps";
import { periodFilter, periodSchema } from "@/server/dashboard/period";

/**
 * "Riepilogo fatture" (docs/02 §2.2): count + gross/net totals of the invoices of
 * the period.
 *
 * "Del periodo" = invoices whose `issuedAt` is in the period (the invoice's own
 * time anchor, consistent with `getDashboardKpis` net revenue). docs/02 §2.2
 * scopes the block to WON leads ("solo lead vinti"), so we filter by the lead's
 * current `stage = WON`; the `totalNet` therefore matches the `netRevenue` KPI
 * exactly (single source of truth for the net figure).
 *
 * Performance (docs/00 §3): a SINGLE `aggregate` computing both the count and the
 * two sums DB-side — no records loaded, no per-row work.
 */

export interface InvoiceSummary {
  readonly count: number;
  /** Gross total (EUR) as a serializable JS number. */
  readonly totalGross: number;
  /** Net total (EUR) as a serializable JS number. */
  readonly totalNet: number;
}

export async function getInvoiceSummary(
  deps: DashboardDeps,
  input: unknown,
): Promise<InvoiceSummary> {
  const period = parseInput(periodSchema, input);
  const range = periodFilter(period);
  const where: Prisma.InvoiceWhereInput = {
    lead: { is: { stage: LeadStage.WON } },
    ...(range ? { issuedAt: range } : {}),
  };

  const result = await deps.prisma.invoice.aggregate({
    where,
    _count: { _all: true },
    _sum: { grossAmount: true, netAmount: true },
  });

  const toNumber = (value: Prisma.Decimal | null): number =>
    value ? new Prisma.Decimal(value).toNumber() : 0;

  return {
    count: result._count._all,
    totalGross: toNumber(result._sum.grossAmount),
    totalNet: toNumber(result._sum.netAmount),
  };
}
