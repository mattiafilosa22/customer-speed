import { describe, expect, it } from "vitest";

import { toDatetimeLocalValue } from "@/lib/datetime-local";

describe("toDatetimeLocalValue", () => {
  it("formats a UTC instant in Europe/Rome (CEST, +02:00 in summer)", () => {
    // 2026-06-20 08:30 UTC → 10:30 Europe/Rome (DST).
    const date = new Date("2026-06-20T08:30:00.000Z");
    expect(toDatetimeLocalValue(date)).toBe("2026-06-20T10:30");
  });

  it("formats winter time (CET, +01:00)", () => {
    // 2026-01-15 09:00 UTC → 10:00 Europe/Rome (no DST).
    const date = new Date("2026-01-15T09:00:00.000Z");
    expect(toDatetimeLocalValue(date)).toBe("2026-01-15T10:00");
  });

  it("produces a value parseable back to a Date", () => {
    const value = toDatetimeLocalValue(new Date("2026-06-20T08:30:00.000Z"));
    expect(Number.isNaN(new Date(value).getTime())).toBe(false);
  });
});
