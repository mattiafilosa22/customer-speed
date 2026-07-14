/**
 * Public surface of the loss-reason domain module (Settings CRUD, docs/02
 * §2.5-bis). The UI/Server Actions import use cases from here; they never reach
 * into Prisma directly (docs/00 §1). The read-only picker in
 * `src/server/leads/reference-data.ts` also re-exports `listLossReasons` from
 * here (`includeInactive: false`) rather than duplicating the query.
 */
export type { LossReasonActor, LossReasonDeps } from "@/server/loss-reasons/deps";
export { buildLossReasonDeps } from "@/server/loss-reasons/context-deps";
export type { LossReasonItem } from "@/server/loss-reasons/types";

export { listLossReasons } from "@/server/loss-reasons/list-loss-reasons";
export { createLossReason } from "@/server/loss-reasons/create-loss-reason";
export { updateLossReason } from "@/server/loss-reasons/update-loss-reason";
export { setLossReasonActive } from "@/server/loss-reasons/deactivate-loss-reason";
export {
  reorderLossReasons,
  type ReorderLossReasonsResult,
} from "@/server/loss-reasons/reorder-loss-reasons";

export {
  createLossReasonSchema,
  updateLossReasonSchema,
  setLossReasonActiveSchema,
  reorderLossReasonsSchema,
} from "@/server/loss-reasons/schemas";
export type {
  CreateLossReasonInput,
  UpdateLossReasonInput,
  SetLossReasonActiveInput,
  ReorderLossReasonsInput,
} from "@/server/loss-reasons/schemas";
