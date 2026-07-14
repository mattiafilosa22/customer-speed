import { describe, expect, it } from "vitest";

import { resolveDateRangeBounds } from "@/server/dashboard/date-range";

describe("resolveDateRangeBounds", () => {
  it("returns null when no from/to/preset given", () => {
    expect(resolveDateRangeBounds({})).toBeNull();
  });

  it("resolves an explicit from/to as UTC half-open bounds", () => {
    const result = resolveDateRangeBounds({ from: "2026-07-01", to: "2026-07-10" });
    expect(result?.gte.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result?.lt.toISOString()).toBe("2026-07-11T00:00:00.000Z"); // "to" incluso -> lt = to+1 giorno
  });

  it("resolves the lastWeek preset relative to an injected now", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const result = resolveDateRangeBounds({ preset: "lastWeek" }, now);
    expect(result?.gte.toISOString()).toBe("2026-07-07T12:00:00.000Z");
    expect(result?.lt.toISOString()).toBe("2026-07-14T12:00:00.000Z");
  });

  it("returns null when only `from` is given without `to`", () => {
    expect(resolveDateRangeBounds({ from: "2026-07-01" })).toBeNull();
  });

  it("returns null when only `to` is given without `from`", () => {
    expect(resolveDateRangeBounds({ to: "2026-07-10" })).toBeNull();
  });

  it("gives the preset precedence over an explicit from/to", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const result = resolveDateRangeBounds(
      { from: "2026-01-01", to: "2026-01-31", preset: "lastWeek" },
      now,
    );
    expect(result?.gte.toISOString()).toBe("2026-07-07T12:00:00.000Z");
    expect(result?.lt.toISOString()).toBe("2026-07-14T12:00:00.000Z");
  });

  it("resolves a single-day range (from === to) as a 1-day half-open bound", () => {
    const result = resolveDateRangeBounds({ from: "2026-07-05", to: "2026-07-05" });
    expect(result?.gte.toISOString()).toBe("2026-07-05T00:00:00.000Z");
    expect(result?.lt.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
