import { describe, expect, it } from "vitest";

import type { MonthDayRow } from "@/server/insight/get-month-view";
import { conversionRates, ratio, sumColumns } from "@/server/insight/totals";

function dayRow(overrides: Partial<MonthDayRow> = {}): MonthDayRow {
  return {
    date: "2026-09-01",
    isArchived: false,
    isFuture: false,
    welcome: {
      sent: 0,
      replies: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    outbound: {
      comments: 0,
      stories: 0,
      archivedMessages: null,
      replies: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    inbound: {
      received: 0,
      appointments: 0,
      appointmentsFromInsight: 0,
      sales: 0,
      salesFromInsight: 0,
    },
    totalAppointments: 0,
    totalSales: 0,
    ...overrides,
  };
}

describe("sumColumns", () => {
  it("adds every column across the days of the month", () => {
    const totals = sumColumns([
      dayRow({
        welcome: {
          sent: 30,
          replies: 3,
          appointments: 1,
          appointmentsFromInsight: 1,
          sales: 0,
          salesFromInsight: 0,
        },
      }),
      dayRow({
        welcome: {
          sent: 20,
          replies: 2,
          appointments: 2,
          appointmentsFromInsight: 0,
          sales: 1,
          salesFromInsight: 0,
        },
      }),
    ]);

    expect(totals.welcomeSent).toBe(50);
    expect(totals.welcomeReplies).toBe(5);
    expect(totals.welcomeAppointments).toBe(3);
    expect(totals.welcomeSales).toBe(1);
  });

  it("folds the archived outbound aggregate into the outbound messages total", () => {
    const totals = sumColumns([
      dayRow({
        isArchived: true,
        outbound: {
          comments: 0,
          stories: 0,
          archivedMessages: 11,
          replies: 4,
          appointments: 1,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
      }),
      dayRow({
        outbound: {
          comments: 2,
          stories: 3,
          archivedMessages: null,
          replies: 1,
          appointments: 0,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
      }),
    ]);

    expect(totals.outboundMessages).toBe(16);
  });

  it("derives the month totals from the row totals", () => {
    const totals = sumColumns([
      dayRow({
        welcome: {
          sent: 0,
          replies: 0,
          appointments: 1,
          appointmentsFromInsight: 0,
          sales: 1,
          salesFromInsight: 0,
        },
        inbound: {
          received: 0,
          appointments: 2,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
        totalAppointments: 3,
        totalSales: 1,
      }),
    ]);

    expect(totals.totalAppointments).toBe(3);
    expect(totals.totalSales).toBe(1);
  });
});

describe("ratio", () => {
  it("returns the ratio when the denominator is positive", () => {
    expect(ratio(3, 12)).toBe(0.25);
  });

  it("returns null when the denominator is zero", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, 0)).toBeNull();
  });
});

describe("conversionRates", () => {
  it("chains each step onto the previous one", () => {
    const totals = sumColumns([
      dayRow({
        welcome: {
          sent: 100,
          replies: 10,
          appointments: 5,
          appointmentsFromInsight: 0,
          sales: 1,
          salesFromInsight: 0,
        },
      }),
    ]);

    const rates = conversionRates(totals);
    expect(rates.welcomeReplyRate).toBeCloseTo(0.1);
    expect(rates.welcomeAppointmentRate).toBeCloseTo(0.5);
    expect(rates.welcomeSaleRate).toBeCloseTo(0.2);
  });

  it("computes the overall sale rate over all channel appointments", () => {
    const totals = sumColumns([
      dayRow({
        welcome: {
          sent: 0,
          replies: 0,
          appointments: 2,
          appointmentsFromInsight: 0,
          sales: 1,
          salesFromInsight: 0,
        },
        inbound: {
          received: 0,
          appointments: 2,
          appointmentsFromInsight: 0,
          sales: 0,
          salesFromInsight: 0,
        },
        totalAppointments: 4,
        totalSales: 1,
      }),
    ]);

    expect(conversionRates(totals).overallSaleRate).toBeCloseTo(0.25);
  });

  it("leaves every rate null on an empty month", () => {
    const rates = conversionRates(sumColumns([]));
    expect(Object.values(rates).every((rate) => rate === null)).toBe(true);
  });
});
