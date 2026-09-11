import { periodRange } from "@/server/dashboard/period";
import { getInsightConfig } from "@/server/insight/config";
import { type DerivedCount, utcDayKey, ZERO_COUNT } from "@/server/insight/counts";
import { clockNow, type InsightDeps } from "@/server/insight/deps";
import { getActivityDays } from "@/server/insight/get-activity-days";
import { getAppointmentCounts } from "@/server/insight/get-appointment-counts";
import { getSaleCounts } from "@/server/insight/get-sale-counts";
import { monthSchema } from "@/server/insight/schemas";
import {
  conversionRates,
  sumColumns,
  type ColumnTotals,
  type ConversionRates,
} from "@/server/insight/totals";
import { parseInput } from "@/server/validation";

/** Counts shared by each derived channel in the month view. */
export interface ChannelDayCounts {
  readonly appointments: number;
  readonly appointmentsFromInsight: number;
  readonly sales: number;
  readonly salesFromInsight: number;
}

/** Public shape of one calendar day; assembled by Task 8. */
export interface MonthDayRow {
  readonly date: string;
  readonly isArchived: boolean;
  readonly isFuture: boolean;
  readonly welcome: ChannelDayCounts & { readonly sent: number; readonly replies: number };
  readonly outbound: ChannelDayCounts & {
    readonly comments: number;
    readonly stories: number;
    readonly archivedMessages: number | null;
    readonly replies: number;
  };
  readonly inbound: ChannelDayCounts & { readonly received: number };
  readonly totalAppointments: number;
  readonly totalSales: number;
}

export interface InsightMonthView {
  readonly year: number;
  readonly month: number;
  readonly days: readonly MonthDayRow[];
  readonly totals: ColumnTotals;
  readonly rates: ConversionRates;
  readonly containsArchivedDays: boolean;
  readonly containsLiveDays: boolean;
  readonly unattributedLeadCount: number;
}

/** Assemble stored counters, frozen archive values and live derived entities. */
export async function getMonthView(
  deps: InsightDeps,
  input: unknown,
): Promise<InsightMonthView | null> {
  const month = parseInput(monthSchema, input);
  const config = await getInsightConfig(deps);
  if (!config) {
    return null;
  }

  const [activityDays, appointmentCounts, saleCounts] = await Promise.all([
    getActivityDays(deps, month),
    getAppointmentCounts(deps, config, month),
    getSaleCounts(deps, config, month),
  ]);
  const activityByDay = new Map(activityDays.map((day) => [utcDayKey(day.date), day]));
  const bounds = periodRange(month.year, month.month);
  const todayKey = utcDayKey(clockNow(deps));
  const days: MonthDayRow[] = [];

  for (const cursor = new Date(bounds.gte); cursor < bounds.lt; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayKey = utcDayKey(cursor);
    const stored = activityByDay.get(dayKey);
    const isArchived = config.activeFrom !== null && cursor < config.activeFrom;
    const appointments = appointmentCounts.byDay.get(dayKey);
    const sales = saleCounts.get(dayKey);
    const welcome = channelCounts(
      isArchived,
      {
        appointments: stored?.archivedWelcomeAppointments,
        sales: stored?.archivedWelcomeSales,
      },
      appointments?.welcome,
      sales?.welcome,
    );
    const outbound = channelCounts(
      isArchived,
      {
        appointments: stored?.archivedOutboundAppointments,
        sales: stored?.archivedOutboundSales,
      },
      appointments?.outbound,
      sales?.outbound,
    );
    const inbound = channelCounts(
      isArchived,
      {
        appointments: stored?.archivedInboundAppointments,
        sales: stored?.archivedInboundSales,
      },
      appointments?.inbound,
      sales?.inbound,
    );

    days.push({
      date: dayKey,
      isArchived,
      isFuture: dayKey > todayKey,
      welcome: {
        ...welcome,
        sent: stored?.welcomeSent ?? 0,
        replies: stored?.welcomeReplies ?? 0,
      },
      outbound: {
        ...outbound,
        comments: stored?.outboundComments ?? 0,
        stories: stored?.outboundStories ?? 0,
        archivedMessages: isArchived ? (stored?.archivedOutboundMessages ?? 0) : null,
        replies: stored?.outboundReplies ?? 0,
      },
      inbound: { ...inbound, received: stored?.inboundReceived ?? 0 },
      totalAppointments: welcome.appointments + outbound.appointments + inbound.appointments,
      totalSales: welcome.sales + outbound.sales + inbound.sales,
    });
  }

  const totals = sumColumns(days);
  return {
    year: month.year,
    month: month.month,
    days,
    totals,
    rates: conversionRates(totals),
    containsArchivedDays: days.some((day) => day.isArchived),
    containsLiveDays: days.some((day) => !day.isArchived),
    unattributedLeadCount: appointmentCounts.unattributedLeadCount,
  };
}

function channelCounts(
  isArchived: boolean,
  frozen: { appointments?: number | null; sales?: number | null },
  derivedAppointments: DerivedCount = ZERO_COUNT,
  derivedSales: DerivedCount = ZERO_COUNT,
): ChannelDayCounts {
  if (isArchived) {
    return {
      appointments: frozen.appointments ?? 0,
      appointmentsFromInsight: 0,
      sales: frozen.sales ?? 0,
      salesFromInsight: 0,
    };
  }
  return {
    appointments: derivedAppointments.total,
    appointmentsFromInsight: derivedAppointments.fromInsight,
    sales: derivedSales.total,
    salesFromInsight: derivedSales.fromInsight,
  };
}
