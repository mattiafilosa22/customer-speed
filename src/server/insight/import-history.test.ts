import { describe, expect, it } from "vitest";

import { parseChatSheet } from "@/server/insight/import-history";

function sheetRow(date: string, values: readonly (number | string | null)[]): unknown[] {
  return [new Date(`${date}T00:00:00.000Z`), ...values];
}

describe("parseChatSheet", () => {
  it("reads the eleven daily counters", () => {
    const report = parseChatSheet([sheetRow("2025-06-20", [37, 1, 0, 0, 11, 4, 1, 0, 1, 1, 0])]);
    expect(report.days).toEqual([
      {
        date: "2025-06-20",
        welcomeSent: 37,
        welcomeReplies: 1,
        welcomeAppointments: 0,
        welcomeSales: 0,
        outboundMessages: 11,
        outboundReplies: 4,
        outboundAppointments: 1,
        outboundSales: 0,
        inboundReceived: 1,
        inboundAppointments: 1,
        inboundSales: 0,
      },
    ]);
    expect(report.anomalies).toEqual([]);
  });

  it("ignores total, rate, heading and empty rows", () => {
    const report = parseChatSheet([
      ["GIUGNO"],
      sheetRow("2025-06-20", [10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-06-21", [20, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ["TOT", 999, 0.03],
      [],
    ]);
    expect(report.days).toHaveLength(2);
    expect(report.monthlyTotals["2025-06"]?.welcomeSent).toBe(30);
  });

  it("keeps the day while replacing bad cells and reports each anomaly", () => {
    const report = parseChatSheet([
      sheetRow("2026-08-15", ["miru", "ha", "dimenticato", "ciao", 4, 2, 0, 0, 1, 0, 0]),
    ]);
    expect(report.days[0]).toMatchObject({
      welcomeSent: 0,
      outboundMessages: 4,
      outboundReplies: 2,
      inboundReceived: 1,
    });
    expect(report.anomalies.filter((entry) => entry.kind === "nonNumeric")).toHaveLength(4);
  });

  it("imports but reports replies exceeding messages", () => {
    const report = parseChatSheet([sheetRow("2025-08-01", [33, 0, 0, 0, 1, 2, 0, 0, 1, 0, 0])]);
    expect(report.days[0]?.outboundReplies).toBe(2);
    expect(report.anomalies).toEqual([
      expect.objectContaining({ kind: "repliesExceedMessages", column: "G" }),
    ]);
  });

  it("keeps the first duplicate date and reports the second", () => {
    const report = parseChatSheet([
      sheetRow("2025-07-01", [11, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-07-01", [99, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    expect(report.days).toHaveLength(1);
    expect(report.days[0]?.welcomeSent).toBe(11);
    expect(report.anomalies).toEqual([
      expect.objectContaining({ kind: "duplicateDate", value: "2025-07-01" }),
    ]);
  });

  it("replaces negative counters and computes totals per month", () => {
    const report = parseChatSheet([
      sheetRow("2025-06-30", [10, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
      sheetRow("2025-07-01", [-5, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    expect(report.days[1]?.welcomeSent).toBe(0);
    expect(report.anomalies).toContainEqual(
      expect.objectContaining({ kind: "negative", column: "B" }),
    );
    expect(report.monthlyTotals["2025-06"]?.totalAppointments).toBe(1);
    expect(report.monthlyTotals["2025-07"]?.welcomeSales).toBe(1);
  });
});
