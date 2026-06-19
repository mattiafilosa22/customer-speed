import { describe, expect, it } from "vitest";

import { RateLimitedError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { login } from "@/server/auth/login";
import {
  blockAllRateLimiter,
  buildFakeDeps,
  FakeDb,
  recaptchaReturning,
} from "@/server/auth/test-helpers";

function seedVerifiedUser(db: FakeDb) {
  return db.addUser({
    organizationId: "org_1",
    email: "user@example.com",
    passwordHash: "h:Password123",
    emailVerified: new Date("2026-01-01"),
    isActive: true,
    role: "proUser",
  });
}

const baseInput = {
  organizationId: "org_1",
  email: "user@example.com",
  password: "Password123",
};

describe("login", () => {
  it("returns the user on correct credentials and records audit + lastLoginAt", async () => {
    const db = new FakeDb();
    const user = seedVerifiedUser(db);
    const deps = buildFakeDeps(db);

    const result = await login(deps, baseInput);

    expect(result.userId).toBe(user.id);
    expect(result.organizationId).toBe("org_1");
    expect(result.role).toBe("proUser");
    expect(db.user().lastLoginAt).not.toBeNull();
    expect(db.audits.some((a) => a.action === "auth.login")).toBe(true);
  });

  it("throws the SAME UnauthorizedError for wrong password (no enumeration)", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db);
    await expect(login(deps, { ...baseInput, password: "WrongPass999" })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(db.audits.some((a) => a.action === "auth.login.failed")).toBe(true);
  });

  it("throws the SAME UnauthorizedError for an unknown email (no enumeration)", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db);
    await expect(login(deps, { ...baseInput, email: "ghost@example.com" })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("refuses login for an unverified email", async () => {
    const db = new FakeDb();
    db.addUser({
      organizationId: "org_1",
      email: "user@example.com",
      passwordHash: "h:Password123",
      emailVerified: null,
      isActive: true,
    });
    const deps = buildFakeDeps(db);
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refuses login for an inactive user", async () => {
    const db = new FakeDb();
    db.addUser({
      organizationId: "org_1",
      email: "user@example.com",
      passwordHash: "h:Password123",
      emailVerified: new Date(),
      isActive: false,
    });
    const deps = buildFakeDeps(db);
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("does NOT authenticate a user from another tenant with the same email", async () => {
    const db = new FakeDb();
    db.addUser({
      organizationId: "org_OTHER",
      email: "user@example.com",
      passwordHash: "h:Password123",
      emailVerified: new Date(),
      isActive: true,
    });
    const deps = buildFakeDeps(db);
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects invalid input with ValidationError", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(login(deps, { organizationId: "org_1", email: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("throws RateLimitedError when blocked", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db, { rateLimiter: blockAllRateLimiter() });
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(RateLimitedError);
  });

  // ── reCAPTCHA enforcement (docs/06 §6.2) ──────────────────────────────────
  it("rejects a FAILED reCAPTCHA with the generic UnauthorizedError", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("failed") as unknown as typeof deps.verifyRecaptcha,
    });
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
    // No successful login audit when captcha fails.
    expect(db.audits.some((a) => a.action === "auth.login")).toBe(false);
  });

  it("rejects a LOW-SCORE reCAPTCHA (bot-like) — previously accepted", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("low-score") as unknown as typeof deps.verifyRecaptcha,
    });
    await expect(login(deps, baseInput)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("accepts a SKIPPED reCAPTCHA (dev: keys not configured)", async () => {
    const db = new FakeDb();
    seedVerifiedUser(db);
    const deps = buildFakeDeps(db, {
      verifyRecaptcha: recaptchaReturning("skipped") as unknown as typeof deps.verifyRecaptcha,
    });
    const result = await login(deps, baseInput);
    expect(result.userId).toBeTruthy();
  });
});
