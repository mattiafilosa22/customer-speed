import { LeadStage } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { INDIGO_THEME } from "@/lib/theme";

/**
 * Default per-tenant configuration applied when the superAdmin provisions a new
 * organization (docs/08 Fase 7). Mirrors `prisma/seed.ts` so a tenant created
 * from the admin UI is configured identically to a seeded one (DRY: same theme,
 * feature flags, lead sources, loss reasons and 11 pipeline stages).
 */

/** Default theme = the Indigo preset (docs/05 §5.3). Stored as JSON. */
export const DEFAULT_THEME = INDIGO_THEME as unknown as Prisma.InputJsonObject;

/** Default feature flags: all core modules on, calendar integrations OFF. */
export const DEFAULT_FEATURE_FLAGS = {
  leads: true,
  pipeline: true,
  dashboard: true,
  appointments: true,
  invoices: true,
  calendarIntegrations: false,
} satisfies Prisma.InputJsonObject;

export const DEFAULT_LEAD_SOURCES: ReadonlyArray<{ label: string; sortOrder: number }> = [
  { label: "Funnel", sortOrder: 0 },
  { label: "Instagram", sortOrder: 1 },
  { label: "Referenza", sortOrder: 2 },
  { label: "Google", sortOrder: 3 },
];

export const DEFAULT_LOSS_REASONS: readonly string[] = [
  "Non ha più risposto",
  "Budget insufficiente",
  "Ha scelto un concorrente",
  "Non interessato",
];

export const DEFAULT_PIPELINE_STAGES: ReadonlyArray<{
  stage: LeadStage;
  sortOrder: number;
  colorToken: string;
}> = [
  { stage: LeadStage.TO_HANDLE, sortOrder: 0, colorToken: "--stage-to-handle" },
  { stage: LeadStage.TAKEN, sortOrder: 1, colorToken: "--stage-taken" },
  { stage: LeadStage.CALL_SCHEDULED, sortOrder: 2, colorToken: "--stage-call-scheduled" },
  { stage: LeadStage.WAITING_DOCS, sortOrder: 3, colorToken: "--stage-waiting-docs" },
  { stage: LeadStage.PRESENTATION_CALL, sortOrder: 4, colorToken: "--stage-presentation" },
  { stage: LeadStage.PRESENTATION_CALL_2, sortOrder: 5, colorToken: "--stage-presentation-2" },
  { stage: LeadStage.WAITING_DECISION, sortOrder: 6, colorToken: "--stage-waiting-decision" },
  { stage: LeadStage.STANDBY, sortOrder: 7, colorToken: "--stage-standby" },
  { stage: LeadStage.WAITING_PAYMENT, sortOrder: 8, colorToken: "--stage-waiting-payment" },
  { stage: LeadStage.WON, sortOrder: 9, colorToken: "--stage-won" },
  { stage: LeadStage.LOST, sortOrder: 10, colorToken: "--stage-lost" },
];
