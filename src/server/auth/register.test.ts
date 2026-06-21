import { describe, expect, it } from "vitest";

import {
  ConflictError,
  RateLimitedError,
  RecaptchaV2RequiredError,
  ValidationError,
} from "@/lib/errors";
import { register } from "@/server/auth/register";
import {
  blockAllRateLimiter,
  buildFakeDeps,
  FakeDb,
  recaptchaReturning,
  recaptchaV2Returning,
} from "@/server/auth/test-helpers";

const validInput = {
  organizationId: "org_1",
  name: "Mario Rossi",
  email: "Mario.Rossi@example.com",
  password: "Password123",
  consents: [{ type: "privacy_policy_v1", granted: true, version: "1" }],
};

describe("register", () => {
  it("creates an unverified user, records consent and issues a token (happy path)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);

    const result = await register(deps, validInput, { exposeTokenForTests: true });

    expect(result.userId).toBeTruthy();
    expect(result.verificationToken).toBeTruthy();
    const user = db.user();
    expect(user.email).toBe("mario.rossi@example.com"); // normalized lowercase
    expect(user.emailVerified).toBeNull();
    expect(user.passwordHash).toBe("h:Password123");
    expect(db.consents).toHaveLength(1);
    expect(db.consents.at(0)).toMatchObject({ type: "privacy_policy_v1", organizationId: "org_1" });
    expect(db.emailTokens).toHaveLength(1);
    expect(db.audits.some((a) => a.action === "auth.register")).toBe(true);
  });

  it("rejects invalid input with ValidationError (Zod)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(
      register(deps, { ...validInput, email: "not-an-email", password: "short" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a weak password (policy)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(
      register(deps, { ...validInput, password: "alllettersonly" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ConflictError when the email already exists in the tenant", async () => {
    const db = new FakeDb();
    db.addUser({ organizationId: "org_1", email: "mario.rossi@example.com" });
    const deps = buildFakeDeps(db);
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows the same email in a DIFFERENT tenant (per-tenant uniqueness)", async () => {
    const db = new FakeDb();
    db.addUser({ organizationId: "org_OTHER", email: "mario.rossi@example.com" });
    const deps = buildFakeDeps(db);
    const result = await register(deps, validInput);
    expect(result.userId).toBeTruthy();
    expect(db.users).toHaveLength(2);
  });

  it("throws RateLimitedError when the limiter blocks", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, { rateLimiter: blockAllRateLimiter() });
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(RateLimitedError);
  });

  // ── reCAPTCHA enforcement (docs/06 §6.2) ──────────────────────────────────
  it("rejects a FAILED reCAPTCHA and creates no user", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("failed") as unknown as typeof deps.verifyRecaptcha,
    });
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(db.users).toHaveLength(0);
  });

  it("rejects a LOW-SCORE reCAPTCHA (bot-like) — previously accepted", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
    });
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(db.users).toHaveLength(0);
  });

  it("accepts a SKIPPED reCAPTCHA (dev: keys not configured)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("skipped") as unknown as typeof deps.verifyRecaptcha,
    });
    const result = await register(deps, validInput);
    expect(result.userId).toBeTruthy();
    expect(db.users).toHaveLength(1);
  });

  // ── v2 checkbox fallback when v3 score is low (docs/06 §6.2) ───────────────
  it("LOW-SCORE + v2 NOT configured → ConflictError, no user (no regression)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      recaptchaV2Enabled: false,
    });
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(db.users).toHaveLength(0);
  });

  it("LOW-SCORE + v2 configured + NO v2 token → RecaptchaV2RequiredError, no user", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      recaptchaV2Enabled: true,
    });
    await expect(register(deps, validInput)).rejects.toBeInstanceOf(RecaptchaV2RequiredError);
    expect(db.users).toHaveLength(0);
  });

  it("LOW-SCORE + v2 configured + valid v2 token → creates the user", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      verifyRecaptchaV2: recaptchaV2Returning("ok") as unknown as typeof deps.verifyRecaptchaV2,
      recaptchaV2Enabled: true,
    });
    const result = await register(deps, { ...validInput, recaptchaV2Token: "v2-ok" });
    expect(result.userId).toBeTruthy();
    expect(db.users).toHaveLength(1);
  });

  it("LOW-SCORE + v2 configured + invalid v2 token → RecaptchaV2RequiredError, no user", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
      verifyRecaptchaV2: recaptchaV2Returning("failed") as unknown as typeof deps.verifyRecaptchaV2,
      recaptchaV2Enabled: true,
    });
    await expect(
      register(deps, { ...validInput, recaptchaV2Token: "v2-bad" }),
    ).rejects.toBeInstanceOf(RecaptchaV2RequiredError);
    expect(db.users).toHaveLength(0);
  });
});
