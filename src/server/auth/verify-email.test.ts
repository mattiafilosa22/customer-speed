import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { hashToken } from "@/lib/tokens";
import { register } from "@/server/auth/register";
import { verifyEmail } from "@/server/auth/verify-email";
import { buildFakeDeps, FakeDb } from "@/server/auth/test-helpers";

async function registerAndGetToken(db: FakeDb) {
  const deps = buildFakeDeps(db);
  const res = await register(
    deps,
    {
      organizationId: "org_1",
      name: "Tester",
      email: "t@example.com",
      password: "Password123",
      consents: [],
    },
    { exposeTokenForTests: true },
  );
  return { deps, token: res.verificationToken as string, userId: res.userId };
}

describe("verifyEmail", () => {
  it("verifies a valid token and marks emailVerified (happy path)", async () => {
    const db = new FakeDb();
    const { deps, token, userId } = await registerAndGetToken(db);

    const result = await verifyEmail(deps, { token });

    expect(result.userId).toBe(userId);
    expect(db.user().emailVerified).not.toBeNull();
    expect(db.emailToken().consumedAt).not.toBeNull();
    expect(db.audits.some((a) => a.action === "auth.verifyEmail")).toBe(true);
  });

  it("rejects an unknown token", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(verifyEmail(deps, { token: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a reused (already consumed) token", async () => {
    const db = new FakeDb();
    const { deps, token } = await registerAndGetToken(db);
    await verifyEmail(deps, { token });
    await expect(verifyEmail(deps, { token })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an expired token", async () => {
    const db = new FakeDb();
    const { token } = await registerAndGetToken(db);
    // The token was stored hashed (never raw).
    expect(db.emailToken().tokenHash).toBe(hashToken(token));
    // Move the clock past expiry (24h TTL).
    const later = buildFakeDeps(db, { now: () => new Date("2026-06-20T12:00:00.000Z") });
    await expect(verifyEmail(later, { token })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects invalid input (missing token)", async () => {
    const db = new FakeDb();
    const deps = buildFakeDeps(db);
    await expect(verifyEmail(deps, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
