import { z } from "zod";

import type { LeadStage } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { daysInStage } from "@/lib/days";
import { parseInput } from "@/server/validation";
import { clockNow, type DashboardDeps } from "@/server/dashboard/deps";
import { TERMINAL_STAGES } from "@/server/leads/stage";

/**
 * "Lead totali" list at the foot of the dashboard (docs/02 §2.2): active leads
 * (NOT in a terminal stage WON/LOST, NOT soft-deleted) ordered by days-in-stage
 * DESC — the most "stuck" leads on top.
 *
 * Soft-deleted rows are already excluded by the tenant client's default filter;
 * we additionally exclude the terminal stages via the canonical `TERMINAL_STAGES`
 * set (single source of truth, docs/02 §2.2). This list is intentionally NOT
 * period-filtered: it surfaces what currently needs attention regardless of when
 * the lead was created (deep browsing lives in "I miei lead").
 *
 * Performance (docs/00 §3 — bounded, indexed, no N+1):
 *  - ONE `findMany` capped at `limit` (default 5, max 50) with a mirrored `select`
 *    (no over-fetch, no sensitive columns),
 *  - ordering by `stageChangedAt asc` maps to days DESC and rides the
 *    `[organizationId, stageChangedAt]` index. The day counter is derived in
 *    memory from `stageChangedAt` (no extra query).
 */

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

export const activeLeadsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});
export type ActiveLeadsInput = z.infer<typeof activeLeadsSchema>;

export interface ActiveLeadItem {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly stage: LeadStage;
  readonly daysInStage: number;
}

export interface ActiveLeadsResult {
  readonly data: readonly ActiveLeadItem[];
}

const activeLeadSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  stage: true,
  stageChangedAt: true,
} satisfies Prisma.LeadSelect;

export async function getActiveLeads(
  deps: DashboardDeps,
  input: unknown = {},
): Promise<ActiveLeadsResult> {
  const { limit } = parseInput(activeLeadsSchema, input);
  const now = clockNow(deps);

  const rows = await deps.prisma.lead.findMany({
    where: { stage: { notIn: [...TERMINAL_STAGES] } },
    select: activeLeadSelect,
    orderBy: { stageChangedAt: "asc" }, // oldest stageChangedAt → most days → on top
    take: limit,
  });

  const data: ActiveLeadItem[] = rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    stage: row.stage,
    daysInStage: daysInStage(row.stageChangedAt, now),
  }));

  return { data };
}
