import { vi } from "vitest";

import type { PasswordHasher } from "@/lib/password";
import type { RateLimiter, RateLimitResult } from "@/lib/rate-limit";
import type { RecaptchaVerification } from "@/lib/recaptcha";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { AuditEvent, AuditLogger } from "@/server/audit/audit-log";
import type { AuthDeps } from "@/server/auth/deps";
import { LoggingEmailSender } from "@/server/email/logging-sender";

/**
 * In-memory fakes for the auth use cases. No DB, no crypto cost: the hasher is a
 * trivial reversible stub so tests are fast and deterministic. The fake Prisma
 * models exactly the operations the use cases call.
 */

export interface FakeUserRow {
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
}

interface FakeTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export class FakeDb {
  users: FakeUserRow[] = [];
  consents: Array<Record<string, unknown>> = [];
  emailTokens: FakeTokenRow[] = [];
  resetTokens: FakeTokenRow[] = [];
  audits: AuditEvent[] = [];
  private seq = 0;
  /** Internal id generator (public so the fake-prisma factory can use it). */
  nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  addUser(
    partial: Partial<FakeUserRow> & Pick<FakeUserRow, "organizationId" | "email">,
  ): FakeUserRow {
    const row: FakeUserRow = {
      id: partial.id ?? this.nextId("user"),
      organizationId: partial.organizationId,
      email: partial.email,
      name: partial.name ?? "Test",
      passwordHash: partial.passwordHash ?? null,
      role: partial.role ?? "baseUser",
      isActive: partial.isActive ?? true,
      emailVerified: partial.emailVerified ?? null,
      sessionVersion: partial.sessionVersion ?? 0,
      lastLoginAt: partial.lastLoginAt ?? null,
    };
    this.users.push(row);
    return row;
  }

  /** Test accessors that assert presence (avoid `possibly undefined` noise). */
  user(index = 0): FakeUserRow {
    const row = this.users[index];
    if (!row) throw new Error(`no user at index ${index}`);
    return row;
  }
  emailToken(index = 0): FakeTokenRow {
    const row = this.emailTokens[index];
    if (!row) throw new Error(`no email token at index ${index}`);
    return row;
  }
  resetToken(index = 0): FakeTokenRow {
    const row = this.resetTokens[index];
    if (!row) throw new Error(`no reset token at index ${index}`);
    return row;
  }

  /** Build a Prisma-shaped fake covering only the ops the use cases use. */
  asPrisma(): PrismaClient {
    return createFakePrisma(this);
  }
}

/** Standalone factory (avoids aliasing `this`): builds a Prisma-shaped fake. */
function createFakePrisma(db: FakeDb): PrismaClient {
  const findUserByUnique = (where: Record<string, unknown>): FakeUserRow | null => {
    if (where.id) return db.users.find((u) => u.id === where.id) ?? null;
    const composite = where.organizationId_email as
      | { organizationId: string; email: string }
      | undefined;
    if (composite) {
      return (
        db.users.find(
          (u) => u.organizationId === composite.organizationId && u.email === composite.email,
        ) ?? null
      );
    }
    return null;
  };

  const client = {
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => findUserByUnique(where),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        db.users.find(
          (u) =>
            (where.organizationId === undefined || u.organizationId === where.organizationId) &&
            (where.email === undefined || u.email === where.email),
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) =>
        db.addUser({
          organizationId: data.organizationId as string,
          email: data.email as string,
          name: data.name as string,
          passwordHash: (data.passwordHash as string) ?? null,
          role: (data.role as Role) ?? "baseUser",
          emailVerified: (data.emailVerified as Date | null) ?? null,
        }),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = db.users.find((x) => x.id === where.id);
        if (!u) throw new Error("user not found");
        if (typeof data.passwordHash === "string") u.passwordHash = data.passwordHash;
        if (data.emailVerified instanceof Date) u.emailVerified = data.emailVerified;
        if (data.lastLoginAt instanceof Date) u.lastLoginAt = data.lastLoginAt;
        const sv = data.sessionVersion as { increment?: number } | undefined;
        if (sv?.increment) u.sessionVersion += sv.increment;
        return { ...u };
      },
    },
    consent: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        db.consents.push(...data);
        return { count: data.length };
      },
    },
    emailVerificationToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeTokenRow = {
          id: db.nextId("evt"),
          userId: data.userId as string,
          tokenHash: data.tokenHash as string,
          expiresAt: data.expiresAt as Date,
          consumedAt: null,
        };
        db.emailTokens.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = db.emailTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        const user = db.users.find((u) => u.id === row.userId);
        return { ...row, user: { organizationId: user?.organizationId ?? "" } };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.emailTokens.find((t) => t.id === where.id);
        if (row && data.consumedAt instanceof Date) row.consumedAt = data.consumedAt;
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; consumedAt: null };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const t of db.emailTokens) {
          if (t.userId === where.userId && t.consumedAt === null) {
            t.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
    passwordResetToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeTokenRow = {
          id: db.nextId("prt"),
          userId: data.userId as string,
          tokenHash: data.tokenHash as string,
          expiresAt: data.expiresAt as Date,
          consumedAt: null,
        };
        db.resetTokens.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const row = db.resetTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!row) return null;
        const user = db.users.find((u) => u.id === row.userId);
        return { ...row, user: { organizationId: user?.organizationId ?? "" } };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = db.resetTokens.find((t) => t.id === where.id);
        if (row && data.consumedAt instanceof Date) row.consumedAt = data.consumedAt;
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; consumedAt: null };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const t of db.resetTokens) {
          if (t.userId === where.userId && t.consumedAt === null) {
            t.consumedAt = data.consumedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async ({ data }: { data: AuditEvent }) => {
        db.audits.push(data);
        return data;
      },
    },
    // Inline transaction: run the callback against this same fake client.
    $transaction: async <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> =>
      fn(client as unknown as PrismaClient),
  };

  return client as unknown as PrismaClient;
}

/** Reversible stub hasher: fast, deterministic. `hash(p) = "h:" + p`. */
export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `h:${plain}`,
  verify: async (candidate, stored) => stored === `h:${candidate}`,
};

export function allowAllRateLimiter(): RateLimiter {
  const r: RateLimitResult = { allowed: true, remaining: 99, retryAfterSeconds: 0 };
  return { consume: async () => r, reset: async () => {} };
}

export function blockAllRateLimiter(): RateLimiter {
  const r: RateLimitResult = { allowed: false, remaining: 0, retryAfterSeconds: 60 };
  return { consume: async () => r, reset: async () => {} };
}

export function fakeAudit(sink: AuditEvent[]): AuditLogger {
  return { record: async (e) => void sink.push(e) };
}

export function recaptchaReturning(outcome: RecaptchaVerification["outcome"]) {
  return vi.fn(async (): Promise<RecaptchaVerification> => ({ outcome }));
}

/** Build AuthDeps wired to the fakes. */
export function buildFakeDeps(db: FakeDb, overrides: Partial<AuthDeps> = {}): AuthDeps {
  const sink = db.audits;
  return {
    prisma: db.asPrisma(),
    hasher: fakeHasher,
    email: new LoggingEmailSender({ info: () => {} }),
    audit: fakeAudit(sink),
    rateLimiter: allowAllRateLimiter(),
    verifyRecaptcha: recaptchaReturning("ok") as unknown as AuthDeps["verifyRecaptcha"],
    appUrl: "http://localhost:3000",
    requestMeta: { ip: "1.2.3.4", userAgent: "vitest" },
    now: () => new Date("2026-06-18T12:00:00.000Z"),
    ...overrides,
  };
}
