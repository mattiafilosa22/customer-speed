import { describe, expect, it } from "vitest";

import { RateLimitedError, RecaptchaV2RequiredError, ValidationError } from "@/lib/errors";
import { requestPasswordReset } from "@/server/auth/request-password-reset";
import {
  blockAllRateLimiter,
  buildFakeDeps,
  FakeDb,
  recaptchaReturning,
  recaptchaV2Returning,
} from "@/server/auth/test-helpers";

/**
 * `requestPasswordReset` is intentionally NON-REVEALING: it ALWAYS resolves to
 * `{ accepted: true }`, whether the email exists or not, and now whether the
 * reCAPTCHA passed or not. The observable side effect (a reset token being
 * created + an email sent) is what differs — never the response.
 */

function seedActiveUser(db: FakeDb) {
  return db.addUser({
    organizationId: "org_1",
    email: "user@example.com",
    isActive: true,
    emailVerified: new Date(),
  });
}

const baseInput = {
  organizationId: "org_1",
  email: "user@example.com",
};

describe("requestPasswordReset", () => {
  it("issues a reset token + email for an existing active account (happy path)", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db);

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(1);
    expect(db.audits.some((a) => a.action === "auth.requestPasswordReset")).toBe(true);
  });

  it("is a non-revealing no-op for an unknown email (no token, same response)", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db);

    const result = await requestPasswordReset(deps, { ...baseInput, email: "ghost@example.com" });

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("does NOT issue a token for a user in another tenant with the same email", async () => {
    const db = new FakeDb();
    db.addUser({
      organizationId: "org_OTHER",
      email: "user@example.com",
      isActive: true,
      emailVerified: new Date(),
    });
    const deps = buildFakeDeps(db);

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
  });

  // ── reCAPTCHA enforcement (docs/06 §6.1-6.2) ──────────────────────────────
  it("FAILED reCAPTCHA → silent no-op: accepted, but NO token and NO user lookup leak", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("failed") as unknown as typeof deps.verifyRecaptcha,
    });

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
    expect(db.audits.some((a) => a.action === "auth.requestPasswordReset")).toBe(false);
  });

  it("LOW-SCORE reCAPTCHA → silent no-op: accepted but no token (previously emitted a token)", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
    });

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("SKIPPED reCAPTCHA (dev: keys not configured) → proceeds normally", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("skipped") as unknown as typeof deps.verifyRecaptcha,
    });

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(1);
  });

  // ── v2 checkbox fallback when v3 score is low (docs/06 §6.1-6.2) ───────────
  it("LOW-SCORE + v2 NOT configured → silent no-op (no token), no regression", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      recaptchaV2Enabled: false,
    });

    const result = await requestPasswordReset(deps, baseInput);

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("LOW-SCORE + v2 configured + NO v2 token → RecaptchaV2RequiredError (no token, before any lookup)", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      recaptchaV2Enabled: true,
    });

    await expect(requestPasswordReset(deps, baseInput)).rejects.toBeInstanceOf(
      RecaptchaV2RequiredError,
    );
    expect(db.resetTokens).toHaveLength(0);
  });

  it("LOW-SCORE + v2 configured + valid v2 token → proceeds, issues a token", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      verifyRecaptchaV2: recaptchaV2Returning("ok") as unknown as typeof deps.verifyRecaptchaV2,
      recaptchaV2Enabled: true,
    });

    const result = await requestPasswordReset(deps, { ...baseInput, recaptchaV2Token: "v2-ok" });

    expect(result.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(1);
  });

  it("LOW-SCORE + v2 configured + invalid v2 token → RecaptchaV2RequiredError", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      verifyRecaptchaV2: recaptchaV2Returning("failed") as unknown as typeof deps.verifyRecaptchaV2,
      recaptchaV2Enabled: true,
    });

    await expect(
      requestPasswordReset(deps, { ...baseInput, recaptchaV2Token: "v2-bad" }),
    ).rejects.toBeInstanceOf(RecaptchaV2RequiredError);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("rejects invalid input with ValidationError", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(
      requestPasswordReset(deps, { organizationId: "org_1", email: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws RateLimitedError when blocked", async () => {
    const db = new FakeDb();
    seedActiveUser(db);
    const deps = buildFakeDeps(db, { rateLimiter: blockAllRateLimiter() });
    await expect(requestPasswordReset(deps, baseInput)).rejects.toBeInstanceOf(RateLimitedError);
  });
});
