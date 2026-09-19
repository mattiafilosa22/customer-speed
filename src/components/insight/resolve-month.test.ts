import { describe, expect, it } from "vitest";

import { resolveInsightMonth } from "@/components/insight/resolve-month";

describe("resolveInsightMonth", () => {
  it("accepts a valid shared URL month", () => {
    expect(resolveInsightMonth({ year: "2025", month: "12" })).toEqual({ year: 2025, month: 12 });
  });

  it("falls back to the current UTC month for untrusted invalid params", () => {
    expect(resolveInsightMonth({ year: "oops", month: "19" }, new Date("2026-09-11T12:00:00Z"))).toEqual({ year: 2026, month: 9 });
  });
});
