import { AppointmentStatus, type LeadStage } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import type { AppointmentDeps } from "@/server/appointments/deps";

/**
 * In-memory fakes for the appointment use cases.
 *
 * The property under test is TENANT ISOLATION (docs/00 §3, mirrors
 * `applyTenantScope`): a client is bound to ONE `organizationId`, every read is
 * filtered to it (AND soft-deleted leads are excluded), and every write stamps
 * it. Rows live in a shared `AppointmentStore` so a test can seed another
 * tenant's data and assert it is invisible. Only the operations the use cases
 * call are modelled — `appointment.{findUnique,findMany,count,groupBy,create,
 * update,delete}`, `lead.findUnique`, and `$queryRaw` for the month aggregate.
 *
 * The raw month aggregate is approximated with a UTC-day truncation (the real
 * query uses Postgres `date_trunc` at Europe/Rome). Tests that exercise the
 * aggregate use UTC-midday dates so both agree on the day.
 */

export interface AppointmentRow {
  id: string;
  organizationId: string;
  leadId: string | null;
  ownerId: string | null;
  startAt: Date;
  reason: string;
  status: AppointmentStatus;
  provider: string | null;
  externalEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ALeadRow {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  stage: LeadStage;
  deletedAt: Date | null;
}

export class AppointmentStore {
  appointments: AppointmentRow[] = [];
  leads: ALeadRow[] = [];
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addLead(partial: Partial<ALeadRow> & Pick<ALeadRow, "organizationId">): ALeadRow {
    const row: ALeadRow = {
      id: partial.id ?? this.nextId("lead"),
      organizationId: partial.organizationId,
      firstName: partial.firstName ?? "Test",
      lastName: partial.lastName ?? "Lead",
      stage: partial.stage ?? ("TO_HANDLE" as LeadStage),
      deletedAt: partial.deletedAt ?? null,
    };
    this.leads.push(row);
    return row;
  }

  addAppointment(
    partial: Partial<AppointmentRow> & Pick<AppointmentRow, "organizationId">,
  ): AppointmentRow {
    const now = partial.createdAt ?? new Date("2026-06-01T00:00:00.000Z");
    const row: AppointmentRow = {
      id: partial.id ?? this.nextId("appt"),
      organizationId: partial.organizationId,
      leadId: partial.leadId ?? null,
      ownerId: partial.ownerId ?? null,
      startAt: partial.startAt ?? new Date("2026-06-10T09:00:00.000Z"),
      reason: partial.reason ?? "Call",
      status: partial.status ?? AppointmentStatus.PENDING,
      provider: partial.provider ?? null,
      externalEventId: partial.externalEventId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.appointments.push(row);
    return row;
  }

  appointment(index = 0): AppointmentRow {
    const row = this.appointments[index];
    if (!row) throw new Error(`no appointment at index ${index}`);
    return row;
  }
}

type Where = Record<string, unknown>;

function makeP2025(): Error {
  const err = new Error("Record not found.") as Error & { code: string };
  err.code = "P2025";
  err.name = "PrismaClientKnownRequestError";
  return err;
}

/**
 * Build a tenant-scoped fake bound to `organizationId`, backed by the shared
 * store. Mirrors the real extension's scoping for the operations the use cases
 * call.
 */
export function appointmentClientFor(
  store: AppointmentStore,
  organizationId: string,
): TenantPrismaClient {
  const own = (): AppointmentRow[] =>
    store.appointments.filter((a) => a.organizationId === organizationId);

  const matches = (appt: AppointmentRow, where: Where): boolean => {
    if (where.id !== undefined && appt.id !== where.id) return false;
    if (where.leadId !== undefined && appt.leadId !== where.leadId) return false;
    if (where.status !== undefined && appt.status !== where.status) return false;
    if (where.startAt && typeof where.startAt === "object") {
      const range = where.startAt as { gte?: Date; lt?: Date };
      if (range.gte && appt.startAt < range.gte) return false;
      if (range.lt && appt.startAt >= range.lt) return false;
    }
    return true;
  };

  const toRow = (appt: AppointmentRow): Record<string, unknown> => {
    const lead = appt.leadId
      ? store.leads.find((l) => l.id === appt.leadId && l.organizationId === organizationId)
      : null;
    return {
      id: appt.id,
      startAt: appt.startAt,
      reason: appt.reason,
      status: appt.status,
      leadId: appt.leadId,
      lead: lead
        ? { id: lead.id, firstName: lead.firstName, lastName: lead.lastName }
        : null,
    };
  };

  const client = {
    appointment: {
      findUnique: async ({ where }: { where: Where }) => {
        const appt = own().find((a) => a.id === where.id);
        if (!appt) return null;
        // Mimic Prisma `select`: callers pass a `select` of {id, leadId} or the
        // full list select. We return a superset and let the caller pick.
        return { ...toRow(appt) };
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
        let rows = own().filter((a) => matches(a, where));
        if (orderBy && "startAt" in orderBy) {
          const dir = orderBy.startAt;
          rows = [...rows].sort((a, b) =>
            dir === "asc"
              ? a.startAt.getTime() - b.startAt.getTime()
              : b.startAt.getTime() - a.startAt.getTime(),
          );
        }
        const sliced = take === undefined ? rows.slice(skip) : rows.slice(skip, skip + take);
        return sliced.map(toRow);
      },
      count: async ({ where = {} }: { where?: Where }) =>
        own().filter((a) => matches(a, where)).length,
      groupBy: async ({ where = {} }: { by: string[]; where?: Where }) => {
        const rows = own().filter((a) => matches(a, where));
        const byStatus = new Map<AppointmentStatus, number>();
        for (const a of rows) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
        return [...byStatus.entries()].map(([status, n]) => ({
          status,
          _count: { _all: n },
        }));
      },
      create: async ({ data, select }: { data: Where; select?: Where }) => {
        const row = store.addAppointment({
          organizationId,
          leadId: (data.leadId as string | null) ?? null,
          ownerId: (data.ownerId as string | null) ?? null,
          startAt: data.startAt as Date,
          reason: data.reason as string,
          status: (data.status as AppointmentStatus) ?? AppointmentStatus.PENDING,
        });
        return select ? { id: row.id } : row;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.appointments.find(
          (a) => a.id === where.id && a.organizationId === organizationId,
        );
        if (!row) throw makeP2025();
        if ("startAt" in data) row.startAt = data.startAt as Date;
        if ("reason" in data) row.reason = data.reason as string;
        if ("status" in data) row.status = data.status as AppointmentStatus;
        if (data.lead && typeof data.lead === "object") {
          const op = data.lead as { connect?: { id: string }; disconnect?: boolean };
          if (op.connect) row.leadId = op.connect.id;
          if (op.disconnect) row.leadId = null;
        }
        row.updatedAt = new Date();
        return { id: row.id };
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.appointments.findIndex(
          (a) => a.id === where.id && a.organizationId === organizationId,
        );
        if (idx === -1) throw makeP2025();
        const [row] = store.appointments.splice(idx, 1);
        return { id: row?.id ?? where.id };
      },
    },
    lead: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.leads.find(
          (l) =>
            l.id === where.id && l.organizationId === organizationId && l.deletedAt === null,
        );
        return row ? { id: row.id } : null;
      },
    },
    // The month aggregate uses `$queryRaw` with a tagged-template `Prisma.sql`.
    // We approximate it: extract the tenant id + year/month from the SQL `values`
    // and bucket the tenant's appointments by their UTC day in that month.
    $queryRaw: (async (
      query: { values?: unknown[] },
    ): Promise<Array<{ day: number; count: bigint }>> => {
      const values = query.values ?? [];
      // values order (see get-appointments-for-month.ts): [tz, orgId, year,
      // month, year, month]. Find the org id (a string starting with the org
      // prefix) and the first numeric pair as year/month.
      const orgId = values.find(
        (v): v is string => typeof v === "string" && v === organizationId,
      );
      const numbers = values.filter((v): v is number => typeof v === "number");
      const year = numbers[0];
      const month = numbers[1];
      if (orgId === undefined || year === undefined || month === undefined) {
        return [];
      }
      const counts = new Map<number, number>();
      for (const a of own()) {
        if (
          a.startAt.getUTCFullYear() === year &&
          a.startAt.getUTCMonth() + 1 === month
        ) {
          const day = a.startAt.getUTCDate();
          counts.set(day, (counts.get(day) ?? 0) + 1);
        }
      }
      return [...counts.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([day, count]) => ({ day, count: BigInt(count) }));
    }) as unknown as TenantPrismaClient["$queryRaw"],
  };

  return client as unknown as TenantPrismaClient;
}

export function collectingAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

/** Build AppointmentDeps bound to a tenant; returns the audit sink for asserts. */
export function buildFakeAppointmentDeps(
  store: AppointmentStore,
  organizationId: string,
  userId: string,
): { deps: AppointmentDeps; audits: AuditEvent[] } {
  const audits: AuditEvent[] = [];
  return {
    deps: {
      prisma: appointmentClientFor(store, organizationId),
      audit: collectingAudit(audits),
      actor: { organizationId, userId },
    },
    audits,
  };
}
