import { Prisma } from "@/generated/prisma/client";

/**
 * Centralized Prisma `select` shapes for the lead domain (docs/00 §3: explicit
 * selects, never `SELECT *`, never sensitive columns; zero N+1 via batched
 * relation selects). Declared with `satisfies` so they stay valid against the
 * schema and feed Prisma's `GetPayload` types — a single source of truth for
 * both the query and the returned row type.
 */

/** Row shape for the "I miei lead" list. Includes source label + note count in
 * one query (no per-row follow-up). */
export const leadListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  stage: true,
  stageChangedAt: true,
  capitalBracket: true,
  createdAt: true,
  source: { select: { id: true, label: true } },
  _count: { select: { notes: true } },
} satisfies Prisma.LeadSelect;

export type LeadListRow = Prisma.LeadGetPayload<{ select: typeof leadListSelect }>;

/** Full detail row (left/center/right columns of the detail page). */
export const leadDetailSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  stage: true,
  stageChangedAt: true,
  capitalBracket: true,
  adminNotes: true,
  sourceId: true,
  lossReasonId: true,
  createdAt: true,
  updatedAt: true,
  source: { select: { id: true, label: true } },
  lossReason: { select: { id: true, label: true } },
  notes: {
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, authorId: true, createdAt: true, updatedAt: true },
  },
  externalRefs: {
    orderBy: { createdAt: "desc" },
    select: { id: true, altName: true, altEmail: true, source: true, createdAt: true },
  },
  stageHistory: {
    orderBy: { changedAt: "desc" },
    select: { id: true, fromStage: true, toStage: true, changedById: true, changedAt: true },
  },
} satisfies Prisma.LeadSelect;

export type LeadDetailRow = Prisma.LeadGetPayload<{ select: typeof leadDetailSelect }>;
