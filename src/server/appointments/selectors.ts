import { Prisma } from "@/generated/prisma/client";

/**
 * Centralized Prisma `select` shapes for the appointment domain (docs/00 §3:
 * explicit selects, never `SELECT *`; zero N+1 via a batched relation select).
 * Declared with `satisfies` so they feed Prisma's `GetPayload` types — a single
 * source of truth for the query and the returned row type.
 *
 * The linked lead is read in the SAME query (one join, no per-row follow-up):
 * the list shows the lead name + a deep link to its detail. `provider` /
 * `externalEventId` are present in the model for Fase 6 but intentionally NOT
 * selected/used here.
 */
export const appointmentListSelect = {
  id: true,
  startAt: true,
  reason: true,
  status: true,
  leadId: true,
  lead: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AppointmentSelect;

export type AppointmentListRow = Prisma.AppointmentGetPayload<{
  select: typeof appointmentListSelect;
}>;
