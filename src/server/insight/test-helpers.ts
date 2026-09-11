import { AppointmentStatus, ChatChannel, LeadStage } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditEvent } from "@/server/audit/audit-log";
import type { InsightDeps } from "@/server/insight/deps";

/**
 * Fake in-memory condiviso dagli use case di Insight & Stats (Task 4-12).
 *
 * Il contratto da riprodurre è quello del client tenant-scoped reale
 * (`src/lib/prisma-tenant.ts`): `tenantClient(organizationId)` restituisce un
 * client legato a UN `organizationId`, ogni lettura è filtrata su di esso e
 * ogni scrittura lo stampa — così i test di isolamento dei task successivi
 * verificano lo stesso comportamento della produzione, non un'approssimazione.
 * Le righe vivono in un `InsightStore` condiviso, così un test può seminare i
 * dati di un altro tenant e verificare che restino invisibili.
 *
 * Sono modellate SOLO le operazioni che gli use case chiamano davvero:
 * `organization.findUnique`, `chatActivityDay.findMany/upsert`,
 * `lead.findMany/create`, `appointment.groupBy/create`, `stageHistory.groupBy`,
 * `$transaction`. `Organization` non è tenant-scoped in produzione (non è in
 * `TENANT_SCOPED_MODELS`): il lookup qui non filtra ulteriormente, esattamente
 * come il client reale — la sicurezza viene dal fatto che `getInsightConfig`
 * interroga sempre `deps.actor.organizationId`, mai un id arrivato dal client.
 */

export interface OrganizationRow {
  id: string;
  insightSourceId: string | null;
  insightActiveFrom: Date | null;
}

export interface LeadSourceRow {
  id: string;
  organizationId: string;
  label: string;
}

export interface LeadRow {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  stage: LeadStage;
  sourceId: string | null;
  chatChannel: ChatChannel | null;
  createdFromInsight: boolean;
  createdAt: Date;
  /** Soft delete. Il client tenant reale filtra `deletedAt: null` su ogni lettura di `Lead` — vedi `lead.findMany` sotto. */
  deletedAt: Date | null;
}

export interface AppointmentRow {
  id: string;
  organizationId: string;
  leadId: string | null;
  startAt: Date;
  reason: string;
  status: AppointmentStatus;
  createdAt: Date;
}

export interface StageHistoryRow {
  id: string;
  organizationId: string;
  leadId: string;
  fromStage: LeadStage | null;
  toStage: LeadStage;
  changedAt: Date;
}

export interface ChatActivityDayRow {
  id: string;
  organizationId: string;
  date: Date;
  welcomeSent: number;
  welcomeReplies: number;
  outboundComments: number;
  outboundStories: number;
  outboundReplies: number;
  inboundReceived: number;
  isArchived: boolean;
  archivedOutboundMessages: number | null;
  archivedWelcomeAppointments: number | null;
  archivedWelcomeSales: number | null;
  archivedOutboundAppointments: number | null;
  archivedOutboundSales: number | null;
  archivedInboundAppointments: number | null;
  archivedInboundSales: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Ancora di default per i campi data dei seeder quando il test non la specifica. */
const DEFAULT_ANCHOR = new Date("2026-09-01T00:00:00.000Z");

/**
 * `@db.Date` è mezzanotte UTC, mai mezzanotte locale: i test successivi passano
 * date come stringa `"YYYY-MM-DD"` e si aspettano di ritrovarle così in memoria.
 * Una `Date` già costruita passa invariata.
 */
function toUtcDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
}

function pick<T extends object>(row: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return { ...row };
  const out: Partial<T> = {};
  for (const key of Object.keys(select) as (keyof T)[]) {
    if (select[key as string]) out[key] = row[key];
  }
  return out;
}

type Where = Record<string, unknown>;

function inRange(value: Date, range: { gte?: Date; lt?: Date } | undefined): boolean {
  if (!range) return true;
  if (range.gte && value < range.gte) return false;
  if (range.lt && value >= range.lt) return false;
  return true;
}

/**
 * Raggruppa righe per `leadId` e riduce le date di ciascun gruppo al minimo o
 * al massimo — il nucleo condiviso di `appointment.groupBy` (primo
 * appuntamento per lead) e `stageHistory.groupBy` (ultimo passaggio a
 * `toStage` per lead), così le due implementazioni non divergono per un bug
 * corretto in una sola (docs/00 — niente duplicazione).
 */
function groupDatesByLead<T>(
  rows: readonly T[],
  leadIdOf: (row: T) => string,
  dateOf: (row: T) => Date,
  reducer: "min" | "max",
): Map<string, Date> {
  const groups = new Map<string, Date>();
  for (const row of rows) {
    const leadId = leadIdOf(row);
    const date = dateOf(row);
    const current = groups.get(leadId);
    if (
      current === undefined ||
      (reducer === "min" ? date < current : date > current)
    ) {
      groups.set(leadId, date);
    }
  }
  return groups;
}

export class InsightStore {
  organizations: OrganizationRow[] = [];
  leadSources: LeadSourceRow[] = [];
  leads: LeadRow[] = [];
  appointments: AppointmentRow[] = [];
  stageHistories: StageHistoryRow[] = [];
  chatActivityDays: ChatActivityDayRow[] = [];

  /** Eventi audit accumulati da OGNI client costruito da questo store — ispezionabili nei test. */
  audits: AuditEvent[] = [];

  private seq = 0;
  /** Task 11: rollback della transazione — vedi `failNextAppointmentCreate`. */
  private failAppointmentCreateOnce = false;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addOrganization(
    partial: Partial<OrganizationRow> & Pick<OrganizationRow, "id">,
  ): OrganizationRow {
    const row: OrganizationRow = {
      id: partial.id,
      insightSourceId: partial.insightSourceId ?? null,
      insightActiveFrom: partial.insightActiveFrom ?? null,
    };
    this.organizations.push(row);
    return row;
  }

  addLeadSource(
    partial: Partial<LeadSourceRow> & Pick<LeadSourceRow, "organizationId" | "label">,
  ): LeadSourceRow {
    const row: LeadSourceRow = {
      id: partial.id ?? this.nextId("src"),
      organizationId: partial.organizationId,
      label: partial.label,
    };
    this.leadSources.push(row);
    return row;
  }

  addLead(
    partial: Partial<Omit<LeadRow, "createdAt">> &
      Pick<LeadRow, "organizationId"> & { createdAt?: string | Date },
  ): LeadRow {
    const row: LeadRow = {
      id: partial.id ?? this.nextId("lead"),
      organizationId: partial.organizationId,
      firstName: partial.firstName ?? "Test",
      lastName: partial.lastName ?? "Lead",
      stage: partial.stage ?? LeadStage.TO_HANDLE,
      sourceId: partial.sourceId ?? null,
      chatChannel: partial.chatChannel ?? null,
      createdFromInsight: partial.createdFromInsight ?? false,
      createdAt: partial.createdAt ? toUtcDate(partial.createdAt) : DEFAULT_ANCHOR,
      deletedAt: partial.deletedAt ?? null,
    };
    this.leads.push(row);
    return row;
  }

  addAppointment(
    partial: Partial<Omit<AppointmentRow, "createdAt" | "startAt">> &
      Pick<AppointmentRow, "organizationId"> & { createdAt?: string | Date; startAt?: string | Date },
  ): AppointmentRow {
    const createdAt = partial.createdAt ? toUtcDate(partial.createdAt) : DEFAULT_ANCHOR;
    const row: AppointmentRow = {
      id: partial.id ?? this.nextId("appt"),
      organizationId: partial.organizationId,
      leadId: partial.leadId ?? null,
      startAt: partial.startAt ? toUtcDate(partial.startAt) : createdAt,
      reason: partial.reason ?? "Chiamata conoscitiva",
      status: partial.status ?? AppointmentStatus.PENDING,
      createdAt,
    };
    this.appointments.push(row);
    return row;
  }

  addStageHistory(
    partial: Partial<Omit<StageHistoryRow, "changedAt">> &
      Pick<StageHistoryRow, "organizationId" | "leadId"> & { changedAt?: string | Date },
  ): StageHistoryRow {
    const row: StageHistoryRow = {
      id: partial.id ?? this.nextId("sh"),
      organizationId: partial.organizationId,
      leadId: partial.leadId,
      fromStage: partial.fromStage ?? null,
      toStage: partial.toStage ?? LeadStage.WON,
      changedAt: partial.changedAt ? toUtcDate(partial.changedAt) : DEFAULT_ANCHOR,
    };
    this.stageHistories.push(row);
    return row;
  }

  addActivityDay(
    partial: Partial<Omit<ChatActivityDayRow, "date" | "createdAt" | "updatedAt">> &
      Pick<ChatActivityDayRow, "organizationId"> & { date?: string | Date },
  ): ChatActivityDayRow {
    const row: ChatActivityDayRow = {
      id: partial.id ?? this.nextId("cad"),
      organizationId: partial.organizationId,
      date: partial.date ? toUtcDate(partial.date) : DEFAULT_ANCHOR,
      welcomeSent: partial.welcomeSent ?? 0,
      welcomeReplies: partial.welcomeReplies ?? 0,
      outboundComments: partial.outboundComments ?? 0,
      outboundStories: partial.outboundStories ?? 0,
      outboundReplies: partial.outboundReplies ?? 0,
      inboundReceived: partial.inboundReceived ?? 0,
      isArchived: partial.isArchived ?? false,
      archivedOutboundMessages: partial.archivedOutboundMessages ?? null,
      archivedWelcomeAppointments: partial.archivedWelcomeAppointments ?? null,
      archivedWelcomeSales: partial.archivedWelcomeSales ?? null,
      archivedOutboundAppointments: partial.archivedOutboundAppointments ?? null,
      archivedOutboundSales: partial.archivedOutboundSales ?? null,
      archivedInboundAppointments: partial.archivedInboundAppointments ?? null,
      archivedInboundSales: partial.archivedInboundSales ?? null,
      createdAt: DEFAULT_ANCHOR,
      updatedAt: DEFAULT_ANCHOR,
    };
    this.chatActivityDays.push(row);
    return row;
  }

  /**
   * Fa fallire UNA volta la prossima `appointment.create` di QUALSIASI client
   * costruito da questo store. Serve al Task 11 per verificare che
   * `$transaction` non lasci un lead orfano quando la creazione
   * dell'appuntamento fallisce a metà del flusso "nuovo lead da chat".
   */
  failNextAppointmentCreate(): void {
    this.failAppointmentCreateOnce = true;
  }

  /** @internal consumato da `tenantClientFor`; non fa parte della API pubblica del test-helper. */
  consumeFailNextAppointmentCreateIfSet(): boolean {
    if (this.failAppointmentCreateOnce) {
      this.failAppointmentCreateOnce = false;
      return true;
    }
    return false;
  }

  /** Client tenant-scoped legato a `organizationId` — vedi contratto in testa al file. */
  tenantClient(organizationId: string): TenantPrismaClient {
    return tenantClientFor(this, organizationId);
  }

  /**
   * Costruisce `InsightDeps` pronte per un use case: client legato al tenant,
   * audit fake che scrive nell'array condiviso `audits`, e clock iniettabile
   * (Ruling A) per rendere deterministici i test che dipendono da "oggi".
   */
  deps(
    organizationId: string,
    now: () => Date = () => new Date("2026-09-15T12:00:00.000Z"),
  ): InsightDeps {
    return {
      prisma: this.tenantClient(organizationId),
      audit: { record: async (event) => void this.audits.push(event) },
      actor: { organizationId, userId: "user_test" },
      now,
    };
  }
}

/**
 * Build a tenant-scoped fake bound to `organizationId`, backed by the shared
 * store. Mirrors the real extension's scoping contract for the operations the
 * insight use cases call.
 */
export function tenantClientFor(
  store: InsightStore,
  organizationId: string,
): TenantPrismaClient {
  const ownLeads = (): LeadRow[] =>
    store.leads.filter((lead) => lead.organizationId === organizationId);
  const ownAppointments = (): AppointmentRow[] =>
    store.appointments.filter((appointment) => appointment.organizationId === organizationId);
  const ownStageHistories = (): StageHistoryRow[] =>
    store.stageHistories.filter((history) => history.organizationId === organizationId);
  const ownChatActivityDays = (): ChatActivityDayRow[] =>
    store.chatActivityDays.filter((day) => day.organizationId === organizationId);

  const findLead = (leadId: string | null): LeadRow | undefined =>
    leadId ? ownLeads().find((lead) => lead.id === leadId) : undefined;

  /**
   * `{ lead: { is: { sourceId?, stage? } } }` — filtro sulla relazione, come in
   * produzione: una relazione nulla (leadId nullo, o lead di un altro tenant)
   * non soddisfa mai `is: {...}`.
   */
  const relatedLeadMatches = (
    leadId: string | null,
    filter: { sourceId?: string | null; stage?: LeadStage } | undefined,
  ): boolean => {
    if (!filter) return true;
    const lead = findLead(leadId);
    if (!lead) return false;
    if (filter.sourceId !== undefined && lead.sourceId !== filter.sourceId) return false;
    if (filter.stage !== undefined && lead.stage !== filter.stage) return false;
    return true;
  };

  const client = {
    organization: {
      findUnique: async ({
        where,
        select,
      }: {
        where: Where;
        select?: Record<string, boolean>;
      }) => {
        const row = store.organizations.find((org) => org.id === where.id);
        return row ? pick(row, select) : null;
      },
    },
    chatActivityDay: {
      findMany: async ({
        where = {},
        orderBy,
        select,
      }: {
        where?: Where;
        orderBy?: { date?: "asc" | "desc" };
        select?: Record<string, boolean>;
      }) => {
        let rows = ownChatActivityDays().filter((day) =>
          inRange(day.date, where.date as { gte?: Date; lt?: Date } | undefined),
        );
        if (orderBy?.date) {
          const dir = orderBy.date;
          rows = [...rows].sort((a, b) =>
            dir === "asc" ? a.date.getTime() - b.date.getTime() : b.date.getTime() - a.date.getTime(),
          );
        }
        return rows.map((row) => pick(row, select));
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { organizationId_date: { organizationId: string; date: Date } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const targetDate = toUtcDate(where.organizationId_date.date);
        const idx = store.chatActivityDays.findIndex(
          (day) => day.organizationId === organizationId && day.date.getTime() === targetDate.getTime(),
        );
        if (idx === -1) {
          return store.addActivityDay({
            ...(create as Partial<ChatActivityDayRow>),
            organizationId,
            date: targetDate,
          });
        }
        const current = store.chatActivityDays[idx]!;
        const next: ChatActivityDayRow = {
          ...current,
          ...(update as Partial<ChatActivityDayRow>),
          updatedAt: new Date(),
        };
        store.chatActivityDays[idx] = next;
        return next;
      },
    },
    lead: {
      findMany: async ({
        where = {},
        orderBy,
        select,
      }: {
        where?: Where;
        orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
        select?: Record<string, boolean>;
      }) => {
        const idFilter = where.id as { in?: string[] } | undefined;
        // Default soft-delete (mirror di `injectSoftDeleteFilter` in prisma-tenant.ts): un
        // lead cancellato non è un lead, e il report Insight & Stats non deve contarlo.
        let rows = ownLeads().filter(
          (lead) =>
            lead.deletedAt === null && (idFilter?.in === undefined || idFilter.in.includes(lead.id)),
        );
        const ordering = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
        if (ordering.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const clause of ordering) {
              const [field, dir] = Object.entries(clause)[0] ?? [];
              if (!field) continue;
              const av = (a as unknown as Record<string, unknown>)[field];
              const bv = (b as unknown as Record<string, unknown>)[field];
              const comparison =
                av instanceof Date && bv instanceof Date
                  ? av.getTime() - bv.getTime()
                  : String(av).localeCompare(String(bv));
              if (comparison !== 0) return dir === "asc" ? comparison : -comparison;
            }
            return 0;
          });
        }
        return rows.map((row) => pick(row, select));
      },
      create: async ({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        const row = store.addLead({
          ...(data as Partial<Omit<LeadRow, "createdAt">> & { createdAt?: string | Date }),
          organizationId,
        });
        return pick(row, select);
      },
    },
    appointment: {
      groupBy: async ({
        where = {},
        _min,
      }: {
        by: string[];
        where?: Where;
        _min?: { createdAt?: boolean };
      }) => {
        const leadFilter = (where.lead as { is?: { sourceId?: string | null } } | undefined)?.is;
        const rows = ownAppointments().filter(
          (appointment) =>
            inRange(appointment.createdAt, where.createdAt as { gte?: Date; lt?: Date } | undefined) &&
            relatedLeadMatches(appointment.leadId, leadFilter),
        );
        // Un lead compare al massimo una volta: si prende MIN(createdAt) per leadId.
        const groups = groupDatesByLead(
          rows.filter((appointment): appointment is AppointmentRow & { leadId: string } =>
            appointment.leadId !== null,
          ),
          (appointment) => appointment.leadId,
          (appointment) => appointment.createdAt,
          "min",
        );
        return [...groups.entries()].map(([leadId, minCreatedAt]) => ({
          leadId,
          ...(_min?.createdAt ? { _min: { createdAt: minCreatedAt } } : {}),
        }));
      },
      create: async ({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        if (store.consumeFailNextAppointmentCreateIfSet()) {
          throw new Error("simulated appointment.create failure");
        }
        const row = store.addAppointment({
          ...(data as Partial<Omit<AppointmentRow, "createdAt" | "startAt">> & {
            createdAt?: string | Date;
            startAt?: string | Date;
          }),
          organizationId,
        });
        return pick(row, select);
      },
    },
    stageHistory: {
      groupBy: async ({
        where = {},
        _max,
      }: {
        by: string[];
        where?: Where;
        _max?: { changedAt?: boolean };
      }) => {
        const leadFilter = (
          where.lead as { is?: { sourceId?: string | null; stage?: LeadStage } } | undefined
        )?.is;
        const rows = ownStageHistories().filter(
          (history) =>
            (where.toStage === undefined || history.toStage === where.toStage) &&
            inRange(history.changedAt, where.changedAt as { gte?: Date; lt?: Date } | undefined) &&
            relatedLeadMatches(history.leadId, leadFilter),
        );
        // Un lead riaperto e richiuso conta una volta: si prende MAX(changedAt) per leadId.
        const groups = groupDatesByLead(
          rows,
          (history) => history.leadId,
          (history) => history.changedAt,
          "max",
        );
        return [...groups.entries()].map(([leadId, maxChangedAt]) => ({
          leadId,
          ...(_max?.changedAt ? { _max: { changedAt: maxChangedAt } } : {}),
        }));
      },
    },
    $transaction: async <T>(fn: (tx: TenantPrismaClient) => Promise<T>): Promise<T> => {
      // Snapshot delle righe PRIMA della callback: se questa lancia, si torna
      // esattamente allo stato precedente — nessun lead orfano (Task 11, Ruling D).
      const snapshot = {
        leads: [...store.leads],
        appointments: [...store.appointments],
        stageHistories: [...store.stageHistories],
        chatActivityDays: [...store.chatActivityDays],
      };
      try {
        return await fn(client as unknown as TenantPrismaClient);
      } catch (err) {
        store.leads = snapshot.leads;
        store.appointments = snapshot.appointments;
        store.stageHistories = snapshot.stageHistories;
        store.chatActivityDays = snapshot.chatActivityDays;
        throw err;
      }
    },
  };

  return client as unknown as TenantPrismaClient;
}
