import { Prisma } from "@/generated/prisma/client";
import { AppointmentStatus, type LeadStage } from "@/generated/prisma/enums";
import { romeDayRangeUtc } from "@/lib/rome-day";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import {
  type AppointmentFilter,
  listAppointmentsSchema,
} from "@/server/appointments/schemas";
import {
  appointmentListSelect,
  type AppointmentListRow,
} from "@/server/appointments/selectors";

/**
 * List the tenant's appointments (docs/02 §2.6, docs/04 §4.5 GET /appointments).
 *
 * Filter → status mapping (see schemas): `all` = no status filter, `todo` =
 * PENDING, `done` = DONE. Rows are ordered by `startAt` ascending (soonest
 * first), riding the `[organizationId, status, startAt]` / `[organizationId,
 * startAt]` indexes. Optional `leadId` restricts to one lead (the detail panel).
 *
 * Performance (docs/00 §3 — zero N+1, aggregates DB-side, paginated):
 *  - ONE `findMany` (page rows + the linked lead batched in the `select`),
 *  - ONE `count` for the active filter's total (pagination),
 *  - ONE `groupBy` over `status` (period/lead-scoped) for the tab counts.
 *  No per-row queries.
 */

export interface AppointmentItem {
  readonly id: string;
  readonly startAt: Date;
  readonly reason: string;
  readonly status: AppointmentStatus;
  /** Linked lead id (or null) — convenience for the edit form's default value. */
  readonly leadId: string | null;
  readonly lead: {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly stage?: LeadStage;
  } | null;
}

export interface AppointmentTabCounts {
  readonly all: number;
  readonly todo: number;
  readonly done: number;
}

export interface AppointmentListResult {
  readonly data: readonly AppointmentItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly counts: AppointmentTabCounts;
}

/** Status constraint for a tab filter (none for "all"). */
function statusFor(filter: AppointmentFilter): AppointmentStatus | undefined {
  switch (filter) {
    case "todo":
      return AppointmentStatus.PENDING;
    case "done":
      return AppointmentStatus.DONE;
    default:
      return undefined;
  }
}

function toItem(row: AppointmentListRow): AppointmentItem {
  return {
    id: row.id,
    startAt: row.startAt,
    reason: row.reason,
    status: row.status,
    leadId: row.leadId,
    lead: row.lead
      ? { id: row.lead.id, firstName: row.lead.firstName, lastName: row.lead.lastName }
      : null,
  };
}

export async function listAppointments(
  deps: AppointmentDeps,
  input: unknown,
): Promise<AppointmentListResult> {
  const params = parseInput(listAppointmentsSchema, input);

  // Base where shared by every query: optional lead scope + optional single-day
  // scope (the tenant filter is injected by the scoped client). Tab counts span
  // all statuses of this scope (so they stay coherent with the active filter).
  const baseWhere: Prisma.AppointmentWhereInput = {};
  if (params.leadId) {
    baseWhere.leadId = params.leadId;
  }
  if (params.date) {
    const { gte, lt } = romeDayRangeUtc(params.date);
    baseWhere.startAt = { gte, lt };
  }

  const status = statusFor(params.filter);
  const pageWhere: Prisma.AppointmentWhereInput = status
    ? { ...baseWhere, status }
    : baseWhere;

  const skip = (params.page - 1) * params.pageSize;

  const [rows, total, grouped] = await Promise.all([
    deps.prisma.appointment.findMany({
      where: pageWhere,
      select: appointmentListSelect,
      orderBy: { startAt: "asc" },
      skip,
      take: params.pageSize,
    }),
    deps.prisma.appointment.count({ where: pageWhere }),
    deps.prisma.appointment.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  let pending = 0;
  let done = 0;
  let all = 0;
  for (const group of grouped) {
    const n = group._count._all;
    all += n;
    if (group.status === AppointmentStatus.PENDING) pending = n;
    if (group.status === AppointmentStatus.DONE) done = n;
  }

  return {
    data: rows.map(toItem),
    total,
    page: params.page,
    pageSize: params.pageSize,
    counts: { all, todo: pending, done },
  };
}
