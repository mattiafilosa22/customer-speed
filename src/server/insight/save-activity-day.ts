import { ValidationError } from "@/lib/errors";
import { getInsightConfig } from "@/server/insight/config";
import { utcDayKey } from "@/server/insight/counts";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { saveActivityDaySchema } from "@/server/insight/schemas";
import { parseInput } from "@/server/validation";

/** Save the six manual counters while protecting future and archived days. */
export async function saveActivityDay(deps: InsightDeps, input: unknown): Promise<void> {
  const counters = parseInput(saveActivityDaySchema, input);
  const requestedDay = utcDayKey(counters.date);
  if (requestedDay > utcDayKey(clockNow(deps))) {
    throw new ValidationError({ date: ["insight.errors.futureDay"] });
  }

  const config = await getInsightConfig(deps);
  if (config?.activeFrom && counters.date < config.activeFrom) {
    throw new ValidationError({ date: ["insight.errors.archivedDay"] });
  }

  const { date, ...manualCounters } = counters;
  await deps.prisma.chatActivityDay.upsert({
    where: { organizationId_date: { organizationId: deps.actor.organizationId, date } },
    create: { organizationId: deps.actor.organizationId, date, ...manualCounters },
    update: manualCounters,
  });

  await deps.audit.record({
    action: "insight.activityDay.save",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "ChatActivityDay",
    entityId: requestedDay,
  });
}
