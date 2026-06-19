import { describe, expect, it } from "vitest";

import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { changePassword } from "@/server/auth/change-password";
import { buildFakeDeps, FakeDb } from "@/server/auth/test-helpers";

function seedUser(db: FakeDb) {
  return db.addUser({
    organizationId: "org_1",
    email: "user@example.com",
    passwordHash: "h:OldPassword1",
    emailVerified: new Date(),
    isActive: true,
    sessionVersion: 5,
  });
}

describe("changePassword", () => {
  it("changes the password and bumps sessionVersion (invalidate other sessions)", async () => {
    const db = new FakeDb();
    const user = seedUser(db);
    const deps = buildFakeDeps(db);

    const result = await changePassword(
      deps,
      { userId: user.id, organizationId: "org_1" },
      { currentPassword: "OldPassword1", newPassword: "NewPassword2" },
    );

    expect(db.user().passwordHash).toBe("h:NewPassword2");
    expect(result.sessionVersion).toBe(6); // was 5
    expect(db.audits.some((a) => a.action === "auth.changePassword")).toBe(true);
  });

  it("rejects a wrong current password and audits the failure", async () => {
    const db = new FakeDb();
    const user = seedUser(db);
    const deps = buildFakeDeps(db);
    await expect(
      changePassword(
        deps,
        { userId: user.id, organizationId: "org_1" },
        { currentPassword: "WRONG", newPassword: "NewPassword2" },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(db.user().passwordHash).toBe("h:OldPassword1");
    expect(db.audits.some((a) => a.action === "auth.changePassword.failed")).toBe(true);
  });

  it("refuses when the actor's organizationId does not match the user (cross-tenant guard)", async () => {
    const db = new FakeDb();
    const user = seedUser(db);
    const deps = buildFakeDeps(db);
    await expect(
      changePassword(
        deps,
        { userId: user.id, organizationId: "org_EVIL" },
        { currentPassword: "OldPassword1", newPassword: "NewPassword2" },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a weak new password (policy)", async () => {
    const db = new FakeDb();
    const user = seedUser(db);
    const deps = buildFakeDeps(db);
    await expect(
      changePassword(
        deps,
        { userId: user.id, organizationId: "org_1" },
        { currentPassword: "OldPassword1", newPassword: "weak" },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
