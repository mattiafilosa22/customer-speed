import { describe, expect, it } from "vitest";

import { parseFeatureFlags } from "@/lib/feature-flags";

describe("parseFeatureFlags", () => {
  it("applies the documented defaults for an empty object", () => {
    expect(parseFeatureFlags({})).toEqual({
      leads: true,
      pipeline: true,
      dashboard: true,
      appointments: true,
      invoices: true,
      calendarIntegrations: false,
    });
  });

  it("respects explicit flags (Fabio: appointments on, integrations off)", () => {
    const flags = parseFeatureFlags({
      appointments: true,
      calendarIntegrations: false,
      invoices: true,
    });
    expect(flags.appointments).toBe(true);
    expect(flags.calendarIntegrations).toBe(false);
  });

  it("can disable a module per tenant", () => {
    expect(parseFeatureFlags({ appointments: false }).appointments).toBe(false);
  });

  it("ignores unknown keys and defaults calendarIntegrations to OFF", () => {
    const flags = parseFeatureFlags({ somethingElse: true });
    expect(flags.calendarIntegrations).toBe(false);
    expect(flags.appointments).toBe(true);
  });

  it("falls back to defaults for malformed input (never throws)", () => {
    expect(parseFeatureFlags(null).appointments).toBe(true);
    expect(parseFeatureFlags("nope").calendarIntegrations).toBe(false);
    expect(parseFeatureFlags(42).leads).toBe(true);
  });
});
