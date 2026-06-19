import { prisma } from "@/lib/prisma";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import { getTokenCipher } from "@/lib/crypto";
import type { TenantContext } from "@/lib/tenant";
import type { CalendarProviderType } from "@/generated/prisma/enums";
import { createAuditLogger } from "@/server/audit/audit-log";
import {
  type CalendarConnectionStore,
  type ConnectionPrisma,
  createConnectionStore,
} from "@/server/calendar/connection-store";

/**
 * Wiring helpers for the calendar integration use cases (docs/00 §1).
 *
 * The token cipher (AES-256-GCM) is injected into the connection store so the
 * store is the single place that encrypts/decrypts tokens at rest. The store
 * receives the TENANT-SCOPED Prisma client for session-bound flows (connect /
 * callback / disconnect / outbound sync) so every connection read/write is forced
 * to the tenant + user.
 */

/** Connection store for an authenticated tenant context (session-bound flows). */
export function buildConnectionStore(ctx: TenantContext): CalendarConnectionStore {
  const tenantPrisma = getTenantPrisma(ctx) as unknown as ConnectionPrisma;
  return createConnectionStore(tenantPrisma, getTokenCipher());
}

/**
 * Connection store for the WEBHOOK path (no session). Uses the BASE client
 * because the inbound event has no tenant context; the connection row carries the
 * authoritative `organizationId` and the lookup is by `(provider,
 * providerAccountId)`. The downstream import then builds a tenant-scoped client.
 */
export function buildWebhookConnectionStore(): CalendarConnectionStore {
  return createConnectionStore(prisma as unknown as ConnectionPrisma, getTokenCipher());
}

export function buildAudit() {
  return createAuditLogger(prisma);
}

/** Re-export for callers that only need the provider type. */
export type { CalendarProviderType };
