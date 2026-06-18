import { PrismaPg } from "@prisma/adapter-pg";

import { LeadStage } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

/**
 * Seed — Fase 0.
 *
 * Creates ONLY the demo tenant `CustomerSpeed`:
 *   - Organization (Indigo theme, feature flags)
 *   - 4 default LeadSource (Funnel, Instagram, Referenza, Google)
 *   - 9 PipelineStageConfig (one per LeadStage, all visible)
 *
 * Out of scope here (→ Fase 1, needs password hashing): superAdmin, Fabio,
 * example users/leads.
 *
 * Idempotent: re-running upserts on natural keys (slug, [orgId,label],
 * [orgId,stage]) so it can run repeatedly without duplicates.
 *
 * The seed uses the base PrismaClient directly (bootstrap context), NOT the
 * tenant extension — it legitimately creates the tenant itself.
 */

const DEMO_SLUG = "customerspeed";

// Indigo preset (docs/05 §5.3 / §5.5). Full theme object, not just the primary.
const INDIGO_THEME = {
  preset: "indigo",
  mode: "light",
  radius: 12,
  fonts: {
    display: "Bebas Neue",
    body: "Montserrat",
    mono: "IBM Plex Mono",
  },
  colors: {
    accent: "#5b5bd6",
    accentInk: "#4a48c4",
    bg: "#f7f7f9",
    panel: "#ffffff",
    ink: "#1c1c22",
    muted: "#8c8c97",
    line: "#ececef",
    line2: "#f3f3f5",
    ok: "#16a34a",
    warn: "#d97706",
    doc: "#0d9488",
    exec: "#db2777",
  },
  stageColors: {
    TO_HANDLE: "#8c8c97",
    TAKEN: "#5b5bd6",
    CALL_SCHEDULED: "#0ea5e9",
    WAITING_DOCS: "#d97706",
    PRESENTATION_CALL: "#7a4e9e",
    WAITING_DECISION: "#db2777",
    WAITING_PAYMENT: "#0d9488",
    WON: "#16a34a",
    LOST: "#e5533b",
  },
} satisfies Prisma.InputJsonObject;

const FEATURE_FLAGS = {
  leads: true,
  pipeline: true,
  dashboard: true,
  appointments: true,
  invoices: true,
  calendarIntegrations: false,
} satisfies Prisma.InputJsonObject;

const DEFAULT_LEAD_SOURCES: ReadonlyArray<{ label: string; sortOrder: number }> = [
  { label: "Funnel", sortOrder: 0 },
  { label: "Instagram", sortOrder: 1 },
  { label: "Referenza", sortOrder: 2 },
  { label: "Google", sortOrder: 3 },
];

// 9 stages in pipeline order, with the dedicated color tokens from docs/05 §5.3.
const PIPELINE_STAGES: ReadonlyArray<{
  stage: LeadStage;
  sortOrder: number;
  colorToken: string;
}> = [
  { stage: LeadStage.TO_HANDLE, sortOrder: 0, colorToken: "--stage-to-handle" },
  { stage: LeadStage.TAKEN, sortOrder: 1, colorToken: "--stage-taken" },
  { stage: LeadStage.CALL_SCHEDULED, sortOrder: 2, colorToken: "--stage-call-scheduled" },
  { stage: LeadStage.WAITING_DOCS, sortOrder: 3, colorToken: "--stage-waiting-docs" },
  { stage: LeadStage.PRESENTATION_CALL, sortOrder: 4, colorToken: "--stage-presentation" },
  { stage: LeadStage.WAITING_DECISION, sortOrder: 5, colorToken: "--stage-waiting-decision" },
  { stage: LeadStage.WAITING_PAYMENT, sortOrder: 6, colorToken: "--stage-waiting-payment" },
  { stage: LeadStage.WON, sortOrder: 7, colorToken: "--stage-won" },
  { stage: LeadStage.LOST, sortOrder: 8, colorToken: "--stage-lost" },
];

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function main(): Promise<void> {
  const prisma = createClient();

  try {
    const organization = await prisma.organization.upsert({
      where: { slug: DEMO_SLUG },
      update: {
        appName: "CustomerSpeed",
        theme: INDIGO_THEME,
        featureFlags: FEATURE_FLAGS,
      },
      create: {
        name: "CustomerSpeed",
        slug: DEMO_SLUG,
        appName: "CustomerSpeed",
        theme: INDIGO_THEME,
        featureFlags: FEATURE_FLAGS,
      },
    });

    // Default lead sources — upsert on the [organizationId, label] unique key.
    await Promise.all(
      DEFAULT_LEAD_SOURCES.map((src) =>
        prisma.leadSource.upsert({
          where: {
            organizationId_label: {
              organizationId: organization.id,
              label: src.label,
            },
          },
          update: { sortOrder: src.sortOrder, isActive: true },
          create: {
            organizationId: organization.id,
            label: src.label,
            sortOrder: src.sortOrder,
          },
        }),
      ),
    );

    // Pipeline stage config — upsert on the [organizationId, stage] unique key.
    await Promise.all(
      PIPELINE_STAGES.map((cfg) =>
        prisma.pipelineStageConfig.upsert({
          where: {
            organizationId_stage: {
              organizationId: organization.id,
              stage: cfg.stage,
            },
          },
          update: {
            isVisible: true,
            sortOrder: cfg.sortOrder,
            colorToken: cfg.colorToken,
          },
          create: {
            organizationId: organization.id,
            stage: cfg.stage,
            isVisible: true,
            sortOrder: cfg.sortOrder,
            colorToken: cfg.colorToken,
          },
        }),
      ),
    );

    console.info(
      `Seed completed: tenant "${organization.appName}" (${organization.slug}) ` +
        `with ${DEFAULT_LEAD_SOURCES.length} lead sources and ${PIPELINE_STAGES.length} stage configs.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
