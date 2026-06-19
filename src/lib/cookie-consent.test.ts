import { describe, expect, it } from "vitest";

import {
  CONSENT_MAX_AGE_SECONDS,
  parseCookieConsent,
  shouldShowBanner,
  type CookieConsentState,
} from "@/lib/cookie-consent";
import { COOKIE_POLICY_VERSION } from "@/server/consent/consent-types";

function state(overrides: Partial<CookieConsentState> = {}): CookieConsentState {
  return {
    necessary: true,
    analytics: false,
    version: COOKIE_POLICY_VERSION,
    decidedAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("parseCookieConsent", () => {
  it("returns null for absent or malformed cookies", () => {
    expect(parseCookieConsent(undefined)).toBeNull();
    expect(parseCookieConsent("not-json")).toBeNull();
    expect(parseCookieConsent('{"necessary":false}')).toBeNull();
  });

  it("parses a valid cookie", () => {
    const raw = JSON.stringify(state({ analytics: true }));
    expect(parseCookieConsent(raw)?.analytics).toBe(true);
  });
});

describe("shouldShowBanner", () => {
  const now = new Date("2026-06-10T00:00:00.000Z");

  it("shows when there is no stored choice", () => {
    expect(shouldShowBanner(null, now)).toBe(true);
  });

  it("hides for a recent choice on the current policy version", () => {
    expect(shouldShowBanner(state(), now)).toBe(false);
  });

  it("re-prompts when the policy version changed", () => {
    expect(shouldShowBanner(state({ version: "v0" }), now)).toBe(true);
  });

  it("re-prompts after the 180-day window", () => {
    const old = new Date(now.getTime() - (CONSENT_MAX_AGE_SECONDS * 1000 + 1));
    expect(shouldShowBanner(state({ decidedAt: old.toISOString() }), now)).toBe(true);
  });
});
