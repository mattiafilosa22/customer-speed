import { PrismaPg } from "@prisma/adapter-pg";

import { LeadStage, Role } from "../src/generated/prisma/enums";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

/**
 * Reusable, SIDE-EFFECT-FREE tenant provisioning helpers.
 *
 * Extracted from `seed.ts` so both the full demo seed AND one-off provisioning
 * scripts (e.g. `scripts/provision-tenant-owner.ts`, used to create a real
 * production tenant + owner WITHOUT demo data) share the EXACT same structural
 * configuration — theme, feature flags, default lead sources, loss reasons and
 * pipeline stage configs — with zero drift. Importing this module must NOT run
 * anything (no top-level `main()`), unlike `seed.ts`.
 */

/** @node-rs/argon2 algorithm id for Argon2id. */
export const ARGON2ID = 2;

export const INDIGO_THEME = {
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
    muted: "#6e6e79",
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
  // Component-style switches (docs/05 §5.4, Fase 7).
  buttonStyle: "filled",
  density: "comfortable",
  softShadows: true,
} satisfies Prisma.InputJsonObject;

export const FEATURE_FLAGS = {
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

// Default loss reasons per tenant (docs/02 §2.5: "Vendite perse" needs reasons).
// Required so the "move to LOST" flow always has at least one selectable reason.
export const DEFAULT_LOSS_REASONS: readonly string[] = [
  "Non ha più risposto",
  "Budget insufficiente",
  "Ha scelto un concorrente",
  "Non interessato",
];

export const PIPELINE_STAGES: ReadonlyArray<{
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

/**
 * Resolve a password from an env var. In production the env var is MANDATORY
 * (no dev default leaks a weak password); locally it falls back to a documented
 * dev default with a loud warning.
 */
export function seedPassword(envVar: string, devDefault: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envVar} must be set when seeding in production (no dev default allowed).`);
  }
  console.warn(
    `[seed] ${envVar} not set — using documented DEV default. Do NOT use in production.`,
  );
  return devDefault;
}

export function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Upserts an Organization + its default lead sources, loss reasons and stage configs. */
export async function upsertTenant(
  prisma: PrismaClient,
  params: {
    name: string;
    slug: string;
    appName: string;
    featureFlags: Prisma.InputJsonObject;
  },
): Promise<{ id: string }> {
  const organization = await prisma.organization.upsert({
    where: { slug: params.slug },
    update: { appName: params.appName, theme: INDIGO_THEME, featureFlags: params.featureFlags },
    create: {
      name: params.name,
      slug: params.slug,
      appName: params.appName,
      theme: INDIGO_THEME,
      featureFlags: params.featureFlags,
    },
    select: { id: true },
  });

  await Promise.all(
    DEFAULT_LEAD_SOURCES.map((src) =>
      prisma.leadSource.upsert({
        where: { organizationId_label: { organizationId: organization.id, label: src.label } },
        update: { sortOrder: src.sortOrder, isActive: true },
        create: { organizationId: organization.id, label: src.label, sortOrder: src.sortOrder },
      }),
    ),
  );

  await Promise.all(
    DEFAULT_LOSS_REASONS.map((label) =>
      prisma.lossReason.upsert({
        where: { organizationId_label: { organizationId: organization.id, label } },
        update: {},
        create: { organizationId: organization.id, label },
      }),
    ),
  );

  await Promise.all(
    PIPELINE_STAGES.map((cfg) =>
      prisma.pipelineStageConfig.upsert({
        where: { organizationId_stage: { organizationId: organization.id, stage: cfg.stage } },
        update: { isVisible: true, sortOrder: cfg.sortOrder, colorToken: cfg.colorToken },
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

  return organization;
}

/** Upserts a user with a hashed password and verified email. */
export async function upsertUser(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    email: string;
    name: string;
    role: Role;
    passwordHash: string;
  },
): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { organizationId_email: { organizationId: params.organizationId, email: params.email } },
    update: { name: params.name, role: params.role, isActive: true },
    create: {
      organizationId: params.organizationId,
      email: params.email,
      name: params.name,
      role: params.role,
      passwordHash: params.passwordHash,
      emailVerified: new Date(),
      isActive: true,
    },
    select: { id: true },
  });
}
