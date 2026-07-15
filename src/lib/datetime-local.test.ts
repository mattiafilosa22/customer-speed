import { describe, expect, it } from "vitest";

import { fromDatetimeLocalValue, toDatetimeLocalValue } from "@/lib/datetime-local";

describe("fromDatetimeLocalValue", () => {
  // Regression: these must NOT depend on the process's own TZ (e.g. UTC on
  // Vercel vs Europe/Rome on a dev machine) — that divergence was the bug.
  it("interprets a bare value as Europe/Rome in summer (CEST, +02:00)", () => {
    expect(fromDatetimeLocalValue("2026-06-20T10:30").toISOString()).toBe(
      "2026-06-20T08:30:00.000Z",
    );
  });

  it("interprets a bare value as Europe/Rome in winter (CET, +01:00)", () => {
    expect(fromDatetimeLocalValue("2026-01-15T10:00").toISOString()).toBe(
      "2026-01-15T09:00:00.000Z",
    );
  });

  it("round-trips with toDatetimeLocalValue", () => {
    const original = new Date("2026-06-20T08:30:00.000Z");
    expect(fromDatetimeLocalValue(toDatetimeLocalValue(original)).getTime()).toBe(
      original.getTime(),
    );
  });

  it("passes an already-offset ISO string straight through", () => {
    expect(fromDatetimeLocalValue("2026-06-20T08:30:00.000Z").toISOString()).toBe(
      "2026-06-20T08:30:00.000Z",
    );
  });

  it("produces an Invalid Date for garbage input (validated upstream)", () => {
    expect(Number.isNaN(fromDatetimeLocalValue("not-a-date").getTime())).toBe(true);
  });
});

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
