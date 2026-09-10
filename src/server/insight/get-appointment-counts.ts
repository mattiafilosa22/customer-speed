import type { ChannelGroup } from "@/server/insight/channels";
import { emptyCountsByGroup, type DerivedCount } from "@/server/insight/counts";
import type { InsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";
import { attributeAppointments } from "@/server/insight/attribution";
import { parseInput } from "@/server/validation";

/**
 * Appuntamenti derivati, per giorno e per colonna — aggregatore sottile sopra
 * `attributeAppointments` (regola del primo appuntamento, spec §Decisioni 4;
 * dettagli e ottimizzazione query in `attribution.ts`).
 */
export interface AppointmentCounts {
  readonly byDay: ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>;
  /** Lead della provenienza collegata SENZA canale: alimenta l'avviso in pagina. */
  readonly unattributedLeadCount: number;
}

export async function getAppointmentCounts(
  deps: InsightDeps,
  config: InsightConfig,
  input: unknown,
): Promise<AppointmentCounts> {
  const month = parseInput(monthSchema, input);
  const { attributed, unattributedLeadCount } = await attributeAppointments(deps, config, month);

  const byDay = new Map<string, Record<ChannelGroup, DerivedCount>>();
  for (const { dayKey, group, createdFromInsight } of attributed) {
    const dayCounts = byDay.get(dayKey) ?? emptyCountsByGroup();
    dayCounts[group] = {
      total: dayCounts[group].total + 1,
      fromInsight: dayCounts[group].fromInsight + (createdFromInsight ? 1 : 0),
    };
    byDay.set(dayKey, dayCounts);
  }

  return { byDay, unattributedLeadCount };
}
