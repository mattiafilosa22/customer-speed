import { LeadStage } from "@/generated/prisma/enums";

/**
 * Pipeline stage domain rules (docs/02 §2.3, §2.5).
 *
 * Kept separate from the use cases so the ordering and the terminal/transition
 * rules are a single, testable source of truth shared by `changeStage`, the
 * list tabs and the detail timeline.
 */

/** Canonical default order of the pipeline (docs/02 §2.3). */
export const STAGE_ORDER: readonly LeadStage[] = [
  LeadStage.TO_HANDLE,
  LeadStage.TAKEN,
  LeadStage.CALL_SCHEDULED,
  LeadStage.WAITING_DOCS,
  LeadStage.PRESENTATION_CALL,
  LeadStage.PRESENTATION_CALL_2,
  LeadStage.WAITING_DECISION,
  LeadStage.STANDBY,
  LeadStage.WAITING_PAYMENT,
  LeadStage.WON,
  LeadStage.LOST,
];

/** Terminal stages — used by KPI and the "active leads" filter (docs/02 §2.2). */
export const TERMINAL_STAGES: ReadonlySet<LeadStage> = new Set([LeadStage.WON, LeadStage.LOST]);

export function isTerminalStage(stage: LeadStage): boolean {
  return TERMINAL_STAGES.has(stage);
}

/** The stage that requires a loss reason on transition (docs/02 §2.5). */
export const LOSS_STAGE: LeadStage = LeadStage.LOST;
