import { describe, expect, it } from "vitest";

import { RateLimitedError, ValidationError } from "@/lib/errors";
import { requestPasswordReset } from "@/server/auth/request-password-reset";
import { resetPassword } from "@/server/auth/reset-password";
import { blockAllRateLimiter, buildFakeDeps, FakeDb } from "@/server/auth/test-helpers";

function seedUser(db: FakeDb) {
  return db.addUser({
    organizationId: "org_1",
    email: "user@example.com",
    passwordHash: "h:OldPassword1",
    emailVerified: new Date(),
    isActive: true,
    sessionVersion: 3,
  });
}

describe("requestPasswordReset", () => {
  it("issues a reset token and emails it for an existing user", async () => {
    const db = new FakeDb();
    seedUser(db);
    const deps = buildFakeDeps(db);
    const res = await requestPasswordReset(
      deps,
      { organizationId: "org_1", email: "user@example.com" },
      { exposeTokenForTests: true },
    );
    expect(res.accepted).toBe(true);
    expect(res.resetToken).toBeTruthy();
    expect(db.resetTokens).toHaveLength(1);
    expect(db.audits.some((a) => a.action === "auth.requestPasswordReset")).toBe(true);
  });

  it("returns accepted WITHOUT issuing a token for an unknown email (no enumeration)", async () => {
    const db = new FakeDb();
    seedUser(db);
    const deps = buildFakeDeps(db);
    const res = await requestPasswordReset(
      deps,
      { organizationId: "org_1", email: "ghost@example.com" },
      { exposeTokenForTests: true },
    );
    expect(res.accepted).toBe(true);
    expect(res.resetToken).toBeUndefined();
    expect(db.resetTokens).toHaveLength(0);
  });

  it("does not issue a token for a user in another tenant", async () => {
    const db = new FakeDb();
    db.addUser({ organizationId: "org_OTHER", email: "user@example.com", isActive: true });
    const deps = buildFakeDeps(db);
    const res = await requestPasswordReset(deps, {
      organizationId: "org_1",
      email: "user@example.com",
    });
    expect(res.accepted).toBe(true);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("rejects invalid input", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(
      requestPasswordReset(deps, { organizationId: "org_1", email: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws RateLimitedError when blocked", async () => {
    const db = new FakeDb();
    seedUser(db);
    const deps = buildFakeDeps(db, { rateLimiter: blockAllRateLimiter() });
    await expect(
      requestPasswordReset(deps, { organizationId: "org_1", email: "user@example.com" }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("resetPassword", () => {
  async function issueToken(db: FakeDb) {
    const deps = buildFakeDeps(db);
    const res = await requestPasswordReset(
      deps,
      { organizationId: "org_1", email: "user@example.com" },
      { exposeTokenForTests: true },
    );
    return { deps, token: res.resetToken as string };
  }

  it("sets a new password and bumps sessionVersion (invalidate all sessions)", async () => {
    const db = new FakeDb();
    seedUser(db);
    const { deps, token } = await issueToken(db);

    await resetPassword(deps, { token, newPassword: "BrandNew123" });

    expect(db.user().passwordHash).toBe("h:BrandNew123");
    expect(db.user().sessionVersion).toBe(4); // was 3
    expect(db.resetToken().consumedAt).not.toBeNull();
    expect(db.audits.some((a) => a.action === "auth.resetPassword")).toBe(true);
  });

  it("rejects a reused token", async () => {
    const db = new FakeDb();
    seedUser(db);
    const { deps, token } = await issueToken(db);
    await resetPassword(deps, { token, newPassword: "BrandNew123" });
    await expect(resetPassword(deps, { token, newPassword: "Another123" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects an unknown token", async () => {
    const db = new FakeDb();
    seedUser(db);
    const deps = buildFakeDeps(db);
    await expect(
      resetPassword(deps, { token: "nope", newPassword: "BrandNew123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a weak new password (policy)", async () => {
    const db = new FakeDb();
    seedUser(db);
    const { deps, token } = await issueToken(db);
    await expect(resetPassword(deps, { token, newPassword: "weak" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
