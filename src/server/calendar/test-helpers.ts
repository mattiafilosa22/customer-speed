import { AppointmentStatus, type CalendarProviderType } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { ConnectionPrisma } from "@/server/calendar/connection-store";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";

/**
 * In-memory fakes for the calendar use-case tests (NO DB, NO network).
 *
 * `FakeTenantDb` models the rows the calendar use cases touch (leads,
 * appointments, calendar connections) and exposes a Prisma-shaped surface that
 * ENFORCES tenant scoping the way the real client extension does: every read is
 * filtered by `organizationId`, every create stamps it. This lets the tests
 * assert cross-tenant isolation against a faithful stand-in.
 */

let seq = 0;
const id = (prefix: string) => `${prefix}_${++seq}`;

export interface FakeLead {
  id: string;
  organizationId: string;
  email: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface FakeAppointment {
  id: string;
  organizationId: string;
  leadId: string | null;
  startAt: Date;
  reason: string;
  status: AppointmentStatus;
  provider: CalendarProviderType | null;
  externalEventId: string | null;
}

export interface FakeConnection {
  id: string;
  organizationId: string;
  userId: string;
  provider: CalendarProviderType;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  providerAccountId: string | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;

function matchesScalar(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    const c = condition as Record<string, unknown>;
    if ("equals" in c) {
      const eq = c.equals;
      if (c.mode === "insensitive" && typeof value === "string" && typeof eq === "string") {
        return value.toLowerCase() === eq.toLowerCase();
      }
      return value === eq;
    }
    return false;
  }
  return value === condition;
}

export class FakeTenantDb {
  readonly leads: FakeLead[] = [];
  readonly appointments: FakeAppointment[] = [];
  readonly connections: FakeConnection[] = [];

  addLead(input: { organizationId: string; email?: string | null; deletedAt?: Date | null }): FakeLead {
    const lead: FakeLead = {
      id: id("lead"),
      organizationId: input.organizationId,
      email: input.email ?? null,
      createdAt: new Date(),
      deletedAt: input.deletedAt ?? null,
    };
    this.leads.push(lead);
    return lead;
  }

  addConnection(input: Omit<FakeConnection, "id" | "createdAt">): FakeConnection {
    const conn: FakeConnection = { id: id("conn"), createdAt: new Date(), ...input };
    this.connections.push(conn);
    return conn;
  }

  /** Tenant-scoped Prisma surface for a given org (mirrors the real extension). */
  tenant(organizationId: string): TenantPrismaClient {
    // Capture array references (not `this`) to satisfy no-this-alias.
    const { leads, appointments } = this;
    const connectionSurface = this.connectionSurface.bind(this);
    const db = { leads, appointments };
    const client = {
      lead: {
        findFirst(args: { where?: Where }) {
          const where = args.where ?? {};
          const found = db.leads.find(
            (l) =>
              l.organizationId === organizationId &&
              l.deletedAt === null &&
              ("email" in where ? matchesScalar(l.email, where.email) : true),
          );
          return Promise.resolve(found ? { id: found.id } : null);
        },
      },
      appointment: {
        findFirst(args: { where?: Where }) {
          const where = args.where ?? {};
          const found = db.appointments.find(
            (a) =>
              a.organizationId === organizationId &&
              ("provider" in where ? a.provider === where.provider : true) &&
              ("externalEventId" in where
                ? a.externalEventId === where.externalEventId
                : true),
          );
          return Promise.resolve(found ? { id: found.id, status: found.status } : null);
        },
        findUnique(args: { where: { id: string } }) {
          const found = db.appointments.find(
            (a) => a.id === args.where.id && a.organizationId === organizationId,
          );
          if (!found) return Promise.resolve(null);
          const lead = found.leadId
            ? db.leads.find((l) => l.id === found.leadId)
            : null;
          return Promise.resolve({
            id: found.id,
            startAt: found.startAt,
            reason: found.reason,
            provider: found.provider,
            externalEventId: found.externalEventId,
            leadId: found.leadId,
            status: found.status,
            lead: lead ? { email: lead.email } : null,
          });
        },
        create(args: { data: Record<string, unknown> }) {
          const d = args.data;
          const appt: FakeAppointment = {
            id: id("appt"),
            organizationId,
            leadId: (d.leadId as string | null) ?? null,
            startAt: d.startAt as Date,
            reason: d.reason as string,
            status: (d.status as AppointmentStatus) ?? AppointmentStatus.PENDING,
            provider: (d.provider as CalendarProviderType | null) ?? null,
            externalEventId: (d.externalEventId as string | null) ?? null,
          };
          db.appointments.push(appt);
          return Promise.resolve({ id: appt.id });
        },
        update(args: { where: { id: string }; data: Record<string, unknown> }) {
          const appt = db.appointments.find(
            (a) => a.id === args.where.id && a.organizationId === organizationId,
          );
          if (!appt) throw new Error("appointment not found (tenant scope)");
          const d = args.data;
          if (d.startAt !== undefined) appt.startAt = d.startAt as Date;
          if (d.reason !== undefined) appt.reason = d.reason as string;
          if (d.status !== undefined) appt.status = d.status as AppointmentStatus;
          if (d.provider !== undefined) appt.provider = d.provider as CalendarProviderType;
          if (d.externalEventId !== undefined) {
            appt.externalEventId = d.externalEventId as string;
          }
          const lead = d.lead as { connect?: { id: string } } | undefined;
          if (lead?.connect) appt.leadId = lead.connect.id;
          return Promise.resolve({ id: appt.id });
        },
      },
      calendarConnection: connectionSurface(organizationId),
    };
    return client as unknown as TenantPrismaClient;
  }

  /** Base (un-scoped) connection surface used by the webhook path lookup. */
  baseConnectionPrisma(): ConnectionPrisma {
    const surface = this.connectionSurface(undefined);
    return {
      calendarConnection: {
        upsert: surface.upsert,
        findUnique: surface.findUnique,
        findMany: surface.findMany,
        update: surface.update,
        delete: surface.delete,
      },
    };
  }

  /** Tenant-scoped connection surface (or un-scoped when organizationId is undefined). */
  private connectionSurface(organizationId: string | undefined) {
    const { connections } = this;
    const db = { connections };
    const scope = (c: FakeConnection) =>
      organizationId === undefined || c.organizationId === organizationId;

    return {
      upsert(args: {
        where: { userId_provider: { userId: string; provider: CalendarProviderType } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const { userId, provider } = args.where.userId_provider;
        const existing = db.connections.find(
          (c) => c.userId === userId && c.provider === provider && scope(c),
        );
        if (existing) {
          Object.assign(existing, args.update);
          return Promise.resolve({ id: existing.id });
        }
        const d = args.create;
        const conn: FakeConnection = {
          id: id("conn"),
          organizationId: organizationId ?? (d.organizationId as string) ?? "org_unknown",
          userId: d.userId as string,
          provider,
          accessToken: d.accessToken as string,
          refreshToken: (d.refreshToken as string | null) ?? null,
          expiresAt: (d.expiresAt as Date | null) ?? null,
          scope: (d.scope as string | null) ?? null,
          providerAccountId: (d.providerAccountId as string | null) ?? null,
          createdAt: new Date(),
        };
        db.connections.push(conn);
        return Promise.resolve({ id: conn.id });
      },
      findUnique(args: {
        where: { userId_provider: { userId: string; provider: CalendarProviderType } };
      }) {
        const { userId, provider } = args.where.userId_provider;
        const found = db.connections.find(
          (c) => c.userId === userId && c.provider === provider && scope(c),
        );
        return Promise.resolve(found ?? null);
      },
      findMany(args: { where: Where; take?: number }) {
        const where = args.where;
        const found = db.connections.filter(
          (c) =>
            scope(c) &&
            ("provider" in where ? c.provider === where.provider : true) &&
            ("providerAccountId" in where
              ? c.providerAccountId === where.providerAccountId
              : true) &&
            ("userId" in where ? c.userId === where.userId : true),
        );
        return Promise.resolve(args.take ? found.slice(0, args.take) : found);
      },
      update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const conn = db.connections.find((c) => c.id === args.where.id && scope(c));
        if (!conn) throw new Error("connection not found");
        Object.assign(conn, args.data);
        return Promise.resolve({ id: conn.id });
      },
      delete(args: {
        where: { userId_provider: { userId: string; provider: CalendarProviderType } };
      }) {
        const { userId, provider } = args.where.userId_provider;
        const idx = db.connections.findIndex(
          (c) => c.userId === userId && c.provider === provider && scope(c),
        );
        if (idx === -1) {
          return Promise.reject(new Error("not found"));
        }
        const [removed] = db.connections.splice(idx, 1);
        return Promise.resolve({ id: removed!.id });
      },
    };
  }
}

/** Collecting audit logger for assertions. */
export function fakeAudit(): { audit: AuditLogger; events: AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    events,
    audit: {
      record(event: AuditEvent) {
        events.push(event);
        return Promise.resolve();
      },
    },
  };
}
