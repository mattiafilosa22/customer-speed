/**
 * Public surface of the pipeline domain module. The UI, Server Actions and the
 * Route Handlers import use cases from here; they never reach into Prisma
 * directly (docs/00 §1).
 */
export type { PipelineActor, PipelineDeps } from "@/server/pipeline/deps";
export { buildPipelineDeps } from "@/server/pipeline/context-deps";

export {
  getPipelineConfig,
  type PipelineConfigResult,
  type PipelineStageConfigItem,
} from "@/server/pipeline/get-pipeline-config";
export {
  getBoard,
  boardQuerySchema,
  MAX_CARDS_PER_COLUMN,
  type PipelineBoardResult,
  type PipelineColumn,
  type PipelineCard,
} from "@/server/pipeline/get-board";
export {
  updateStageVisibility,
  PIPELINE_CONFIG_ERRORS,
  type StageVisibilityResult,
} from "@/server/pipeline/update-stage-visibility";
export { reorderStages, PIPELINE_REORDER_ERROR, type ReorderResult } from "@/server/pipeline/reorder-stages";
export { setStageColor, type SetStageColorResult } from "@/server/pipeline/set-stage-color";
