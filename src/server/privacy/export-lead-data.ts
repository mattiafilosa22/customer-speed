import { NotFoundError } from "@/lib/errors";
import { clockNow, type PrivacyDeps } from "@/server/privacy/deps";

/**
 * GDPR EXPORT for a lead (right of access + portability, art. 15/20,
 * docs/06 §6.5). Collects ALL personal data the tenant holds about one lead and
 * returns it as a structured, self-describing object the caller can serialize to
 * JSON (and offer as a download).
 *
 * Isolation: the tenant-scoped client forces `organizationId`, so a lead id from
 * another tenant simply resolves to nothing → `NotFoundError` (404, non
 * revealing). A tenant can never export another tenant's data.
 *
 * Minimization (docs/06 §6.5): we include only data PERTAINING to this subject —
 * the lead's own fields and its directly-related records (notes, appointments,
 * invoices, external refs, stage history). We deliberately EXCLUDE internal
 * actor ids that are not the subject's personal data (e.g. `changedById`,
 * `authorId`, `ownerId`) and any other lead's data. Invoice amounts ARE the
 * subject's data (they concern the contract with them) and are included.
 */

export interface LeadDataExport {
  readonly format: "customerspeed.lead-export.v1";
  readonly exportedAt: string; // ISO timestamp
  readonly subject: {
    readonly kind: "lead";
    readonly id: string;
  };
  readonly lead: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string | null;
    readonly phone: string | null;
    readonly stage: string;
    readonly capitalBracket: string | null;
    readonly source: string | null;
    readonly adminNotes: string | null;
    readonly createdAt: string;
  };
  readonly notes: ReadonlyArray<{ body: string; createdAt: string }>;
  readonly appointments: ReadonlyArray<{ reason: string; startAt: string; status: string }>;
  readonly invoices: ReadonlyArray<{
    number: string | null;
    grossAmount: string;
    netAmount: string;
    issuedAt: string;
  }>;
  readonly externalReferences: ReadonlyArray<{
    altName: string | null;
    altEmail: string | null;
    source: string | null;
    createdAt: string;
  }>;
  readonly stageHistory: ReadonlyArray<{
    fromStage: string | null;
    toStage: string;
    changedAt: string;
  }>;
}

/**
 * Collect ALL of a subject's personal data, tenant-scoped, as the structured
 * `LeadDataExport`. SINGLE source of truth for the export query + minimization
 * (docs/00 §1 DRY): both the JSON (`exportLeadData`) and the Excel
 * (`exportLeadDataXlsx`) use cases call this, so the two formats can never drift
 * in WHAT data they expose. It does NOT write audit — the caller records the
 * audit with the chosen `format` in the meta, so the trail names the artefact.
 *
 * Isolation: the tenant-scoped client forces `organizationId`, so a foreign lead
 * id resolves to nothing → `NotFoundError` (404, non-revealing).
 */
export async function collectLeadDataForExport(
  deps: PrivacyDeps,
  leadId: string,
): Promise<LeadDataExport> {
  // Single batched read — explicit select, no SELECT *, no N+1 (docs/00 §3).
  const lead = await deps.prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      stage: true,
      capitalBracket: true,
      adminNotes: true,
      createdAt: true,
      source: { select: { label: true } },
      notes: {
        orderBy: { createdAt: "asc" },
        select: { body: true, createdAt: true },
      },
      appointments: {
        orderBy: { startAt: "asc" },
        select: { reason: true, startAt: true, status: true },
      },
      invoices: {
        orderBy: { issuedAt: "asc" },
        select: { number: true, grossAmount: true, netAmount: true, issuedAt: true },
      },
      externalRefs: {
        orderBy: { createdAt: "asc" },
        select: { altName: true, altEmail: true, source: true, createdAt: true },
      },
      stageHistory: {
        orderBy: { changedAt: "asc" },
        select: { fromStage: true, toStage: true, changedAt: true },
      },
    },
  });

  if (!lead) {
    throw new NotFoundError("Lead not found");
  }

  const exportedAt = clockNow(deps).toISOString();

  return {
    format: "customerspeed.lead-export.v1",
    exportedAt,
    subject: { kind: "lead", id: lead.id },
    lead: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      stage: lead.stage,
      capitalBracket: lead.capitalBracket,
      source: lead.source?.label ?? null,
      adminNotes: lead.adminNotes,
      createdAt: lead.createdAt.toISOString(),
    },
    notes: lead.notes.map((n) => ({ body: n.body, createdAt: n.createdAt.toISOString() })),
    appointments: lead.appointments.map((a) => ({
      reason: a.reason,
      startAt: a.startAt.toISOString(),
      status: a.status,
    })),
    invoices: lead.invoices.map((i) => ({
      number: i.number,
      // Decimal → string to preserve precision (never float, docs/00 §3).
      grossAmount: i.grossAmount.toString(),
      netAmount: i.netAmount.toString(),
      issuedAt: i.issuedAt.toISOString(),
    })),
    externalReferences: lead.externalRefs.map((r) => ({
      altName: r.altName,
      altEmail: r.altEmail,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    })),
    stageHistory: lead.stageHistory.map((s) => ({
      fromStage: s.fromStage,
      toStage: s.toStage,
      changedAt: s.changedAt.toISOString(),
    })),
  };
}

/**
 * Build a JSON export for `leadId` in the current tenant. The caller layer
 * enforces RBAC (`lead.exportData`) + tenant context; this use case enforces
 * ownership (via the shared collector) and writes the audit proof.
 */
export async function exportLeadData(
  deps: PrivacyDeps,
  leadId: string,
): Promise<LeadDataExport> {
  const result = await collectLeadDataForExport(deps, leadId);

  // Audit proof (docs/06 §6.4). Record WHAT was exported (counts + format) —
  // never the personal data itself — so the trail is meaningful without
  // re-leaking PII.
  await deps.audit.record({
    action: "gdpr.export",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Lead",
    entityId: result.subject.id,
    meta: {
      subject: "lead",
      format: "json",
      counts: {
        notes: result.notes.length,
        appointments: result.appointments.length,
        invoices: result.invoices.length,
        externalReferences: result.externalReferences.length,
        stageHistory: result.stageHistory.length,
      },
    },
  });

  return result;
}
