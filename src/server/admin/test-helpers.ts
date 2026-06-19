import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";
import type { LeadStage, Role } from "@/generated/prisma/enums";
import type { PasswordHasher } from "@/lib/password";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import { LoggingEmailSender } from "@/server/email/logging-sender";
import type { AdminDeps } from "@/server/admin/deps";

/**
 * In-memory fakes for the cross-tenant admin use cases. No DB; the fake models
 * exactly the operations the use cases call and faithfully implements the
 * cross-tenant reads/writes the BASE client would do — so tests can assert:
 *  - global aggregates fold counts across MULTIPLE tenants,
 *  - per-tenant scoping (the use cases pin `organizationId` defensively),
 *  - uniqueness (slug, [orgId,email]) and atomicity (rollback on conflict),
 *  - audit events are recorded for every action.
 *
 * IMPORTANT: the fake throws if a use case tries to read a `where` containing
 * NO `organizationId` for a tenant-scoped read it should never do — but the
 * admin legitimately reads cross-tenant, so most reads are global by design.
 */

export interface FakeOrg {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  appName: string;
  theme: unknown;
  featureFlags: unknown;
  logoUrl: string | null;
  faviconUrl: string | null;
  markFallback: string | null;
  poweredBy: boolean;
  createdAt: Date;
}

export interface FakeUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: Role;
  isActive: boolean;
  emailVerified: Date | null;
  sessionVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface FakeLead {
  id: string;
  organizationId: string;
  stage: LeadStage;
  deletedAt: Date | null;
}

export interface FakeInvoice {
  id: string;
  organizationId: string;
  netAmount: Prisma.Decimal;
}

interface FakeResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export class AdminFakeDb {
  orgs: FakeOrg[] = [];
  users: FakeUser[] = [];
  leads: FakeLead[] = [];
  invoices: FakeInvoice[] = [];
  resetTokens: FakeResetToken[] = [];
  leadSources: Array<Record<string, unknown>> = [];
  lossReasons: Array<Record<string, unknown>> = [];
  stageConfigs: Array<Record<string, unknown>> = [];
  audits: AuditEvent[] = [];
  /** Test hook: when set, `pipelineStageConfig.createMany` throws (rollback test). */
  failOnStageConfigCreate = false;
  private seq = 0;

  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addOrg(p: Partial<FakeOrg> & { slug: string }): FakeOrg {
    const row: FakeOrg = {
      id: p.id ?? this.nextId("org"),
      name: p.name ?? p.slug,
      slug: p.slug,
      customDomain: p.customDomain ?? null,
      appName: p.appName ?? "App",
      theme: p.theme ?? {},
      featureFlags: p.featureFlags ?? {},
      logoUrl: p.logoUrl ?? null,
      faviconUrl: p.faviconUrl ?? null,
      markFallback: p.markFallback ?? null,
      poweredBy: p.poweredBy ?? true,
      createdAt: p.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    };
    this.orgs.push(row);
    return row;
  }

  addUser(p: Partial<FakeUser> & Pick<FakeUser, "organizationId" | "email">): FakeUser {
    const row: FakeUser = {
      id: p.id ?? this.nextId("user"),
      organizationId: p.organizationId,
      email: p.email,
      name: p.name ?? "Test",
      passwordHash: p.passwordHash ?? null,
      role: p.role ?? "baseUser",
      isActive: p.isActive ?? true,
      emailVerified: p.emailVerified ?? null,
      sessionVersion: p.sessionVersion ?? 0,
      lastLoginAt: p.lastLoginAt ?? null,
      createdAt: p.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    };
    this.users.push(row);
    return row;
  }

  addLead(p: Partial<FakeLead> & Pick<FakeLead, "organizationId" | "stage">): FakeLead {
    const row: FakeLead = {
      id: p.id ?? this.nextId("lead"),
      organizationId: p.organizationId,
      stage: p.stage,
      deletedAt: p.deletedAt ?? null,
    };
    this.leads.push(row);
    return row;
  }

  addInvoice(organizationId: string, netAmount: string): FakeInvoice {
    const row: FakeInvoice = {
      id: this.nextId("inv"),
      organizationId,
      netAmount: new Prisma.Decimal(netAmount),
    };
    this.invoices.push(row);
    return row;
  }

  org(index = 0): FakeOrg {
    const row = this.orgs[index];
    if (!row) throw new Error(`no org at index ${index}`);
    return row;
  }
  userByEmail(organizationId: string, email: string): FakeUser | undefined {
    return this.users.find((u) => u.organizationId === organizationId && u.email === email);
  }

  asPrisma(): PrismaClient {
    return createFakePrisma(this);
  }
}

/** Matches a user row against a (possibly partial) Prisma `where`. */
function matchUser(u: FakeUser, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && u.id !== where.id) return false;
  if (where.organizationId !== undefined && u.organizationId !== where.organizationId) return false;
  if (where.email !== undefined && u.email !== where.email) return false;
  if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
  const role = where.role as { not?: string } | string | undefined;
  if (typeof role === "string" && u.role !== role) return false;
  if (role && typeof role === "object" && role.not !== undefined && u.role === role.not)
    return false;
  return true;
}

function createFakePrisma(db: AdminFakeDb): PrismaClient {
  const pick = (row: object, select?: Record<string, boolean>): Record<string, unknown> => {
    const source = row as Record<string, unknown>;
    if (!select) return { ...source };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) out[key] = source[key];
    return out;
  };

  const uniqueError = () =>
    Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const notFoundError = () =>
    Object.assign(new Error("Record to update not found"), { code: "P2025" });

  const client = {
    organization: {
      count: async () => db.orgs.length,
      findMany: async ({
        orderBy,
        skip = 0,
        take,
        select,
      }: {
        orderBy?: { createdAt?: "asc" | "desc" };
        skip?: number;
        take?: number;
        select?: Record<string, boolean>;
      }) => {
        let rows = [...db.orgs];
        if (orderBy?.createdAt === "desc")
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        else if (orderBy?.createdAt === "asc")
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        rows = rows.slice(skip, take === undefined ? undefined : skip + take);
        return rows.map((r) => pick(r, select));
      },
      findUnique: async ({
        where,
        select,
      }: {
        where: { id?: string; slug?: string };
        select?: Record<string, boolean>;
      }) => {
        const row = db.orgs.find(
          (o) => (where.id !== undefined && o.id === where.id) || (where.slug !== undefined && o.slug === where.slug),
        );
        return row ? pick(row, select) : null;
      },
      create: async ({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        if (db.orgs.some((o) => o.slug === data.slug)) throw uniqueError();
        const row = db.addOrg({
          name: data.name as string,
          slug: data.slug as string,
          appName: data.appName as string,
          theme: data.theme,
          featureFlags: data.featureFlags,
        });
        return pick(row, select);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = db.orgs.find((o) => o.id === where.id);
        if (!row) throw notFoundError();
        if (data.slug !== undefined && db.orgs.some((o) => o.id !== row.id && o.slug === data.slug))
          throw uniqueError();
        const mutable = row as unknown as Record<string, unknown>;
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) mutable[k] = v;
        }
        return { ...row };
      },
    },
    user: {
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        db.users.filter((u) => matchUser(u, where)).length,
      groupBy: async ({
        where = {},
      }: {
        by: string[];
        where?: Record<string, unknown>;
        _count?: unknown;
      }) => {
        const idsIn = (where.organizationId as { in?: string[] } | undefined)?.in;
        const filtered = db.users.filter((u) => {
          if (idsIn && !idsIn.includes(u.organizationId)) return false;
          return matchUser(u, { ...where, organizationId: undefined });
        });
        const byOrg = new Map<string, number>();
        for (const u of filtered) byOrg.set(u.organizationId, (byOrg.get(u.organizationId) ?? 0) + 1);
        return [...byOrg.entries()].map(([organizationId, c]) => ({
          organizationId,
          _count: { _all: c },
        }));
      },
      findMany: async ({
        where = {},
        skip = 0,
        take,
        select,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        skip?: number;
        take?: number;
        select?: Record<string, boolean>;
        orderBy?: { createdAt?: "asc" | "desc" };
      }) => {
        let rows = db.users.filter((u) => matchUser(u, where));
        if (orderBy?.createdAt === "asc")
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        rows = rows.slice(skip, take === undefined ? undefined : skip + take);
        return rows.map((r) => pick(r as unknown as Record<string, unknown>, select));
      },
      findUnique: async ({
        where,
        select,
      }: {
        where: { id?: string; organizationId_email?: { organizationId: string; email: string } };
        select?: Record<string, boolean>;
      }) => {
        let row: FakeUser | undefined;
        if (where.id) row = db.users.find((u) => u.id === where.id);
        else if (where.organizationId_email)
          row = db.userByEmail(
            where.organizationId_email.organizationId,
            where.organizationId_email.email,
          );
        return row ? pick(row as unknown as Record<string, unknown>, select) : null;
      },
      findFirst: async ({
        where = {},
        select,
      }: {
        where?: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        const row = db.users.find((u) => matchUser(u, where));
        return row ? pick(row as unknown as Record<string, unknown>, select) : null;
      },
      create: async ({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        if (db.userByEmail(data.organizationId as string, data.email as string))
          throw uniqueError();
        const row = db.addUser({
          organizationId: data.organizationId as string,
          email: data.email as string,
          name: data.name as string,
          role: (data.role as Role) ?? "baseUser",
          emailVerified: (data.emailVerified as Date | null) ?? null,
          passwordHash: (data.passwordHash as string | null) ?? null,
          isActive: (data.isActive as boolean) ?? true,
        });
        return pick(row as unknown as Record<string, unknown>, select);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = db.users.find((u) => u.id === where.id);
        if (!row) throw notFoundError();
        if (typeof data.role === "string") row.role = data.role as Role;
        if (typeof data.isActive === "boolean") row.isActive = data.isActive;
        const sv = data.sessionVersion as { increment?: number } | undefined;
        if (sv?.increment) row.sessionVersion += sv.increment;
        return { ...row };
      },
      updateMany: async ({
        where = {},
        data,
      }: {
        where?: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const u of db.users) {
          if (!matchUser(u, where)) continue;
          if (typeof data.isActive === "boolean") u.isActive = data.isActive;
          const sv = data.sessionVersion as { increment?: number } | undefined;
          if (sv?.increment) u.sessionVersion += sv.increment;
          count += 1;
        }
        return { count };
      },
    },
    lead: {
      count: async ({ where = {} }: { where?: Record<string, unknown> } = {}) =>
        db.leads.filter((l) => matchLead(l, where)).length,
      groupBy: async ({
        where = {},
      }: {
        by: string[];
        where?: Record<string, unknown>;
        _count?: unknown;
      }) => {
        const idsIn = (where.organizationId as { in?: string[] } | undefined)?.in;
        const filtered = db.leads.filter((l) => {
          if (idsIn && !idsIn.includes(l.organizationId)) return false;
          return matchLead(l, { ...where, organizationId: undefined });
        });
        const byOrg = new Map<string, number>();
        for (const l of filtered) byOrg.set(l.organizationId, (byOrg.get(l.organizationId) ?? 0) + 1);
        return [...byOrg.entries()].map(([organizationId, c]) => ({
          organizationId,
          _count: { _all: c },
        }));
      },
    },
    invoice: {
      aggregate: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
        const orgId = where.organizationId as string | undefined;
        const rows = db.invoices.filter((i) => orgId === undefined || i.organizationId === orgId);
        const sum = rows.reduce((acc, i) => acc.plus(i.netAmount), new Prisma.Decimal(0));
        return { _sum: { netAmount: rows.length === 0 ? null : sum } };
      },
    },
    leadSource: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        db.leadSources.push(...data);
        return { count: data.length };
      },
    },
    lossReason: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        db.lossReasons.push(...data);
        return { count: data.length };
      },
    },
    pipelineStageConfig: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        if (db.failOnStageConfigCreate) throw new Error("boom");
        db.stageConfigs.push(...data);
        return { count: data.length };
      },
    },
    passwordResetToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeResetToken = {
          id: db.nextId("prt"),
          userId: data.userId as string,
          tokenHash: data.tokenHash as string,
          expiresAt: data.expiresAt as Date,
          consumedAt: null,
        };
        db.resetTokens.push(row);
        return row;
      },
    },
    auditLog: {
      create: async ({ data }: { data: AuditEvent }) => {
        db.audits.push(data);
        return data;
      },
    },
    // Atomic transaction: snapshot state, run; on throw, restore the snapshot so
    // tests can assert rollback (nothing partially created).
    $transaction: async <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => {
      const snapshot = {
        orgs: [...db.orgs],
        users: [...db.users],
        resetTokens: [...db.resetTokens],
        leadSources: [...db.leadSources],
        lossReasons: [...db.lossReasons],
        stageConfigs: [...db.stageConfigs],
      };
      try {
        return await fn(client as unknown as PrismaClient);
      } catch (error) {
        db.orgs = snapshot.orgs;
        db.users = snapshot.users;
        db.resetTokens = snapshot.resetTokens;
        db.leadSources = snapshot.leadSources;
        db.lossReasons = snapshot.lossReasons;
        db.stageConfigs = snapshot.stageConfigs;
        throw error;
      }
    },
  };

  return client as unknown as PrismaClient;
}

function matchLead(l: FakeLead, where: Record<string, unknown>): boolean {
  if (where.organizationId !== undefined && l.organizationId !== where.organizationId) return false;
  if (where.deletedAt !== undefined && l.deletedAt !== where.deletedAt) return false;
  if (where.stage !== undefined && l.stage !== where.stage) return false;
  return true;
}

/** Fast deterministic stub hasher (avoids Argon2 cost in unit tests). */
export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `h:${plain}`,
  verify: async (candidate, stored) => stored === `h:${candidate}`,
};

export function fakeAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

/** Build `AdminDeps` wired to the fakes. */
export function buildFakeAdminDeps(
  db: AdminFakeDb,
  overrides: Partial<AdminDeps> = {},
): AdminDeps {
  return {
    prisma: db.asPrisma(),
    hasher: fakeHasher,
    audit: fakeAudit(db.audits),
    email: new LoggingEmailSender({ info: () => {} }),
    actor: { superAdminUserId: "sa_1" },
    appUrl: "http://localhost:3000",
    now: () => new Date("2026-06-18T12:00:00.000Z"),
    ...overrides,
  };
}
