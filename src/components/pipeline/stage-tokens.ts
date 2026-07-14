import { LeadStage } from "@/generated/prisma/enums";

/**
 * Default CSS custom-property token per stage (docs/05 §5.3). Single source of
 * truth for the column accent + the config colour swatches, kept in sync with
 * the `--stage-*` variables in `tokens.css` and the `StagePill` mapping. A tenant
 * may override per stage via `PipelineStageConfig.colorToken`.
 */
export const DEFAULT_STAGE_TOKENS: Readonly<Record<LeadStage, string>> = {
  [LeadStage.TO_HANDLE]: "--stage-to-handle",
  [LeadStage.TAKEN]: "--stage-taken",
  [LeadStage.CALL_SCHEDULED]: "--stage-call-scheduled",
  [LeadStage.WAITING_DOCS]: "--stage-waiting-docs",
  [LeadStage.PRESENTATION_CALL]: "--stage-presentation",
  [LeadStage.PRESENTATION_CALL_2]: "--stage-presentation-2",
  [LeadStage.WAITING_DECISION]: "--stage-waiting-decision",
  [LeadStage.STANDBY]: "--stage-standby",
  [LeadStage.WAITING_PAYMENT]: "--stage-waiting-payment",
  [LeadStage.WON]: "--stage-won",
  [LeadStage.LOST]: "--stage-lost",
};

/** The selectable colour tokens offered in the config swatch picker. */
export const STAGE_COLOR_CHOICES: readonly string[] = Object.values(DEFAULT_STAGE_TOKENS);
