import { describe, expect, it } from "vitest";

import { dateRangeInputError, resolveDateRangeBounds } from "@/server/dashboard/date-range";

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

  it("returns null (does not throw) when `from` is a malformed, non-ISO date string", () => {
    expect(resolveDateRangeBounds({ from: "not-a-date", to: "2026-07-10" })).toBeNull();
  });

  it("returns null (does not throw) when `to` is a malformed, non-ISO date string", () => {
    expect(resolveDateRangeBounds({ from: "2026-07-01", to: "31/07/2026" })).toBeNull();
  });

  it("returns null when the range is inverted (`from` after `to`)", () => {
    expect(resolveDateRangeBounds({ from: "2026-07-10", to: "2026-07-01" })).toBeNull();
  });
});

describe("dateRangeInputError", () => {
  it("returns null when neither from nor to are given", () => {
    expect(dateRangeInputError({})).toBeNull();
  });

  it("returns null when only one of from/to is given (incomplete, not invalid)", () => {
    expect(dateRangeInputError({ from: "2026-07-01" })).toBeNull();
    expect(dateRangeInputError({ to: "2026-07-01" })).toBeNull();
  });

  it("returns null for a valid, non-inverted from/to", () => {
    expect(dateRangeInputError({ from: "2026-07-01", to: "2026-07-10" })).toBeNull();
  });

  it("returns 'invalidDate' for a malformed date string", () => {
    expect(dateRangeInputError({ from: "not-a-date", to: "2026-07-10" })).toBe("invalidDate");
  });

  it("returns 'invertedRange' when `from` is after `to`", () => {
    expect(dateRangeInputError({ from: "2026-07-10", to: "2026-07-01" })).toBe("invertedRange");
  });
});
