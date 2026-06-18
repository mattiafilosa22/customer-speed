import type { CapitalBracket, LeadStage } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import type { LeadDeps } from "@/server/leads/deps";
import type { PipelineDeps } from "@/server/pipeline/deps";

/**
 * In-memory fakes for the lead use cases.
 *
 * The crucial property under test is TENANT ISOLATION: the real tenant client
 * injects `organizationId` into every `where` and write. This fake reproduces
 * that contract — a client is bound to ONE `organizationId`, and EVERY read is
 * filtered to it and EVERY create stamps it. So a use case run with tenant A's
 * client can never see/touch tenant B's rows, exactly like production. Rows live
 * in a shared `LeadStore` so a test can pre-seed another tenant's data and then
 * assert it is invisible.
 *
 * Only the operations the use cases call are modelled, and the soft-delete
 * default (`deletedAt: null`) on reads is honoured (mutations bypass it), so the
 * fake stays faithful to `applyTenantScope`.
 */

export interface LeadRow {
  id: string;
  organizationId: string;
  ownerId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  stageChangedAt: Date;
  capitalBracket: CapitalBracket | null;
  sourceId: string | null;
  lossReasonId: string | null;
  adminNotes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteRow {
  id: string;
  organizationId: string;
  leadId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalRefRow {
  id: string;
  organizationId: string;
  leadId: string;
  altName: string | null;
  altEmail: string | null;
  source: string | null;
  createdAt: Date;
}

export interface StageHistoryRow {
  id: string;
  organizationId: string;
  leadId: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  changedById: string | null;
  changedAt: Date;
}

export interface LeadSourceRow {
  id: string;
  organizationId: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
}

export interface LossReasonRow {
  id: string;
  organizationId: string;
  label: string;
}

export interface PipelineStageConfigRow {
  id: string;
  organizationId: string;
  stage: LeadStage;
  isVisible: boolean;
  sortOrder: number;
  colorToken: string | null;
}

/** Shared, cross-tenant store. Build per-tenant clients against the same store. */
export class LeadStore {
  leads: LeadRow[] = [];
  notes: NoteRow[] = [];
  externalRefs: ExternalRefRow[] = [];
  stageHistory: StageHistoryRow[] = [];
  leadSources: LeadSourceRow[] = [];
  lossReasons: LossReasonRow[] = [];
  stageConfigs: PipelineStageConfigRow[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addLead(partial: Partial<LeadRow> & Pick<LeadRow, "organizationId">): LeadRow {
    const now = partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z");
    const row: LeadRow = {
      id: partial.id ?? this.nextId("lead"),
      organizationId: partial.organizationId,
      ownerId: partial.ownerId ?? null,
      firstName: partial.firstName ?? "Test",
      lastName: partial.lastName ?? "Lead",
      email: partial.email ?? null,
      phone: partial.phone ?? null,
      stage: partial.stage ?? ("TO_HANDLE" as LeadStage),
      stageChangedAt: partial.stageChangedAt ?? now,
      capitalBracket: partial.capitalBracket ?? null,
      sourceId: partial.sourceId ?? null,
      lossReasonId: partial.lossReasonId ?? null,
      adminNotes: partial.adminNotes ?? null,
      deletedAt: partial.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.leads.push(row);
    return row;
  }

  addSource(
    partial: Partial<LeadSourceRow> & Pick<LeadSourceRow, "organizationId">,
  ): LeadSourceRow {
    const row: LeadSourceRow = {
      id: partial.id ?? this.nextId("src"),
      organizationId: partial.organizationId,
      label: partial.label ?? "Funnel",
      isActive: partial.isActive ?? true,
      sortOrder: partial.sortOrder ?? 0,
    };
    this.leadSources.push(row);
    return row;
  }

  addLossReason(
    partial: Partial<LossReasonRow> & Pick<LossReasonRow, "organizationId">,
  ): LossReasonRow {
    const row: LossReasonRow = {
      id: partial.id ?? this.nextId("loss"),
      organizationId: partial.organizationId,
      label: partial.label ?? "Non ha più risposto",
    };
    this.lossReasons.push(row);
    return row;
  }

  addNote(partial: Partial<NoteRow> & Pick<NoteRow, "organizationId" | "leadId">): NoteRow {
    const now = partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z");
    const row: NoteRow = {
      id: partial.id ?? this.nextId("note"),
      organizationId: partial.organizationId,
      leadId: partial.leadId,
      authorId: partial.authorId ?? null,
      body: partial.body ?? "note",
      createdAt: now,
      updatedAt: now,
    };
    this.notes.push(row);
    return row;
  }

  addExternalRef(
    partial: Partial<ExternalRefRow> & Pick<ExternalRefRow, "organizationId" | "leadId">,
  ): ExternalRefRow {
    const row: ExternalRefRow = {
      id: partial.id ?? this.nextId("xref"),
      organizationId: partial.organizationId,
      leadId: partial.leadId,
      altName: partial.altName ?? null,
      altEmail: partial.altEmail ?? null,
      source: partial.source ?? null,
      createdAt: partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z"),
    };
    this.externalRefs.push(row);
    return row;
  }

  addStageConfig(
    partial: Partial<PipelineStageConfigRow> & Pick<PipelineStageConfigRow, "organizationId" | "stage" | "sortOrder">,
  ): PipelineStageConfigRow {
    const row: PipelineStageConfigRow = {
      id: partial.id ?? this.nextId("cfg"),
      organizationId: partial.organizationId,
      stage: partial.stage,
      isVisible: partial.isVisible ?? true,
      sortOrder: partial.sortOrder,
      colorToken: partial.colorToken ?? null,
    };
    this.stageConfigs.push(row);
    return row;
  }

  /** Seed the canonical 9 stage configs (all visible) for a tenant. */
  seedStageConfigs(organizationId: string): PipelineStageConfigRow[] {
    return PIPELINE_STAGE_ORDER.map((stage, index) =>
      this.addStageConfig({ organizationId, stage, sortOrder: index }),
    );
  }

  lead(index = 0): LeadRow {
    const row = this.leads[index];
    if (!row) throw new Error(`no lead at index ${index}`);
    return row;
  }

  stageConfig(organizationId: string, stage: LeadStage): PipelineStageConfigRow {
    const row = this.stageConfigs.find(
      (c) => c.organizationId === organizationId && c.stage === stage,
    );
    if (!row) throw new Error(`no stage config for ${stage}`);
    return row;
  }
}

/** Canonical default order (mirrors src/server/leads/stage.ts STAGE_ORDER). */
const PIPELINE_STAGE_ORDER = [
  "TO_HANDLE",
  "TAKEN",
  "CALL_SCHEDULED",
  "WAITING_DOCS",
  "PRESENTATION_CALL",
  "WAITING_DECISION",
  "WAITING_PAYMENT",
  "WON",
  "LOST",
] as unknown as LeadStage[];

type Where = Record<string, unknown>;

function matchString(value: string | null, cond: unknown): boolean {
  if (typeof cond === "object" && cond !== null && "contains" in cond) {
    const needle = String((cond as { contains: string }).contains).toLowerCase();
    return (value ?? "").toLowerCase().includes(needle);
  }
  return value === cond;
}

/**
 * Builds a fake tenant-scoped Prisma client bound to `organizationId`, backed by
 * the shared store. Mirrors the real extension's scoping/soft-delete contract.
 */
export function tenantClientFor(store: LeadStore, organizationId: string): TenantPrismaClient {
  const ownLeads = (includeDeleted = false): LeadRow[] =>
    store.leads.filter(
      (l) => l.organizationId === organizationId && (includeDeleted || l.deletedAt === null),
    );

  const leadMatchesWhere = (lead: LeadRow, where: Where): boolean => {
    if (where.id !== undefined && lead.id !== where.id) return false;
    if (where.stage !== undefined) {
      const cond = where.stage;
      if (typeof cond === "object" && cond !== null && "in" in cond) {
        const allowed = (cond as { in: LeadStage[] }).in;
        if (!allowed.includes(lead.stage)) return false;
      } else if (lead.stage !== cond) {
        return false;
      }
    }
    if (where.sourceId !== undefined && lead.sourceId !== where.sourceId) return false;
    if (where.createdAt && typeof where.createdAt === "object") {
      const range = where.createdAt as { gte?: Date; lt?: Date };
      if (range.gte && lead.createdAt < range.gte) return false;
      if (range.lt && lead.createdAt >= range.lt) return false;
    }
    if (where.stageChangedAt && typeof where.stageChangedAt === "object") {
      const range = where.stageChangedAt as { lte?: Date };
      if (range.lte && lead.stageChangedAt > range.lte) return false;
    }
    if (Array.isArray(where.OR)) {
      const ok = (where.OR as Where[]).some((clause) =>
        Object.entries(clause).some(([field, cond]) =>
          matchString(
            (lead as unknown as Record<string, string | null | undefined>)[field] ?? null,
            cond,
          ),
        ),
      );
      if (!ok) return false;
    }
    return true;
  };

  const client = {
    lead: {
      findUnique: async ({ where }: { where: Where }) => {
        // Return a COPY (like real Prisma) so callers that read fields before a
        // later `update` are not affected by in-place mutation of the store row.
        const row = ownLeads().find((l) => l.id === where.id);
        return row ? { ...row } : null;
      },
      findMany: async ({
        where = {},
        orderBy,
        skip = 0,
        take,
      }: {
        where?: Where;
        orderBy?: Record<string, "asc" | "desc">;
        skip?: number;
        take?: number;
      }) => {
        let rows = ownLeads().filter((l) => leadMatchesWhere(l, where));
        if (orderBy) {
          const [field, dir] = Object.entries(orderBy)[0] ?? ["createdAt", "desc"];
          rows = [...rows].sort((a, b) => {
            const av = (a as unknown as Record<string, Date>)[field]?.getTime() ?? 0;
            const bv = (b as unknown as Record<string, Date>)[field]?.getTime() ?? 0;
            return dir === "asc" ? av - bv : bv - av;
          });
        }
        const sliced = take === undefined ? rows.slice(skip) : rows.slice(skip, skip + take);
        return sliced.map((l) => ({
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          email: l.email,
          phone: l.phone,
          stage: l.stage,
          stageChangedAt: l.stageChangedAt,
          capitalBracket: l.capitalBracket,
          createdAt: l.createdAt,
          source: l.sourceId
            ? (store.leadSources
                .filter((s) => s.id === l.sourceId)
                .map((s) => ({ id: s.id, label: s.label }))[0] ?? null)
            : null,
          _count: { notes: store.notes.filter((n) => n.leadId === l.id).length },
        }));
      },
      count: async ({ where = {} }: { where?: Where }) =>
        ownLeads().filter((l) => leadMatchesWhere(l, where)).length,
      groupBy: async ({ where = {} }: { where?: Where }) => {
        const rows = ownLeads().filter((l) => leadMatchesWhere(l, where));
        const byStage = new Map<LeadStage, number>();
        for (const l of rows) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);
        return [...byStage.entries()].map(([stage, n]) => ({ stage, _count: { _all: n } }));
      },
      create: async ({ data, select }: { data: Where; select?: Where }) => {
        const row = store.addLead({
          organizationId,
          ownerId: (data.ownerId as string) ?? null,
          firstName: data.firstName as string,
          lastName: data.lastName as string,
          email: (data.email as string | null) ?? null,
          phone: (data.phone as string | null) ?? null,
          stage: data.stage as LeadStage | undefined,
          stageChangedAt: data.stageChangedAt as Date | undefined,
          capitalBracket: (data.capitalBracket as CapitalBracket | null) ?? null,
          sourceId: (data.sourceId as string | null) ?? null,
        });
        return select ? { id: row.id } : row;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        // Mutations bypass the soft-delete filter but still tenant-scoped.
        const row = store.leads.find(
          (l) => l.id === where.id && l.organizationId === organizationId,
        );
        if (!row) {
          throw makeP2025();
        }
        applyLeadUpdate(row, data);
        return { id: row.id };
      },
    },
    note: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.notes.find(
          (n) => n.id === where.id && n.organizationId === organizationId,
        );
        return row ? { leadId: row.leadId } : null;
      },
      findMany: async ({ where = {} }: { where?: Where }) =>
        store.notes
          .filter(
            (n) =>
              n.organizationId === organizationId &&
              (where.leadId === undefined || n.leadId === where.leadId),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((n) => ({
            id: n.id,
            body: n.body,
            authorId: n.authorId,
            createdAt: n.createdAt,
          })),
      create: async ({ data }: { data: Where }) => {
        const row = store.addNote({
          organizationId,
          leadId: data.leadId as string,
          authorId: (data.authorId as string | null) ?? null,
          body: data.body as string,
        });
        return { id: row.id };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.notes.find(
          (n) => n.id === where.id && n.organizationId === organizationId,
        );
        if (!row) throw makeP2025();
        if (typeof data.body === "string") row.body = data.body;
        return { id: row.id };
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.notes.findIndex(
          (n) => n.id === where.id && n.organizationId === organizationId,
        );
        if (idx === -1) throw makeP2025();
        const [row] = store.notes.splice(idx, 1);
        return { id: row?.id ?? where.id };
      },
    },
    externalCrmRef: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.externalRefs.find(
          (r) => r.id === where.id && r.organizationId === organizationId,
        );
        return row ? { id: row.id, leadId: row.leadId } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const row = store.addExternalRef({
          organizationId,
          leadId: data.leadId as string,
          altName: (data.altName as string | null) ?? null,
          altEmail: (data.altEmail as string | null) ?? null,
          source: (data.source as string | null) ?? null,
        });
        return { id: row.id };
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.externalRefs.findIndex(
          (r) => r.id === where.id && r.organizationId === organizationId,
        );
        if (idx === -1) throw makeP2025();
        const [row] = store.externalRefs.splice(idx, 1);
        return { id: row?.id ?? where.id };
      },
    },
    stageHistory: {
      create: async ({ data }: { data: Where }) => {
        const row: StageHistoryRow = {
          id: store.nextId("hist"),
          organizationId,
          leadId: data.leadId as string,
          fromStage: (data.fromStage as LeadStage | null) ?? null,
          toStage: data.toStage as LeadStage,
          changedById: (data.changedById as string | null) ?? null,
          changedAt: data.changedAt as Date,
        };
        store.stageHistory.push(row);
        return { id: row.id };
      },
    },
    leadSource: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.leadSources.find(
          (s) => s.id === where.id && s.organizationId === organizationId,
        );
        return row ? { id: row.id } : null;
      },
      findMany: async ({ where = {} }: { where?: Where }) =>
        store.leadSources
          .filter(
            (s) =>
              s.organizationId === organizationId &&
              (where.isActive === undefined || s.isActive === where.isActive),
          )
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ id: s.id, label: s.label })),
    },
    lossReason: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.lossReasons.find(
          (r) => r.id === where.id && r.organizationId === organizationId,
        );
        return row ? { id: row.id } : null;
      },
      findMany: async () =>
        store.lossReasons
          .filter((r) => r.organizationId === organizationId)
          .map((r) => ({ id: r.id, label: r.label })),
    },
    pipelineStageConfig: {
      findUnique: async ({ where, select }: { where: Where; select?: Where }) => {
        // Supports both `{ id }` and the compound `{ organizationId_stage }` key.
        const compound = where.organizationId_stage as { stage: LeadStage } | undefined;
        const row = store.stageConfigs.find(
          (c) =>
            c.organizationId === organizationId &&
            (where.id !== undefined
              ? c.id === where.id
              : compound !== undefined && c.stage === compound.stage),
        );
        if (!row) return null;
        return projectStageConfig(row, select);
      },
      findMany: async ({ orderBy, select }: { orderBy?: Where; select?: Where } = {}) => {
        let rows = store.stageConfigs.filter((c) => c.organizationId === organizationId);
        if (orderBy && "sortOrder" in orderBy) {
          const dir = (orderBy as { sortOrder: "asc" | "desc" }).sortOrder;
          rows = [...rows].sort((a, b) =>
            dir === "asc" ? a.sortOrder - b.sortOrder : b.sortOrder - a.sortOrder,
          );
        }
        return rows.map((r) => projectStageConfig(r, select));
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const compound = where.organizationId_stage as { stage: LeadStage } | undefined;
        const row = store.stageConfigs.find(
          (c) =>
            c.organizationId === organizationId &&
            (where.id !== undefined
              ? c.id === where.id
              : compound !== undefined && c.stage === compound.stage),
        );
        if (!row) throw makeP2025();
        if ("isVisible" in data) row.isVisible = data.isVisible as boolean;
        if ("sortOrder" in data) row.sortOrder = data.sortOrder as number;
        if ("colorToken" in data) row.colorToken = (data.colorToken as string | null) ?? null;
        return { id: row.id };
      },
    },
    // Transaction: supports BOTH the callback form (run against this same fake
    // client) and the array/batch form (await the prepared promises in order).
    $transaction: (async (
      arg: ((tx: TenantPrismaClient) => Promise<unknown>) | Promise<unknown>[],
    ): Promise<unknown> => {
      if (typeof arg === "function") {
        return arg(client as unknown as TenantPrismaClient);
      }
      const results = [];
      for (const op of arg) {
        results.push(await op);
      }
      return results;
    }) as unknown as TenantPrismaClient["$transaction"],
  };

  return client as unknown as TenantPrismaClient;
}

function applyLeadUpdate(row: LeadRow, data: Where): void {
  if (typeof data.firstName === "string") row.firstName = data.firstName;
  if (typeof data.lastName === "string") row.lastName = data.lastName;
  if ("email" in data) row.email = (data.email as string | null) ?? null;
  if ("phone" in data) row.phone = (data.phone as string | null) ?? null;
  if ("capitalBracket" in data)
    row.capitalBracket = (data.capitalBracket as CapitalBracket) ?? null;
  if ("adminNotes" in data) row.adminNotes = (data.adminNotes as string | null) ?? null;
  if ("deletedAt" in data) row.deletedAt = (data.deletedAt as Date | null) ?? null;
  if ("stage" in data) row.stage = data.stage as LeadStage;
  if ("stageChangedAt" in data) row.stageChangedAt = data.stageChangedAt as Date;
  if ("lossReasonId" in data) row.lossReasonId = (data.lossReasonId as string | null) ?? null;
  if (data.source && typeof data.source === "object") {
    const op = data.source as { connect?: { id: string }; disconnect?: boolean };
    if (op.connect) row.sourceId = op.connect.id;
    if (op.disconnect) row.sourceId = null;
  }
}

/** Project a stage-config row to the requested `select` (or the full row). */
function projectStageConfig(
  row: PipelineStageConfigRow,
  select?: Where,
): Record<string, unknown> {
  if (!select) {
    return { ...row };
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = (row as unknown as Record<string, unknown>)[key];
  }
  return out;
}

/** A Prisma-shaped P2025 ("record not found") for `update`/`delete` misses. */
function makeP2025(): Error {
  const err = new Error("Record to update not found.") as Error & { code: string };
  err.code = "P2025";
  err.name = "PrismaClientKnownRequestError";
  return err;
}

export function collectingAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

/** Build LeadDeps bound to a tenant, backed by the shared store. */
export function buildFakeLeadDeps(
  store: LeadStore,
  organizationId: string,
  userId: string,
  overrides: Partial<LeadDeps> = {},
): LeadDeps {
  const audits: AuditEvent[] = [];
  return {
    prisma: tenantClientFor(store, organizationId),
    audit: collectingAudit(audits),
    actor: { organizationId, userId },
    now: () => new Date("2026-06-18T12:00:00.000Z"),
    ...overrides,
  };
}

/**
 * Build PipelineDeps bound to a tenant, backed by the shared store. The `audits`
 * sink is returned so tests can assert the audit trail.
 */
export function buildFakePipelineDeps(
  store: LeadStore,
  organizationId: string,
  userId: string,
): { deps: PipelineDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  return {
    deps: {
      prisma: tenantClientFor(store, organizationId),
      audit: collectingAudit(audits),
      actor: { organizationId, userId },
    },
    audits,
  };
}
