import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";

/**
 * Dipendenze degli use case di Insight & Stats.
 *
 * Come per i lead, il client Prisma è quello TENANT-SCOPED: `organizationId` è
 * iniettato al livello dati, quindi un `where` dimenticato non può far uscire
 * dati da un altro tenant. `actor` arriva dalla sessione, mai dal client.
 * `now` è iniettabile per rendere deterministici i test che dipendono da "oggi"
 * (giorni futuri non scrivibili).
 */
export interface InsightActor {
  readonly organizationId: string;
  readonly userId: string;
}

export interface InsightDeps {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly actor: InsightActor;
  readonly now?: () => Date;
}

export function clockNow(deps: Pick<InsightDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}
