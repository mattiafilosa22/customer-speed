import { describe, expect, it } from "vitest";

import { daysInStage } from "@/lib/days";

describe("daysInStage", () => {
  it("returns 0 for the same instant", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    expect(daysInStage(now, now)).toBe(0);
  });

  it("returns 0 within the same calendar day (Europe/Rome)", () => {
    const from = new Date("2026-06-18T06:00:00.000Z");
    const now = new Date("2026-06-18T20:00:00.000Z");
    expect(daysInStage(from, now)).toBe(0);
  });

  it("counts whole calendar days across midnight", () => {
    // 17 calendar days from Jun 1 to Jun 18, Europe/Rome.
    const from = new Date("2026-06-01T10:00:00.000Z");
    const now = new Date("2026-06-18T10:00:00.000Z");
    expect(daysInStage(from, now)).toBe(17);
  });

  it("uses Europe/Rome civil days (a late-UTC instant is still 'today' in Rome)", () => {
    // 2026-06-17T23:30Z is 2026-06-18 01:30 in Rome (CEST, +2) → same Rome day
    // as 2026-06-18T05:00Z, so 0 days apart.
    const from = new Date("2026-06-17T23:30:00.000Z");
    const now = new Date("2026-06-18T05:00:00.000Z");
    expect(daysInStage(from, now)).toBe(0);
  });

  it("clamps negative spans (future stageChangedAt / clock skew) to 0", () => {
    const from = new Date("2026-06-20T00:00:00.000Z");
    const now = new Date("2026-06-18T00:00:00.000Z");
    expect(daysInStage(from, now)).toBe(0);
  });

  it("handles a span across a DST change without drift", () => {
    // Italy DST starts 2026-03-29. Feb 1 → Apr 1 = 59 calendar days.
    const from = new Date("2026-02-01T12:00:00.000Z");
    const now = new Date("2026-04-01T12:00:00.000Z");
    expect(daysInStage(from, now)).toBe(59);
  });
});
