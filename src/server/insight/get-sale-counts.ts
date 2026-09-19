import type { ChannelGroup } from "@/server/insight/channels";
import { emptyCountsByGroup, type DerivedCount } from "@/server/insight/counts";
import type { InsightConfig } from "@/server/insight/config";
import type { InsightDeps } from "@/server/insight/deps";
import { monthSchema } from "@/server/insight/schemas";
import { attributeSales } from "@/server/insight/attribution";
import { parseInput } from "@/server/validation";

/** Vendite derivate per giorno e colonna, aggregate dall'attribuzione condivisa. */
export async function getSaleCounts(
  deps: InsightDeps,
  config: InsightConfig,
  input: unknown,
): Promise<ReadonlyMap<string, Readonly<Record<ChannelGroup, DerivedCount>>>> {
  const month = parseInput(monthSchema, input);
  const attributed = await attributeSales(deps, config, month);
  const byDay = new Map<string, Record<ChannelGroup, DerivedCount>>();

  for (const { dayKey, group, createdFromInsight } of attributed) {
    const dayCounts = byDay.get(dayKey) ?? emptyCountsByGroup();
    dayCounts[group] = {
      total: dayCounts[group].total + 1,
      fromInsight: dayCounts[group].fromInsight + (createdFromInsight ? 1 : 0),
    };
    byDay.set(dayKey, dayCounts);
  }

  return byDay;
}
