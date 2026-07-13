/**
 * Public surface of the GDPR privacy / DSR module (Data Subject Requests).
 * UI and Route Handlers import use cases from here; they never reach into Prisma
 * directly (docs/00 §1). Export = right of access/portability; erasure = right
 * to be forgotten (docs/06 §6.5, docs/09 §9.6).
 */
export type { PrivacyActor, PrivacyDeps } from "@/server/privacy/deps";
export { buildExportDeps, buildErasureDeps } from "@/server/privacy/context-deps";
export {
  exportLeadData,
  collectLeadDataForExport,
  type LeadDataExport,
} from "@/server/privacy/export-lead-data";
export {
  exportLeadDataXlsx,
  type LeadDataXlsxExport,
} from "@/server/privacy/export-lead-data-xlsx";
export { eraseLeadData, type EraseLeadResult } from "@/server/privacy/erase-lead-data";
export {
  listRetentionCandidates,
  type RetentionCandidate,
} from "@/server/privacy/list-retention-candidates";
export {
  exportRetentionCandidates,
  type RetentionBulkExport,
} from "@/server/privacy/export-retention-candidates";
export {
  purgeRetentionCandidates,
  type RetentionPurgeResult,
} from "@/server/privacy/purge-retention-candidates";
export {
  countRetentionCandidates,
  type RetentionCandidatesCount,
} from "@/server/privacy/count-retention-candidates";
export { resolveRetentionMonths } from "@/server/privacy/retention-months";
export {
  retentionMonthsOverrideSchema,
  purgeRetentionCandidatesSchema,
} from "@/server/privacy/schemas";
export type { PurgeRetentionCandidatesInput } from "@/server/privacy/schemas";
