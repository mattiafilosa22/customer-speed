/**
 * Public surface of the GDPR privacy / DSR module (Data Subject Requests).
 * UI and Route Handlers import use cases from here; they never reach into Prisma
 * directly (docs/00 §1). Export = right of access/portability; erasure = right
 * to be forgotten (docs/06 §6.5, docs/09 §9.6).
 */
export type { PrivacyActor, PrivacyDeps } from "@/server/privacy/deps";
export { buildExportDeps, buildErasureDeps } from "@/server/privacy/context-deps";
export { exportLeadData, type LeadDataExport } from "@/server/privacy/export-lead-data";
export { eraseLeadData, type EraseLeadResult } from "@/server/privacy/erase-lead-data";
