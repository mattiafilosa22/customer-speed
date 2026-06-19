import { LeadStage } from "@/generated/prisma/enums";
import { Pill, type PillStage } from "@/components/ui";
import { getLeadStageLabel } from "@/i18n/enum-labels";

/**
 * Maps a `LeadStage` enum value to the `PillStage` key used by the design-system
 * stage tokens. Single source of truth so the list, detail and pipeline all
 * colour stages identically.
 */
const STAGE_TO_PILL: Readonly<Record<LeadStage, PillStage>> = {
  [LeadStage.TO_HANDLE]: "to-handle",
  [LeadStage.TAKEN]: "taken",
  [LeadStage.CALL_SCHEDULED]: "call-scheduled",
  [LeadStage.WAITING_DOCS]: "waiting-docs",
  [LeadStage.PRESENTATION_CALL]: "presentation",
  [LeadStage.WAITING_DECISION]: "waiting-decision",
  [LeadStage.WAITING_PAYMENT]: "waiting-payment",
  [LeadStage.WON]: "won",
  [LeadStage.LOST]: "lost",
};

export function stageToPill(stage: LeadStage): PillStage {
  return STAGE_TO_PILL[stage];
}

/**
 * Server stage pill: colour from the stage token PLUS the localized stage label
 * as text — the status is never communicated by colour alone (WCAG 1.4.1).
 */
export async function StagePill({ stage }: { stage: LeadStage }) {
  const label = await getLeadStageLabel(stage);
  return <Pill stage={stageToPill(stage)}>{label}</Pill>;
}
