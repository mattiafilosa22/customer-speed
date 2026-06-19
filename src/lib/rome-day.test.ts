import { describe, expect, it } from "vitest";

import { romeDayRangeUtc } from "@/lib/rome-day";

describe("romeDayRangeUtc", () => {
  it("covers a summer day (CEST, +02:00): 2026-06-20 → [22:00 prev UTC, 22:00 UTC)", () => {
    const { gte, lt } = romeDayRangeUtc("2026-06-20");
    expect(gte.toISOString()).toBe("2026-06-19T22:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-06-20T22:00:00.000Z");
  });

  it("covers a winter day (CET, +01:00): 2026-01-15 → [23:00 prev UTC, 23:00 UTC)", () => {
    const { gte, lt } = romeDayRangeUtc("2026-01-15");
    expect(gte.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("yields a 24h window", () => {
    const { gte, lt } = romeDayRangeUtc("2026-06-20");
    expect(lt.getTime() - gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("throws on a malformed date", () => {
    expect(() => romeDayRangeUtc("nope")).toThrow();
  });
});
