import type { LeadStage } from "@/generated/prisma/enums";
import { NotFoundError } from "@/lib/errors";
import { attributeAppointments, attributeSales } from "@/server/insight/attribution";
import { getInsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { cellLeadsSchema } from "@/server/insight/schemas";
import { parseInput } from "@/server/validation";

export interface CellLead {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly stage: LeadStage;
  readonly createdFromInsight: boolean;
}

/** Return exactly the leads used to derive one visible table cell. */
export async function listCellLeads(deps: InsightDeps, input: unknown): Promise<CellLead[]> {
  const cell = parseInput(cellLeadsSchema, input);
  const config = await getInsightConfig(deps);
  if (!config) {
    throw new NotFoundError("Insight section is not configured for this tenant");
  }

  const month = { year: cell.date.getUTCFullYear(), month: cell.date.getUTCMonth() + 1 };
  const attributed =
    cell.metric === "appointments"
      ? (await attributeAppointments(deps, config, month)).attributed
      : await attributeSales(deps, config, month);
  const dayKey = cell.date.toISOString().slice(0, 10);
  const leadIds = attributed
    .filter((entry) => entry.dayKey === dayKey && entry.group === cell.group)
    .map((entry) => entry.leadId);
  if (leadIds.length === 0) {
    return [];
  }

  return deps.prisma.lead.findMany({
    where: { id: { in: leadIds } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stage: true,
      createdFromInsight: true,
    },
  });
}
