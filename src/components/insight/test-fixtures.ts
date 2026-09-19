import type { InsightMonthView, MonthDayRow } from "@/server/insight";
import { conversionRates, sumColumns } from "@/server/insight/totals";

export function day(date: string, overrides: Partial<MonthDayRow> = {}): MonthDayRow {
  return {
    date,
    isArchived: false,
    isFuture: false,
    welcome: { sent: 0, replies: 0, appointments: 0, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
    outbound: { comments: 0, stories: 0, archivedMessages: null, replies: 0, appointments: 0, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
    inbound: { received: 0, appointments: 0, appointmentsFromInsight: 0, sales: 0, salesFromInsight: 0 },
    totalAppointments: 0,
    totalSales: 0,
    ...overrides,
  };
}

export function view(days: MonthDayRow[]): InsightMonthView {
  const totals = sumColumns(days);
  return {
    year: 2026,
    month: 9,
    days,
    totals,
    rates: conversionRates(totals),
    containsArchivedDays: days.some((row) => row.isArchived),
    containsLiveDays: days.some((row) => !row.isArchived),
    unattributedLeadCount: 0,
  };
}
