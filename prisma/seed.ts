import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

import { CapitalBracket, LeadStage, Role } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";

/**
 * Seed — Fase 1.
 *
 * Creates:
 *   - the demo tenant `CustomerSpeed` (Indigo theme, feature flags, default
 *     lead sources + 9 pipeline stage configs),
 *   - a global `superAdmin` user (lives in the demo tenant for FK purposes;
 *     role drives the cross-tenant admin context),
 *   - the `Fabio` tenant (proUser) with `calendarIntegrations=false`, its proUser
 *     (Fabio) and the example leads from the screenshots.
 *
 * Passwords come ONLY from env; in development a documented default is used.
 * NEVER hard-code real secrets. Argon2id hashing (same as the app).
 *
 * Idempotent: upserts on natural keys (slug, [orgId,email], [orgId,label],
 * [orgId,stage]). Example leads are matched by [orgId, email] via findFirst +
 * create to avoid duplicates on re-run.
 *
 * Uses the base PrismaClient (bootstrap context), NOT the tenant extension — it
 * legitimately creates tenants and cross-tenant rows.
 */

const DEMO_SLUG = "customerspeed";
const FABIO_SLUG = "fabio";

// Argon2id variant id (see src/lib/password.ts).
const ARGON2ID = 2;

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

// Example leads from the screenshots, with plausible source/stage/capital.
const FABIO_LEADS: ReadonlyArray<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  stage: LeadStage;
  capitalBracket: CapitalBracket;
  sourceLabel: string;
  adminNotes: string;
}> = [
  {
    firstName: "Annalisa",
    lastName: "Giobbio",
    email: "annalisa.giobbio@example.com",
    phone: "+39 320 1112233",
    stage: LeadStage.WAITING_DECISION,
    capitalBracket: CapitalBracket.B_100_250K,
    sourceLabel: "Instagram",
    adminNotes: "Interessata a una consulenza patrimoniale. In attesa di decisione.",
  },
  {
    firstName: "Andrea",
    lastName: "Carapezza",
    email: "andrea.carapezza@example.com",
    phone: "+39 333 4455667",
    stage: LeadStage.CALL_SCHEDULED,
    capitalBracket: CapitalBracket.B_50_100K,
    sourceLabel: "Funnel",
    adminNotes: "Call conoscitiva schedulata. Profilo prudente.",
  },
  {
    firstName: "Fabrizio",
    lastName: "Checchi",
    email: "fabrizio.checchi@example.com",
    phone: "+39 347 7788990",
    stage: LeadStage.LOST,
    capitalBracket: CapitalBracket.B_0_50K,
    sourceLabel: "Google",
    adminNotes: "Non ha più risposto dopo il primo contatto.",
  },
];

/** Reads a seed password from env, falling back to a documented dev default. */
function seedPassword(envVar: string, devDefault: string): string {
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

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Upserts an Organization + its default lead sources + stage configs. */
async function upsertTenant(
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
async function upsertUser(
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

async function main(): Promise<void> {
  const prisma = createClient();

  try {
    const superAdminPassword = await hash(
      seedPassword("SEED_SUPERADMIN_PASSWORD", "ChangeMe!Admin123"),
      { algorithm: ARGON2ID },
    );
    const fabioPassword = await hash(seedPassword("SEED_FABIO_PASSWORD", "ChangeMe!Fabio123"), {
      algorithm: ARGON2ID,
    });

    // 1) Demo tenant + superAdmin (superAdmin lives in the demo tenant for FK).
    const demo = await upsertTenant(prisma, {
      name: "CustomerSpeed",
      slug: DEMO_SLUG,
      appName: "CustomerSpeed",
      featureFlags: FEATURE_FLAGS,
    });

    const superAdminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@customerspeed.local";
    await upsertUser(prisma, {
      organizationId: demo.id,
      email: superAdminEmail.toLowerCase(),
      name: "Super Admin",
      role: Role.superAdmin,
      passwordHash: superAdminPassword,
    });

    // 2) Fabio tenant (proUser) with calendar integrations OFF.
    const fabioOrg = await upsertTenant(prisma, {
      name: "Fabio Consulting",
      slug: FABIO_SLUG,
      appName: "CustomerSpeed",
      featureFlags: { ...FEATURE_FLAGS, calendarIntegrations: false },
    });

    const fabio = await upsertUser(prisma, {
      organizationId: fabioOrg.id,
      email: "fabio@fabio.local",
      name: "Fabio",
      role: Role.proUser,
      passwordHash: fabioPassword,
    });

    // 3) Example leads for Fabio (idempotent by [orgId, email]).
    const sources = await prisma.leadSource.findMany({
      where: { organizationId: fabioOrg.id },
      select: { id: true, label: true },
    });
    const sourceByLabel = new Map(sources.map((s) => [s.label, s.id]));

    for (const lead of FABIO_LEADS) {
      const existing = await prisma.lead.findFirst({
        where: { organizationId: fabioOrg.id, email: lead.email },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      await prisma.lead.create({
        data: {
          organizationId: fabioOrg.id,
          ownerId: fabio.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          stage: lead.stage,
          capitalBracket: lead.capitalBracket,
          sourceId: sourceByLabel.get(lead.sourceLabel) ?? null,
          adminNotes: lead.adminNotes,
        },
      });
    }

    console.info(
      `Seed completed:\n` +
        `  - demo tenant "${DEMO_SLUG}" + superAdmin (${superAdminEmail})\n` +
        `  - tenant "${FABIO_SLUG}" + proUser Fabio + ${FABIO_LEADS.length} example leads`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
