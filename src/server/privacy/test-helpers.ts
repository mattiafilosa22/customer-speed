import { Prisma } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AppointmentStatus, CapitalBracket, LeadStage } from "@/generated/prisma/enums";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import type { PrivacyDeps } from "@/server/privacy/deps";

/**
 * In-memory fakes for the GDPR DSR use cases (export / erasure).
 *
 * They reproduce the production contract that matters for these tests:
 *  - TENANT ISOLATION: a client is bound to ONE `organizationId`; every read and
 *    write is filtered/stamped to it, so tenant A can never see/touch tenant B.
 *  - SOFT-DELETE default: reads exclude `deletedAt != null` UNLESS the client was
 *    built with `includeSoftDeleted` (mirrors the real extension; the erasure
 *    flow needs the soft-deleted lead to remain visible).
 *  - Only the operations the use cases call are modelled.
 */

export interface PLead {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  stageChangedAt: Date;
  capitalBracket: CapitalBracket | null;
  adminNotes: string | null;
  sourceId: string | null;
  lossReasonId: string | null;
  lossReasonCustomText: string | null;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
}
export interface PNote {
  id: string;
  organizationId: string;
  leadId: string;
  body: string;
  createdAt: Date;
}
export interface PRef {
  id: string;
  organizationId: string;
  leadId: string;
  altName: string | null;
  altEmail: string | null;
  source: string | null;
  createdAt: Date;
}
export interface PAppt {
  id: string;
  organizationId: string;
  leadId: string | null;
  reason: string;
  startAt: Date;
  status: AppointmentStatus;
}
export interface PInvoice {
  id: string;
  organizationId: string;
  leadId: string;
  number: string | null;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  issuedAt: Date;
}
export interface PStageHist {
  id: string;
  organizationId: string;
  leadId: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  changedAt: Date;
}
export interface PSource {
  id: string;
  organizationId: string;
  label: string;
}
export interface POrg {
  id: string;
  leadRetentionMonths: number | null;
}

const D = (s: string) => new Date(s);

export class PrivacyStore {
  leads: PLead[] = [];
  notes: PNote[] = [];
  refs: PRef[] = [];
  appointments: PAppt[] = [];
  invoices: PInvoice[] = [];
  stageHistory: PStageHist[] = [];
  sources: PSource[] = [];
  organizations: POrg[] = [];
  private seq = 0;
  private id(p: string): string {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }

  /** Seeds (or updates) the tenant-root row read by `resolveRetentionMonths`. */
  setOrganization(p: POrg): POrg {
    const existing = this.organizations.find((o) => o.id === p.id);
    if (existing) {
      existing.leadRetentionMonths = p.leadRetentionMonths;
      return existing;
    }
    this.organizations.push(p);
    return p;
  }

  addLead(p: Partial<PLead> & Pick<PLead, "organizationId">): PLead {
    const row: PLead = {
      id: p.id ?? this.id("lead"),
      organizationId: p.organizationId,
      firstName: p.firstName ?? "Mario",
      lastName: p.lastName ?? "Rossi",
      email: p.email ?? "mario@example.com",
      phone: p.phone ?? "+39000",
      stage: p.stage ?? ("WON" as LeadStage),
      stageChangedAt: p.stageChangedAt ?? D("2026-01-01T00:00:00.000Z"),
      capitalBracket: p.capitalBracket ?? null,
      adminNotes: p.adminNotes ?? "nota interna",
      sourceId: p.sourceId ?? null,
      lossReasonId: p.lossReasonId ?? null,
      lossReasonCustomText: p.lossReasonCustomText ?? null,
      deletedAt: p.deletedAt ?? null,
      anonymizedAt: p.anonymizedAt ?? null,
      createdAt: p.createdAt ?? D("2026-01-01T00:00:00.000Z"),
    };
    this.leads.push(row);
    return row;
  }
  addSource(p: Pick<PSource, "organizationId"> & Partial<PSource>): PSource {
    const row: PSource = {
      id: p.id ?? this.id("src"),
      organizationId: p.organizationId,
      label: p.label ?? "Funnel",
    };
    this.sources.push(row);
    return row;
  }
  addNote(p: Pick<PNote, "organizationId" | "leadId"> & Partial<PNote>): PNote {
    const row: PNote = {
      id: p.id ?? this.id("note"),
      organizationId: p.organizationId,
      leadId: p.leadId,
      body: p.body ?? "testo nota",
      createdAt: p.createdAt ?? D("2026-02-01T00:00:00.000Z"),
    };
    this.notes.push(row);
    return row;
  }
  addRef(p: Pick<PRef, "organizationId" | "leadId"> & Partial<PRef>): PRef {
    const row: PRef = {
      id: p.id ?? this.id("ref"),
      organizationId: p.organizationId,
      leadId: p.leadId,
      altName: p.altName ?? "Alt Name",
      altEmail: p.altEmail ?? "alt@example.com",
      source: p.source ?? "legacy",
      createdAt: p.createdAt ?? D("2026-02-02T00:00:00.000Z"),
    };
    this.refs.push(row);
    return row;
  }
  addAppt(p: Pick<PAppt, "organizationId" | "leadId"> & Partial<PAppt>): PAppt {
    const row: PAppt = {
      id: p.id ?? this.id("appt"),
      organizationId: p.organizationId,
      leadId: p.leadId,
      reason: p.reason ?? "Call con Mario Rossi",
      startAt: p.startAt ?? D("2026-03-01T10:00:00.000Z"),
      status: p.status ?? ("PENDING" as AppointmentStatus),
    };
    this.appointments.push(row);
    return row;
  }
  addInvoice(p: Pick<PInvoice, "organizationId" | "leadId"> & Partial<PInvoice>): PInvoice {
    const row: PInvoice = {
      id: p.id ?? this.id("inv"),
      organizationId: p.organizationId,
      leadId: p.leadId,
      number: p.number ?? "2026/001",
      grossAmount: p.grossAmount ?? new Prisma.Decimal("1220.00"),
      netAmount: p.netAmount ?? new Prisma.Decimal("1000.00"),
      issuedAt: p.issuedAt ?? D("2026-04-01T00:00:00.000Z"),
    };
    this.invoices.push(row);
    return row;
  }
  addStageHist(
    p: Pick<PStageHist, "organizationId" | "leadId" | "toStage"> & Partial<PStageHist>,
  ): PStageHist {
    const row: PStageHist = {
      id: p.id ?? this.id("hist"),
      organizationId: p.organizationId,
      leadId: p.leadId,
      fromStage: p.fromStage ?? null,
      toStage: p.toStage,
      changedAt: p.changedAt ?? D("2026-02-15T00:00:00.000Z"),
    };
    this.stageHistory.push(row);
    return row;
  }
  lead(id: string): PLead {
    const r = this.leads.find((l) => l.id === id);
    if (!r) throw new Error(`no lead ${id}`);
    return r;
  }
}

type Where = Record<string, unknown>;

/**
 * Evaluates a Prisma-style `OR: [...]` array of `{ field: { not: value } }`
 * clauses against a lead row — mirrors `listRetentionCandidates`'/
 * `countRetentionCandidates`' `OR: [{ lossReasonId: { not: null } },
 * { lossReasonCustomText: { not: null } }]`. Only the `{ not }` shape is
 * modelled since it's the only one these two use cases emit.
 */
function matchesOrClauses(row: PLead, clauses: Where[]): boolean {
  return clauses.some((clause) =>
    Object.entries(clause).every(([field, cond]) => {
      if (cond && typeof cond === "object" && "not" in cond) {
        return (row as unknown as Record<string, unknown>)[field] !== (cond as { not: unknown }).not;
      }
      return (row as unknown as Record<string, unknown>)[field] === cond;
    }),
  );
}

export function privacyClientFor(
  store: PrivacyStore,
  organizationId: string,
  includeSoftDeleted = false,
): TenantPrismaClient {
  const visibleLead = (l: PLead): boolean =>
    l.organizationId === organizationId && (includeSoftDeleted || l.deletedAt === null);

  const client = {
    lead: {
      findUnique: async ({ where, select }: { where: Where; select?: Where }) => {
        const row = store.leads.find((l) => l.id === where.id && visibleLead(l));
        if (!row) return null;
        // Erasure reads a minimal select ({ id, anonymizedAt }); export reads the
        // full nested select. Populate nested relations only when requested.
        const base: Record<string, unknown> = { ...row };
        if (select?.source) {
          base.source = row.sourceId
            ? (store.sources.find((s) => s.id === row.sourceId) ?? null)
            : null;
        }
        if (select?.notes) {
          base.notes = store.notes
            .filter((n) => n.organizationId === organizationId && n.leadId === row.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((n) => ({ body: n.body, createdAt: n.createdAt }));
        }
        if (select?.appointments) {
          base.appointments = store.appointments
            .filter((a) => a.organizationId === organizationId && a.leadId === row.id)
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
            .map((a) => ({ reason: a.reason, startAt: a.startAt, status: a.status }));
        }
        if (select?.invoices) {
          base.invoices = store.invoices
            .filter((i) => i.organizationId === organizationId && i.leadId === row.id)
            .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
            .map((i) => ({
              number: i.number,
              grossAmount: i.grossAmount,
              netAmount: i.netAmount,
              issuedAt: i.issuedAt,
            }));
        }
        if (select?.externalRefs) {
          base.externalRefs = store.refs
            .filter((r) => r.organizationId === organizationId && r.leadId === row.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((r) => ({
              altName: r.altName,
              altEmail: r.altEmail,
              source: r.source,
              createdAt: r.createdAt,
            }));
        }
        if (select?.stageHistory) {
          base.stageHistory = store.stageHistory
            .filter((s) => s.organizationId === organizationId && s.leadId === row.id)
            .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
            .map((s) => ({ fromStage: s.fromStage, toStage: s.toStage, changedAt: s.changedAt }));
        }
        return base;
      },
      findMany: async ({ where, orderBy }: { where: Where; orderBy?: Where; select?: Where }) => {
        let rows = store.leads.filter((l) => visibleLead(l));
        if (where.stage !== undefined) {
          rows = rows.filter((l) => l.stage === where.stage);
        }
        if (where.lossReasonId && typeof where.lossReasonId === "object") {
          const cond = where.lossReasonId as { not?: unknown };
          if ("not" in cond) rows = rows.filter((l) => l.lossReasonId !== cond.not);
        }
        if (Array.isArray(where.OR)) {
          rows = rows.filter((l) => matchesOrClauses(l, where.OR as Where[]));
        }
        if (where.anonymizedAt !== undefined) {
          rows = rows.filter((l) => l.anonymizedAt === where.anonymizedAt);
        }
        if (where.stageChangedAt && typeof where.stageChangedAt === "object") {
          const cond = where.stageChangedAt as { lte?: Date; gte?: Date };
          if (cond.lte)
            rows = rows.filter((l) => l.stageChangedAt.getTime() <= cond.lte!.getTime());
          if (cond.gte)
            rows = rows.filter((l) => l.stageChangedAt.getTime() >= cond.gte!.getTime());
        }
        if (orderBy?.stageChangedAt) {
          const dir = orderBy.stageChangedAt === "desc" ? -1 : 1;
          rows = [...rows].sort(
            (a, b) => dir * (a.stageChangedAt.getTime() - b.stageChangedAt.getTime()),
          );
        }
        return rows.map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          stageChangedAt: l.stageChangedAt,
        }));
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.leads.find(
          (l) => l.id === where.id && l.organizationId === organizationId,
        );
        if (!row) throw makeP2025();
        if (typeof data.firstName === "string") row.firstName = data.firstName;
        if ("lastName" in data) row.lastName = (data.lastName as string) ?? "";
        if ("email" in data) row.email = (data.email as string | null) ?? null;
        if ("phone" in data) row.phone = (data.phone as string | null) ?? null;
        if ("adminNotes" in data) row.adminNotes = (data.adminNotes as string | null) ?? null;
        if ("anonymizedAt" in data) row.anonymizedAt = (data.anonymizedAt as Date | null) ?? null;
        if ("deletedAt" in data) row.deletedAt = (data.deletedAt as Date | null) ?? null;
        return { id: row.id };
      },
      // DB-aggregated count for `countRetentionCandidates` — same filter
      // predicates as `findMany` above, kept in sync manually (small, stable
      // criteria; see `list-retention-candidates.ts` for the source of truth).
      count: async ({ where }: { where: Where }) => {
        let rows = store.leads.filter((l) => visibleLead(l));
        if (where.stage !== undefined) {
          rows = rows.filter((l) => l.stage === where.stage);
        }
        if (where.lossReasonId && typeof where.lossReasonId === "object") {
          const cond = where.lossReasonId as { not?: unknown };
          if ("not" in cond) rows = rows.filter((l) => l.lossReasonId !== cond.not);
        }
        if (Array.isArray(where.OR)) {
          rows = rows.filter((l) => matchesOrClauses(l, where.OR as Where[]));
        }
        if (where.anonymizedAt !== undefined) {
          rows = rows.filter((l) => l.anonymizedAt === where.anonymizedAt);
        }
        if (where.stageChangedAt && typeof where.stageChangedAt === "object") {
          const cond = where.stageChangedAt as { lte?: Date; gte?: Date };
          if (cond.lte)
            rows = rows.filter((l) => l.stageChangedAt.getTime() <= cond.lte!.getTime());
          if (cond.gte)
            rows = rows.filter((l) => l.stageChangedAt.getTime() >= cond.gte!.getTime());
        }
        return rows.length;
      },
    },
    organization: {
      // `Organization` is the tenant ROOT (not tenant-scoped by the real
      // extension either), so this fake — like production — matches on `id`
      // alone; callers are responsible for passing the actor's own org id.
      findUnique: async ({ where, select }: { where: Where; select?: Where }) => {
        const row = store.organizations.find((o) => o.id === where.id);
        if (!row) return null;
        if (!select) return row;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select))
          out[key] = (row as unknown as Record<string, unknown>)[key];
        return out;
      },
    },
    note: {
      deleteMany: async ({ where }: { where: Where }) => {
        const before = store.notes.length;
        store.notes = store.notes.filter(
          (n) => !(n.organizationId === organizationId && n.leadId === where.leadId),
        );
        return { count: before - store.notes.length };
      },
    },
    externalCrmRef: {
      deleteMany: async ({ where }: { where: Where }) => {
        const before = store.refs.length;
        store.refs = store.refs.filter(
          (r) => !(r.organizationId === organizationId && r.leadId === where.leadId),
        );
        return { count: before - store.refs.length };
      },
    },
    appointment: {
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const rows = store.appointments.filter(
          (a) => a.organizationId === organizationId && a.leadId === where.leadId,
        );
        for (const a of rows) {
          if ("reason" in data) a.reason = (data.reason as string) ?? "";
        }
        return { count: rows.length };
      },
    },
    // Callback-form transaction: run the body against this same fake client so
    // the erasure use case's atomic block executes as a unit.
    $transaction: (async (
      arg: ((tx: TenantPrismaClient) => Promise<unknown>) | Promise<unknown>[],
    ): Promise<unknown> => {
      if (typeof arg === "function") {
        return arg(client as unknown as TenantPrismaClient);
      }
      const results = [];
      for (const op of arg) results.push(await op);
      return results;
    }) as unknown as TenantPrismaClient["$transaction"],
  };

  return client as unknown as TenantPrismaClient;
}

export function collectingAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

export function buildExportFake(
  store: PrivacyStore,
  organizationId: string,
  userId = "user_1",
  now: Date = D("2026-06-19T12:00:00.000Z"),
): { deps: PrivacyDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  return {
    deps: {
      prisma: privacyClientFor(store, organizationId, false),
      audit: collectingAudit(audits),
      actor: { organizationId, userId },
      now: () => now,
    },
    audits,
  };
}

export function buildErasureFake(
  store: PrivacyStore,
  organizationId: string,
  userId = "user_1",
  now: Date = D("2026-06-19T12:00:00.000Z"),
): { deps: PrivacyDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  return {
    deps: {
      prisma: privacyClientFor(store, organizationId, true),
      audit: collectingAudit(audits),
      actor: { organizationId, userId },
      now: () => now,
    },
    audits,
  };
}

function makeP2025(): Error {
  const err = new Error("Record to update not found.") as Error & { code: string };
  err.code = "P2025";
  err.name = "PrismaClientKnownRequestError";
  return err;
}
