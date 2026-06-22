import { hash } from "@node-rs/argon2";

import {
  AppointmentStatus,
  CapitalBracket,
  LeadStage,
  Role,
} from "../src/generated/prisma/enums";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  ARGON2ID,
  FEATURE_FLAGS,
  createClient,
  seedPassword,
  upsertTenant,
  upsertUser,
} from "./seed-helpers";

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

/**
 * Dedicated, READ-ONLY tenant for the dashboard KPI e2e (`tests/dashboard.spec.ts`).
 *
 * Rationale (Fase 8 hardening — e2e data isolation): the dashboard KPI assertions
 * depend on EXACT lead/invoice counts (4 leads, 1 won, 25% conversion, 5.000 €).
 * Fabio is mutated by the leads/pipeline/appointments specs (which create leads
 * and move stages), so asserting absolute KPIs against Fabio is order-dependent
 * and pollutes across a shared DB. This tenant owns the same fixed dataset as
 * Fabio's baseline but is touched by NO mutating spec, so the KPI assertions are
 * deterministic regardless of execution order or parallelism.
 */
const KPI_SLUG = "kpidemo";
const KPI_EMAIL = "kpi@kpidemo.local";

// Example leads from the screenshots, with plausible source/stage/capital.
const FABIO_LEADS: ReadonlyArray<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  stage: LeadStage;
  capitalBracket: CapitalBracket;
  /** Importo esatto (€) in alternativa alla fascia; la fascia ne è la derivazione. */
  capitalAmount?: number;
  sourceLabel: string;
  adminNotes: string;
}> = [
  {
    firstName: "Annalisa",
    lastName: "Giobbio",
    email: "annalisa.giobbio@example.com",
    phone: "+39 320 1112233",
    stage: LeadStage.WAITING_DECISION,
    // Capitale impostato come IMPORTO ESATTO (175.000 €): la fascia B_100_250K è
    // la derivazione coerente. Mostra in UI la cifra anziché la fascia.
    capitalBracket: CapitalBracket.B_100_250K,
    capitalAmount: 175_000,
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
  {
    firstName: "Giulia",
    lastName: "Rossi",
    email: "giulia.rossi@example.com",
    phone: "+39 351 2233445",
    stage: LeadStage.WON,
    capitalBracket: CapitalBracket.B_250_500K,
    sourceLabel: "Referenza",
    adminNotes: "Contratto firmato. Cliente acquisito.",
  },
];

/**
 * Example invoice for the WON lead, so the dashboard "Fatturato netto" KPI and
 * "Riepilogo fatture" block have non-zero, deterministic data for the e2e.
 * Issued in the current year so the default (current-year) period includes it.
 */
const FABIO_INVOICE = {
  leadEmail: "giulia.rossi@example.com",
  number: "2026-001",
  grossAmount: "6100.00",
  netAmount: "5000.00",
} as const;

/**
 * Example appointments for Fabio (docs/08 Fase 5), linked to existing leads so
 * the agenda + mini-calendar have deterministic data for the UI/e2e. `daysFromNow`
 * keeps them in the current month (so the mini-calendar default view highlights
 * them); the times are at 09:00/15:00 local. Idempotent by [orgId, leadEmail,
 * reason]. One DONE and one PENDING so both filter tabs are non-empty.
 */
const FABIO_APPOINTMENTS: ReadonlyArray<{
  leadEmail: string;
  reason: string;
  daysFromNow: number;
  hour: number;
  status: AppointmentStatus;
}> = [
  {
    leadEmail: "andrea.carapezza@example.com",
    reason: "Call conoscitiva",
    daysFromNow: 2,
    hour: 9,
    status: AppointmentStatus.PENDING,
  },
  {
    leadEmail: "annalisa.giobbio@example.com",
    reason: "Presentazione proposta",
    daysFromNow: -3,
    hour: 15,
    status: AppointmentStatus.DONE,
  },
];

/** A `Date` at `hour:00` local time, `daysFromNow` from today (00:00 baseline). */
function appointmentDate(daysFromNow: number, hour: number): Date {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

/**
 * Idempotently seeds the example leads + the WON-lead invoice for a tenant.
 * Extracted so the Fabio tenant and the read-only KPI tenant share the EXACT
 * same baseline dataset (4 leads — 1 WON, 1 LOST, 2 active — + 1 invoice with
 * net 5.000 €), guaranteeing identical dashboard KPIs.
 */
async function seedLeadsAndInvoice(
  prisma: PrismaClient,
  organizationId: string,
  ownerId: string,
): Promise<void> {
  const sources = await prisma.leadSource.findMany({
    where: { organizationId },
    select: { id: true, label: true },
  });
  const sourceByLabel = new Map(sources.map((s) => [s.label, s.id]));

  for (const lead of FABIO_LEADS) {
    const existing = await prisma.lead.findFirst({
      where: { organizationId, email: lead.email },
      select: { id: true },
    });
    if (existing) {
      continue;
    }
    await prisma.lead.create({
      data: {
        organizationId,
        ownerId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        stage: lead.stage,
        capitalBracket: lead.capitalBracket,
        capitalAmount: lead.capitalAmount ?? null,
        sourceId: sourceByLabel.get(lead.sourceLabel) ?? null,
        adminNotes: lead.adminNotes,
      },
    });
  }

  const wonLead = await prisma.lead.findFirst({
    where: { organizationId, email: FABIO_INVOICE.leadEmail },
    select: { id: true },
  });
  if (wonLead) {
    const existingInvoice = await prisma.invoice.findFirst({
      where: { organizationId, leadId: wonLead.id, number: FABIO_INVOICE.number },
      select: { id: true },
    });
    if (!existingInvoice) {
      await prisma.invoice.create({
        data: {
          organizationId,
          leadId: wonLead.id,
          number: FABIO_INVOICE.number,
          grossAmount: new Prisma.Decimal(FABIO_INVOICE.grossAmount),
          netAmount: new Prisma.Decimal(FABIO_INVOICE.netAmount),
          // Issued today so the current-year default period includes it.
          issuedAt: new Date(),
        },
      });
    }
  }
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

    // 3) Example leads for Fabio + the WON-lead invoice (idempotent).
    await seedLeadsAndInvoice(prisma, fabioOrg.id, fabio.id);

    // 3b) Read-only KPI tenant: same baseline dataset as Fabio, but touched by
    //     NO mutating spec → deterministic dashboard KPIs for the e2e (Fase 8
    //     e2e data isolation). proUser, calendar integrations OFF (irrelevant).
    const kpiOrg = await upsertTenant(prisma, {
      name: "KPI Demo",
      slug: KPI_SLUG,
      appName: "CustomerSpeed",
      featureFlags: { ...FEATURE_FLAGS, calendarIntegrations: false },
    });
    const kpiUser = await upsertUser(prisma, {
      organizationId: kpiOrg.id,
      email: KPI_EMAIL,
      name: "KPI Demo",
      role: Role.proUser,
      passwordHash: fabioPassword,
    });
    await seedLeadsAndInvoice(prisma, kpiOrg.id, kpiUser.id);

    // 5) Example appointments for Fabio (idempotent by [orgId, leadEmail, reason]).
    for (const appt of FABIO_APPOINTMENTS) {
      const lead = await prisma.lead.findFirst({
        where: { organizationId: fabioOrg.id, email: appt.leadEmail },
        select: { id: true },
      });
      if (!lead) {
        continue;
      }
      const existing = await prisma.appointment.findFirst({
        where: { organizationId: fabioOrg.id, leadId: lead.id, reason: appt.reason },
        select: { id: true },
      });
      if (existing) {
        continue;
      }
      await prisma.appointment.create({
        data: {
          organizationId: fabioOrg.id,
          leadId: lead.id,
          ownerId: fabio.id,
          startAt: appointmentDate(appt.daysFromNow, appt.hour),
          reason: appt.reason,
          status: appt.status,
        },
      });
    }

    console.info(
      `Seed completed:\n` +
        `  - demo tenant "${DEMO_SLUG}" + superAdmin (${superAdminEmail})\n` +
        `  - tenant "${FABIO_SLUG}" + proUser Fabio + ${FABIO_LEADS.length} example leads\n` +
        `  - read-only tenant "${KPI_SLUG}" (${KPI_EMAIL}) + ${FABIO_LEADS.length} KPI leads\n` +
        `  - ${FABIO_APPOINTMENTS.length} example appointments`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
