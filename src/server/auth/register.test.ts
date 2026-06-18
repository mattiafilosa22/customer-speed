import { describe, expect, it } from "vitest";

import { ConflictError, RateLimitedError, ValidationError } from "@/lib/errors";
import { register } from "@/server/auth/register";
import { blockAllRateLimiter, buildFakeDeps, FakeDb } from "@/server/auth/test-helpers";

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
});
