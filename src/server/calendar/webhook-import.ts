import { CalendarProviderType, type Role } from "@/generated/prisma/enums";
import { getTenantPrisma } from "@/lib/prisma-tenant";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";
import type { CalendarConnectionStore } from "@/server/calendar/connection-store";
import type { CalendarProvider, ParsedWebhook } from "@/server/calendar/provider";
import { importEvents, type ImportEventsResult } from "@/server/calendar/sync/import-events";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";

/** Loads whether the tenant has calendar integrations enabled (injectable for tests). */
export type CalendarFlagLoader = (organizationId: string) => Promise<boolean>;

const defaultFlagLoader: CalendarFlagLoader = async (organizationId) => {
  const flags = await getTenantFeatureFlags(organizationId);
  return flags.calendarIntegrations;
};

/**
 * Factory that yields a TENANT-SCOPED Prisma client for a given org/user. The
 * default builds the real extension; tests inject a fake so no DB is needed.
 */
export type TenantPrismaFactory = (params: {
  organizationId: string;
  userId: string;
}) => TenantPrismaClient;

const defaultTenantPrismaFactory: TenantPrismaFactory = ({ organizationId, userId }) =>
  getTenantPrisma({
    kind: "tenant",
    organizationId,
    userId,
    role: "proUser" as Exclude<Role, "superAdmin">,
  });

/**
 * Inbound webhook → appointment import (docs/08 Fase 6, docs/06 §6.4).
 *
 * SECURITY — the tenant is NEVER taken from the payload:
 *  1. The provider has already VERIFIED the signature (`parseWebhook` throws on a
 *     bad/missing signature → the route maps it to 401).
 *  2. We resolve the OWNING connection by `(provider, providerAccountId)` against
 *     OUR DB. The connection row carries the authoritative `organizationId` and
 *     `userId`. If no connection matches, we IGNORE the event (a webhook for a
 *     provider account we don't know about cannot inject into any tenant).
 *  3. We then build a TENANT-SCOPED Prisma client bound to that connection's
 *     `organizationId`, so the appointment writes + the lead-by-email match are
 *     isolated to the correct tenant.
 *
 * Idempotency is handled downstream in {@link importEvents} (unique index on
 * `(organizationId, provider, externalEventId)`), so a replayed webhook updates
 * the same row instead of duplicating.
 */

export interface WebhookImportDeps {
  readonly provider: CalendarProvider;
  /** Base-client store: the webhook has no session, lookup is by provider account. */
  readonly store: CalendarConnectionStore;
  readonly audit: AuditLogger;
  /** Tenant-scoped Prisma factory; defaults to the real extension. */
  readonly tenantPrismaFactory?: TenantPrismaFactory;
  /** Tenant feature-flag loader; defaults to reading `Organization.featureFlags`. */
  readonly flagLoader?: CalendarFlagLoader;
}

export interface WebhookImportOutcome {
  /** Whether the event was attributable to a known connection. */
  readonly matched: boolean;
  readonly result: ImportEventsResult | null;
}

const EMPTY_RESULT: ImportEventsResult = { created: 0, updated: 0, canceled: 0 };

export async function handleVerifiedWebhook(
  deps: WebhookImportDeps,
  parsed: ParsedWebhook,
  providerType: CalendarProviderType,
): Promise<WebhookImportOutcome> {
  // No events (e.g. an ignored event type) → 200 no-op.
  if (parsed.events.length === 0) {
    return { matched: false, result: EMPTY_RESULT };
  }

  // The payload's account id is used ONLY to find a connection WE own.
  if (!parsed.providerAccountId) {
    return { matched: false, result: null };
  }
  const connection = await deps.store.getByProviderAccount(
    providerType,
    parsed.providerAccountId,
  );
  if (!connection) {
    // Unknown / ambiguous provider account: do not create anything (no single
    // tenant to attribute the event to).
    return { matched: false, result: null };
  }

  // Re-check the tenant's feature flag: a connection may outlive the flag being
  // turned OFF, or a stale upstream subscription may keep firing. A disabled
  // tenant must not receive imports (CLAUDE.md principle #5). 200 no-op.
  const flagLoader = deps.flagLoader ?? defaultFlagLoader;
  if (!(await flagLoader(connection.organizationId))) {
    return { matched: false, result: null };
  }

  // Build a tenant-scoped client from the AUTHORITATIVE org on the connection.
  const factory = deps.tenantPrismaFactory ?? defaultTenantPrismaFactory;
  const tenantPrisma = factory({
    organizationId: connection.organizationId,
    userId: connection.userId,
  });

  const result = await importEvents({
    prisma: tenantPrisma,
    audit: deps.audit,
    organizationId: connection.organizationId,
    provider: providerType,
    events: parsed.events,
  });

  return { matched: true, result };
}
