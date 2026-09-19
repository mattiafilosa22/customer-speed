import { LeadStage } from "@/generated/prisma/enums";
import type { PillStage } from "@/components/ui";

const STAGE_TO_PILL: Readonly<Record<LeadStage, PillStage>> = {
  [LeadStage.TO_HANDLE]: "to-handle",
  [LeadStage.TAKEN]: "taken",
  [LeadStage.CALL_SCHEDULED]: "call-scheduled",
  [LeadStage.WAITING_DOCS]: "waiting-docs",
  [LeadStage.PRESENTATION_CALL]: "presentation",
  [LeadStage.PRESENTATION_CALL_2]: "presentation-2",
  [LeadStage.WAITING_DECISION]: "waiting-decision",
  [LeadStage.STANDBY]: "standby",
  [LeadStage.WAITING_PAYMENT]: "waiting-payment",
  [LeadStage.WON]: "won",
  [LeadStage.LOST]: "lost",
};

export function stageToPill(stage: LeadStage): PillStage {
  return STAGE_TO_PILL[stage];
}
