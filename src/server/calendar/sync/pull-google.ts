import { CalendarProviderType, type Role } from "@/generated/prisma/enums";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";
import { getValidAccessToken } from "@/server/calendar/access-token";
import type { CalendarConnectionStore, DecryptedConnection } from "@/server/calendar/connection-store";
import type { CalendarProvider } from "@/server/calendar/provider";
import { importEvents, type ImportEventsResult } from "@/server/calendar/sync/import-events";

/**
 * Pull recent Google events for a connection and import them (inbound half of the
 * bidirectional sync, docs/08 Fase 6). Triggered by the Google push-notification
 * webhook (which only signals "something changed", carrying no event data).
 *
 * Tenant safety: the connection row carries the authoritative `organizationId` /
 * `userId`; we build a tenant-scoped client from it before importing, so the
 * appointment writes + lead-by-email match are isolated to the right tenant.
 */

/** Default look-back/look-ahead window for an incremental pull. */
const PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export interface PullGoogleDeps {
  readonly provider: CalendarProvider;
  readonly store: CalendarConnectionStore;
  readonly audit: AuditLogger;
}

export async function pullGoogleConnection(
  deps: PullGoogleDeps,
  connection: DecryptedConnection,
  now: Date = new Date(),
): Promise<ImportEventsResult> {
  if (!deps.provider.listEvents) {
    return { created: 0, updated: 0, canceled: 0 };
  }

  const accessToken = await getValidAccessToken(deps.provider, deps.store, connection, now);
  const events = await deps.provider.listEvents(accessToken, {
    from: new Date(now.getTime() - PAST_WINDOW_MS),
    to: new Date(now.getTime() + FUTURE_WINDOW_MS),
  });

  const tenantPrisma = getTenantPrisma({
    kind: "tenant",
    organizationId: connection.organizationId,
    userId: connection.userId,
    role: "proUser" as Exclude<Role, "superAdmin">,
  });

  return importEvents({
    prisma: tenantPrisma,
    audit: deps.audit,
    organizationId: connection.organizationId,
    provider: CalendarProviderType.GOOGLE,
    events,
  });
}
