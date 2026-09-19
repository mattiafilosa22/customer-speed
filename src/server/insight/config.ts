import type { InsightDeps } from "@/server/insight/deps";

/**
 * Configurazione della sezione per il tenant corrente.
 *
 * `null` significa "sezione non configurata": il flag è acceso ma nessuna
 * provenienza è collegata. In quel caso la pagina spiega cosa manca invece di
 * mostrare una tabella vuota e inspiegabile.
 */
export interface InsightConfig {
  readonly sourceId: string;
  /** Confine archivio/dato vivo; `null` = nessun archivio importato. */
  readonly activeFrom: Date | null;
}

export async function getInsightConfig(deps: InsightDeps): Promise<InsightConfig | null> {
  const organization = await deps.prisma.organization.findUnique({
    where: { id: deps.actor.organizationId },
    select: { insightSourceId: true, insightActiveFrom: true },
  });

  if (!organization?.insightSourceId) {
    return null;
  }

  return {
    sourceId: organization.insightSourceId,
    activeFrom: organization.insightActiveFrom ?? null,
  };
}
