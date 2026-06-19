import type { CalendarProviderType } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";
import type { CalendarConnectionStore } from "@/server/calendar/connection-store";
import type { CalendarProvider } from "@/server/calendar/provider";

/**
 * Dependencies for the calendar sync use cases (DIP, docs/00 §1). Everything the
 * sync needs is injected so the use cases are pure and unit-testable with fakes:
 *  - `prisma`: TENANT-SCOPED client (forces `organizationId` on every access);
 *  - `provider`: the abstract {@link CalendarProvider};
 *  - `store`: the encrypted {@link CalendarConnectionStore};
 *  - `audit`: the {@link AuditLogger};
 *  - `actor`: the SERVER-resolved identity (never client input).
 */
export interface SyncActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface CalendarSyncDeps {
  readonly prisma: TenantPrismaClient;
  readonly provider: CalendarProvider;
  readonly store: CalendarConnectionStore;
  readonly audit: AuditLogger;
  readonly actor: SyncActor;
  readonly providerType: CalendarProviderType;
}
