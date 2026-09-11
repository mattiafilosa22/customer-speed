import type { MonthDayRow } from "@/server/insight/get-month-view";

export interface ColumnTotals {
  readonly welcomeSent: number;
  readonly welcomeReplies: number;
  readonly welcomeAppointments: number;
  readonly welcomeSales: number;
  readonly outboundMessages: number;
  readonly outboundReplies: number;
  readonly outboundAppointments: number;
  readonly outboundSales: number;
  readonly inboundReceived: number;
  readonly inboundAppointments: number;
  readonly inboundSales: number;
  readonly totalAppointments: number;
  readonly totalSales: number;
}

export interface ConversionRates {
  readonly welcomeReplyRate: number | null;
  readonly welcomeAppointmentRate: number | null;
  readonly welcomeSaleRate: number | null;
  readonly outboundReplyRate: number | null;
  readonly outboundAppointmentRate: number | null;
  readonly outboundSaleRate: number | null;
  readonly inboundAppointmentRate: number | null;
  readonly inboundSaleRate: number | null;
  readonly overallSaleRate: number | null;
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function sumColumns(days: readonly MonthDayRow[]): ColumnTotals {
  const totals = {
    welcomeSent: 0,
    welcomeReplies: 0,
    welcomeAppointments: 0,
    welcomeSales: 0,
    outboundMessages: 0,
    outboundReplies: 0,
    outboundAppointments: 0,
    outboundSales: 0,
    inboundReceived: 0,
    inboundAppointments: 0,
    inboundSales: 0,
    totalAppointments: 0,
    totalSales: 0,
  };

  for (const day of days) {
    totals.welcomeSent += day.welcome.sent;
    totals.welcomeReplies += day.welcome.replies;
    totals.welcomeAppointments += day.welcome.appointments;
    totals.welcomeSales += day.welcome.sales;
    totals.outboundMessages +=
      day.outbound.archivedMessages ?? day.outbound.comments + day.outbound.stories;
    totals.outboundReplies += day.outbound.replies;
    totals.outboundAppointments += day.outbound.appointments;
    totals.outboundSales += day.outbound.sales;
    totals.inboundReceived += day.inbound.received;
    totals.inboundAppointments += day.inbound.appointments;
    totals.inboundSales += day.inbound.sales;
    totals.totalAppointments += day.totalAppointments;
    totals.totalSales += day.totalSales;
  }

  return totals;
}

export function conversionRates(totals: ColumnTotals): ConversionRates {
  return {
    welcomeReplyRate: ratio(totals.welcomeReplies, totals.welcomeSent),
    welcomeAppointmentRate: ratio(totals.welcomeAppointments, totals.welcomeReplies),
    welcomeSaleRate: ratio(totals.welcomeSales, totals.welcomeAppointments),
    outboundReplyRate: ratio(totals.outboundReplies, totals.outboundMessages),
    outboundAppointmentRate: ratio(totals.outboundAppointments, totals.outboundReplies),
    outboundSaleRate: ratio(totals.outboundSales, totals.outboundAppointments),
    inboundAppointmentRate: ratio(totals.inboundAppointments, totals.inboundReceived),
    inboundSaleRate: ratio(totals.inboundSales, totals.inboundAppointments),
    overallSaleRate: ratio(totals.totalSales, totals.totalAppointments),
  };
}
