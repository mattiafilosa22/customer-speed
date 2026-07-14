import { Prisma } from "@/generated/prisma/client";

/**
 * Centralized Prisma `select` for the kanban card (docs/00 §3: explicit selects,
 * never `SELECT *`, never sensitive columns; zero N+1 via a batched relation
 * select). The card shows name, days-in-stage (from `stageChangedAt`), capital
 * bracket, source label and the stage pill (docs/02 §2.3).
 */
export const pipelineCardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  stage: true,
  stageChangedAt: true,
  capitalBracket: true,
  capitalAmount: true,
  source: { select: { id: true, label: true } },
} satisfies Prisma.LeadSelect;

export type PipelineCardRow = Prisma.LeadGetPayload<{ select: typeof pipelineCardSelect }>;

/**
 * Shared `select` for the batched "next appointment per lead" lookup (docs/00
 * §3: zero N+1 — ONE `findMany` over all cards' lead ids, never a query per
 * card). Only the fields the kanban card needs.
 */
export const nextAppointmentSelect = {
  leadId: true,
  startAt: true,
  status: true,
} satisfies Prisma.AppointmentSelect;

export type NextAppointmentRow = Prisma.AppointmentGetPayload<{
  select: typeof nextAppointmentSelect;
}>;
