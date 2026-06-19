import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * AuditLog writer for security-sensitive events (auth, cross-tenant access,
 * lead changes) per docs/06 §6.4. Kept as a small port so use cases depend on
 * `AuditLogger`, not on Prisma directly.
 *
 * Never log secrets/PII beyond what's necessary: `meta` should carry identifiers
 * and outcomes, not passwords or tokens.
 */

export interface AuditEvent {
  readonly action: string; // "auth.login", "auth.register", ...
  readonly organizationId?: string | null;
  readonly actorId?: string | null;
  readonly entity?: string | null;
  readonly entityId?: string | null;
  readonly meta?: Prisma.InputJsonValue;
  readonly ip?: string | null;
}

export interface AuditLogger {
  record(event: AuditEvent): Promise<void>;
}

/** Minimal Prisma surface the writer needs (eases faking in tests). */
type AuditCapableClient = Pick<PrismaClient, "auditLog">;

/** Prisma-backed audit logger. Writes are best-effort but errors propagate. */
export function createAuditLogger(client: AuditCapableClient): AuditLogger {
  return {
    async record(event: AuditEvent): Promise<void> {
      await client.auditLog.create({
        data: {
          action: event.action,
          organizationId: event.organizationId ?? null,
          actorId: event.actorId ?? null,
          entity: event.entity ?? null,
          entityId: event.entityId ?? null,
          meta: event.meta,
          ip: event.ip ?? null,
        },
      });
    },
  };
}
