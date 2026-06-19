import { Prisma } from "@/generated/prisma/client";
import { LeadStage } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import type { DashboardDeps } from "@/server/dashboard/deps";
import type { InvoiceDeps } from "@/server/invoices/deps";

/**
 * In-memory fakes for the dashboard + invoice use cases.
 *
 * The contract reproduced here is TENANT ISOLATION (docs/00 §3, mirrors
 * `applyTenantScope`): a client is bound to ONE `organizationId`, every read is
 * filtered to it (AND soft-deleted leads are excluded), and every write stamps
 * it. Rows live in a shared `DashboardStore` so a test can seed another tenant's
 * data and assert it is invisible. Only the operations these use cases call are
 * modelled — `lead.groupBy/findMany`, `invoice.aggregate/findMany/create/delete/
 * findUnique`, `pipelineStageConfig.findMany`, `lossReason.findMany`.
 *
 * Amounts are stored as `Prisma.Decimal` so the aggregate SUM is exact (no float
 * drift), exactly like the real DB column `Decimal(12,2)`.
 */

export interface DLeadRow {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  stage: LeadStage;
  stageChangedAt: Date;
  lossReasonId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface DInvoiceRow {
  id: string;
  organizationId: string;
  leadId: string;
  number: string | null;
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  issuedAt: Date;
  createdAt: Date;
}

export interface DStageConfigRow {
  id: string;
  organizationId: string;
  stage: LeadStage;
  isVisible: boolean;
  sortOrder: number;
}

export interface DLossReasonRow {
  id: string;
  organizationId: string;
  label: string;
}

const STAGE_ORDER: readonly LeadStage[] = [
  LeadStage.TO_HANDLE,
  LeadStage.TAKEN,
  LeadStage.CALL_SCHEDULED,
  LeadStage.WAITING_DOCS,
  LeadStage.PRESENTATION_CALL,
  LeadStage.WAITING_DECISION,
  LeadStage.WAITING_PAYMENT,
  LeadStage.WON,
  LeadStage.LOST,
];

export class DashboardStore {
  leads: DLeadRow[] = [];
  invoices: DInvoiceRow[] = [];
  stageConfigs: DStageConfigRow[] = [];
  lossReasons: DLossReasonRow[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addLead(partial: Partial<DLeadRow> & Pick<DLeadRow, "organizationId">): DLeadRow {
    const createdAt = partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z");
    const row: DLeadRow = {
      id: partial.id ?? this.nextId("lead"),
      organizationId: partial.organizationId,
      firstName: partial.firstName ?? "Test",
      lastName: partial.lastName ?? "Lead",
      email: partial.email ?? null,
      stage: partial.stage ?? LeadStage.TO_HANDLE,
      stageChangedAt: partial.stageChangedAt ?? createdAt,
      lossReasonId: partial.lossReasonId ?? null,
      deletedAt: partial.deletedAt ?? null,
      createdAt,
    };
    this.leads.push(row);
    return row;
  }

  addInvoice(
    partial: Omit<Partial<DInvoiceRow>, "grossAmount" | "netAmount"> &
      Pick<DInvoiceRow, "organizationId" | "leadId"> & {
        grossAmount: Prisma.Decimal | string | number;
        netAmount: Prisma.Decimal | string | number;
      },
  ): DInvoiceRow {
    const row: DInvoiceRow = {
      id: partial.id ?? this.nextId("inv"),
      organizationId: partial.organizationId,
      leadId: partial.leadId,
      number: partial.number ?? null,
      grossAmount: new Prisma.Decimal(partial.grossAmount),
      netAmount: new Prisma.Decimal(partial.netAmount),
      issuedAt: partial.issuedAt ?? new Date("2026-06-01T00:00:00.000Z"),
      createdAt: partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z"),
    };
    this.invoices.push(row);
    return row;
  }

  addLossReason(
    partial: Partial<DLossReasonRow> & Pick<DLossReasonRow, "organizationId" | "label">,
  ): DLossReasonRow {
    const row: DLossReasonRow = {
      id: partial.id ?? this.nextId("loss"),
      organizationId: partial.organizationId,
      label: partial.label,
    };
    this.lossReasons.push(row);
    return row;
  }

  /** Seed the canonical 9 stage configs (all visible) for a tenant. */
  seedStageConfigs(organizationId: string): void {
    STAGE_ORDER.forEach((stage, index) => {
      this.stageConfigs.push({
        id: this.nextId("cfg"),
        organizationId,
        stage,
        isVisible: true,
        sortOrder: index,
      });
    });
  }

  invoice(index = 0): DInvoiceRow {
    const row = this.invoices[index];
    if (!row) throw new Error(`no invoice at index ${index}`);
    return row;
  }
}

type Where = Record<string, unknown>;

function inDateRange(value: Date, range: { gte?: Date; lt?: Date }): boolean {
  if (range.gte && value < range.gte) return false;
  if (range.lt && value >= range.lt) return false;
  return true;
}

function leadMatches(lead: DLeadRow, where: Where): boolean {
  // Soft-deleted leads are excluded by the scoped client unless explicitly asked.
  if (!("deletedAt" in where) && lead.deletedAt !== null) return false;
  if ("deletedAt" in where && where.deletedAt === null && lead.deletedAt !== null) return false;

  if (where.stage !== undefined) {
    const cond = where.stage;
    if (typeof cond === "object" && cond !== null) {
      if ("in" in cond && !(cond as { in: LeadStage[] }).in.includes(lead.stage)) return false;
      if ("notIn" in cond && (cond as { notIn: LeadStage[] }).notIn.includes(lead.stage))
        return false;
    } else if (lead.stage !== cond) {
      return false;
    }
  }
  if (where.createdAt && typeof where.createdAt === "object") {
    if (!inDateRange(lead.createdAt, where.createdAt as { gte?: Date; lt?: Date })) return false;
  }
  return true;
}

/**
 * Build a tenant-scoped fake bound to `organizationId`, backed by the shared
 * store. Mirrors the real extension's scoping/soft-delete contract for the
 * operations the dashboard + invoice use cases call.
 */
export function dashboardClientFor(
  store: DashboardStore,
  organizationId: string,
): TenantPrismaClient {
  const ownLeads = (): DLeadRow[] => store.leads.filter((l) => l.organizationId === organizationId);
  const ownInvoices = (): DInvoiceRow[] =>
    store.invoices.filter((i) => i.organizationId === organizationId);

  const invoiceLead = (invoice: DInvoiceRow): DLeadRow | undefined =>
    store.leads.find((l) => l.id === invoice.leadId && l.organizationId === organizationId);

  const invoiceMatches = (invoice: DInvoiceRow, where: Where): boolean => {
    if (where.issuedAt && typeof where.issuedAt === "object") {
      if (!inDateRange(invoice.issuedAt, where.issuedAt as { gte?: Date; lt?: Date })) return false;
    }
    if (where.leadId !== undefined && invoice.leadId !== where.leadId) return false;
    if (where.id !== undefined && invoice.id !== where.id) return false;
    // Relation filter: { lead: { is: { stage } } }
    const leadFilter = where.lead as { is?: { stage?: LeadStage } } | undefined;
    if (leadFilter?.is?.stage !== undefined) {
      const lead = invoiceLead(invoice);
      if (!lead || lead.stage !== leadFilter.is.stage) return false;
    }
    return true;
  };

  const client = {
    lead: {
      groupBy: async ({
        by,
        where = {},
      }: {
        by: string[];
        where?: Where;
      }) => {
        const rows = ownLeads().filter((l) => leadMatches(l, where));
        const key = by[0] as "stage" | "lossReasonId";
        const counts = new Map<unknown, number>();
        for (const lead of rows) {
          const value = lead[key];
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return [...counts.entries()].map(([value, n]) => ({
          [key]: value,
          _count: { _all: n },
        }));
      },
      findMany: async ({
        where = {},
        orderBy,
        take,
      }: {
        where?: Where;
        orderBy?: Record<string, "asc" | "desc">;
        take?: number;
      }) => {
        let rows = ownLeads().filter((l) => leadMatches(l, where));
        if (orderBy) {
          const [field, dir] = Object.entries(orderBy)[0] ?? ["stageChangedAt", "asc"];
          rows = [...rows].sort((a, b) => {
            const av = (a as unknown as Record<string, Date>)[field]?.getTime() ?? 0;
            const bv = (b as unknown as Record<string, Date>)[field]?.getTime() ?? 0;
            return dir === "asc" ? av - bv : bv - av;
          });
        }
        const sliced = take === undefined ? rows : rows.slice(0, take);
        return sliced.map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          stage: l.stage,
          stageChangedAt: l.stageChangedAt,
        }));
      },
      findUnique: async ({ where }: { where: Where }) => {
        const row = ownLeads().find((l) => l.id === where.id && l.deletedAt === null);
        return row ? { id: row.id, stage: row.stage } : null;
      },
    },
    invoice: {
      aggregate: async ({
        where = {},
        _count,
        _sum,
      }: {
        where?: Where;
        _count?: { _all?: boolean };
        _sum?: { grossAmount?: boolean; netAmount?: boolean };
      }) => {
        const rows = ownInvoices().filter((i) => invoiceMatches(i, where));
        const sumGross = rows.reduce((acc, i) => acc.plus(i.grossAmount), new Prisma.Decimal(0));
        const sumNet = rows.reduce((acc, i) => acc.plus(i.netAmount), new Prisma.Decimal(0));
        return {
          ...(_count?._all ? { _count: { _all: rows.length } } : {}),
          _sum: {
            ...(_sum?.grossAmount ? { grossAmount: rows.length ? sumGross : null } : {}),
            ...(_sum?.netAmount ? { netAmount: rows.length ? sumNet : null } : {}),
          },
        };
      },
      findMany: async ({
        where = {},
        orderBy,
      }: {
        where?: Where;
        orderBy?: Record<string, "asc" | "desc">;
      }) => {
        let rows = ownInvoices().filter((i) => invoiceMatches(i, where));
        if (orderBy && "issuedAt" in orderBy) {
          const dir = orderBy.issuedAt;
          rows = [...rows].sort((a, b) =>
            dir === "asc"
              ? a.issuedAt.getTime() - b.issuedAt.getTime()
              : b.issuedAt.getTime() - a.issuedAt.getTime(),
          );
        }
        return rows.map((i) => ({
          id: i.id,
          number: i.number,
          grossAmount: i.grossAmount,
          netAmount: i.netAmount,
          issuedAt: i.issuedAt,
          createdAt: i.createdAt,
        }));
      },
      findUnique: async ({ where }: { where: Where }) => {
        const row = ownInvoices().find((i) => i.id === where.id);
        return row ? { id: row.id, leadId: row.leadId } : null;
      },
      create: async ({ data, select }: { data: Where; select?: Where }) => {
        const row = store.addInvoice({
          organizationId,
          leadId: data.leadId as string,
          number: (data.number as string | null) ?? null,
          grossAmount: data.grossAmount as Prisma.Decimal,
          netAmount: data.netAmount as Prisma.Decimal,
          issuedAt: data.issuedAt as Date,
        });
        return select ? { id: row.id } : row;
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.invoices.findIndex(
          (i) => i.id === where.id && i.organizationId === organizationId,
        );
        if (idx === -1) throw makeP2025();
        const [row] = store.invoices.splice(idx, 1);
        return { id: row?.id ?? where.id };
      },
    },
    pipelineStageConfig: {
      findMany: async ({
        where = {},
        orderBy,
      }: {
        where?: Where;
        orderBy?: Record<string, "asc" | "desc">;
      }) => {
        let rows = store.stageConfigs.filter(
          (c) =>
            c.organizationId === organizationId &&
            (where.isVisible === undefined || c.isVisible === where.isVisible),
        );
        if (orderBy && "sortOrder" in orderBy) {
          const dir = orderBy.sortOrder;
          rows = [...rows].sort((a, b) =>
            dir === "asc" ? a.sortOrder - b.sortOrder : b.sortOrder - a.sortOrder,
          );
        }
        return rows.map((c) => ({ stage: c.stage }));
      },
    },
    lossReason: {
      findMany: async ({ where = {} }: { where?: Where }) => {
        const idFilter = where.id as { in?: string[] } | undefined;
        return store.lossReasons
          .filter(
            (r) =>
              r.organizationId === organizationId &&
              (idFilter?.in === undefined || idFilter.in.includes(r.id)),
          )
          .map((r) => ({ id: r.id, label: r.label }));
      },
    },
  };

  return client as unknown as TenantPrismaClient;
}

function makeP2025(): Error {
  const err = new Error("Record to delete does not exist.") as Error & { code: string };
  err.code = "P2025";
  err.name = "PrismaClientKnownRequestError";
  return err;
}

export function collectingAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

/** Build DashboardDeps bound to a tenant, backed by the shared store. */
export function buildFakeDashboardDeps(
  store: DashboardStore,
  organizationId: string,
  now: () => Date = () => new Date("2026-06-18T12:00:00.000Z"),
): DashboardDeps {
  return {
    prisma: dashboardClientFor(store, organizationId),
    now,
  };
}

/** Build InvoiceDeps bound to a tenant; returns the audit sink for assertions. */
export function buildFakeInvoiceDeps(
  store: DashboardStore,
  organizationId: string,
  userId: string,
): { deps: InvoiceDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  return {
    deps: {
      prisma: dashboardClientFor(store, organizationId),
      audit: collectingAudit(audits),
      actor: { organizationId, userId },
    },
    audits,
  };
}
