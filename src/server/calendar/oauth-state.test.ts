import { describe, expect, it } from "vitest";

import {
  generateOAuthState,
  stateCookieName,
  verifyOAuthState,
} from "@/server/calendar/oauth-state";

describe("oauth-state", () => {
  it("generates a high-entropy, url-safe state token", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it("verifies a matching state in constant time", () => {
    const state = generateOAuthState();
    expect(verifyOAuthState(state, state)).toBe(true);
  });

  it("rejects a mismatched / missing state", () => {
    const state = generateOAuthState();
    expect(verifyOAuthState(state, "other")).toBe(false);
    expect(verifyOAuthState(null, state)).toBe(false);
    expect(verifyOAuthState(state, null)).toBe(false);
    expect(verifyOAuthState("", "")).toBe(false);
  });

  it("namespaces the cookie per provider", () => {
    expect(stateCookieName("google")).not.toBe(stateCookieName("calendly"));
    expect(stateCookieName("GOOGLE")).toBe(stateCookieName("google"));
  });
});
