import { describe, expect, it } from "vitest";

import { createReporter, isObservabilityEnabled } from "@/lib/observability";

/**
 * In the unit-test env shape `SENTRY_DSN` is unset, so observability is OFF and
 * the reporter is the no-op. These tests pin the safety contract: nothing throws
 * and nothing reports when no DSN is configured.
 */
describe("observability (no DSN configured)", () => {
  it("is disabled without a DSN", () => {
    expect(isObservabilityEnabled()).toBe(false);
  });

  it("returns a no-op reporter that never throws", () => {
    const reporter = createReporter();
    expect(reporter.enabled).toBe(false);
    expect(() => reporter.captureException(new Error("boom"), { tags: { area: "test" } })).not.toThrow();
    expect(() => reporter.captureMessage("hello")).not.toThrow();
  });
});
