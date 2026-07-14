import { describe, expect, it } from "vitest";

import { periodFilter, periodRange, periodSchema } from "@/server/dashboard/period";

describe("periodFilter", () => {
  it("returns undefined when neither year nor range are given", () => {
    expect(periodFilter(periodSchema.parse({}))).toBeUndefined();
  });

  it("derives bounds from year/month when no explicit range is given", () => {
    const result = periodFilter(periodSchema.parse({ year: "2026", month: "7" }));
    expect(result).toEqual(periodRange(2026, 7));
  });

  it("gives an explicit `range` precedence over year/month", () => {
    const range = {
      gte: new Date("2026-07-01T00:00:00.000Z"),
      lt: new Date("2026-07-11T00:00:00.000Z"),
    };
    const result = periodFilter(periodSchema.parse({ year: "2020", month: "1", range }));
    expect(result).toEqual(range);
  });

  it("uses the explicit `range` even when year/month are absent", () => {
    const range = {
      gte: new Date("2026-07-07T12:00:00.000Z"),
      lt: new Date("2026-07-14T12:00:00.000Z"),
    };
    const result = periodFilter(periodSchema.parse({ range }));
    expect(result).toEqual(range);
  });
});
