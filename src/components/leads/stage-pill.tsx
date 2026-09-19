import type { LeadStage } from "@/generated/prisma/enums";
import { Pill } from "@/components/ui";
import { getLeadStageLabel } from "@/i18n/enum-labels";
import { stageToPill } from "@/components/leads/stage-pill-map";

/**
 * Maps a `LeadStage` enum value to the `PillStage` key used by the design-system
 * stage tokens. Single source of truth so the list, detail and pipeline all
 * colour stages identically.
 */
/**
 * Server stage pill: colour from the stage token PLUS the localized stage label
 * as text — the status is never communicated by colour alone (WCAG 1.4.1).
 */
export async function StagePill({ stage }: { stage: LeadStage }) {
  const label = await getLeadStageLabel(stage);
  return <Pill stage={stageToPill(stage)}>{label}</Pill>;
}
