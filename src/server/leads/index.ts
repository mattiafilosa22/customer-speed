/**
 * Public surface of the lead domain module. The UI and the Route Handlers
 * import use cases from here; they never reach into Prisma directly (docs/00 §1).
 */
export type { LeadActor, LeadDeps } from "@/server/leads/deps";
export { buildLeadDeps } from "@/server/leads/context-deps";

export { createLead } from "@/server/leads/create-lead";
export { getLead } from "@/server/leads/get-lead";
export { updateLead } from "@/server/leads/update-lead";
export { changeStage, type ChangeStageResult } from "@/server/leads/change-stage";
export { softDeleteLead } from "@/server/leads/soft-delete-lead";
export { listLeads, type LeadListItem, type LeadListResult } from "@/server/leads/list-leads";
export { createNote, updateNote, deleteNote, listNotes } from "@/server/leads/notes";
export { createExternalRef, deleteExternalRef } from "@/server/leads/external-refs";
export {
  listLeadSources,
  listLossReasons,
  type ReferenceItem,
} from "@/server/leads/reference-data";

export type { LeadDetailRow, LeadListRow } from "@/server/leads/selectors";
export { STAGE_ORDER, TERMINAL_STAGES, isTerminalStage } from "@/server/leads/stage";
