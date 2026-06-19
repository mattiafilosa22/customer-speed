import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { LoggingEmailSender } from "@/server/email/logging-sender";
import {
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "@/server/admin/manage-users";
import { AdminFakeDb, buildFakeAdminDeps } from "@/server/admin/test-helpers";

describe("admin/listUsers", () => {
  it("lists the tenant's users (excluding superAdmin), without passwordHash", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    db.addUser({ organizationId: org.id, email: "u1@a.test", role: "proUser" });
    db.addUser({ organizationId: org.id, email: "sa@a.test", role: "superAdmin" });
    // A user of ANOTHER tenant must not appear.
    const other = db.addOrg({ slug: "bravo" });
    db.addUser({ organizationId: other.id, email: "x@b.test", role: "proUser" });

    const result = await listUsers(buildFakeAdminDeps(db), {
      organizationId: org.id,
      page: 1,
      pageSize: 20,
    });
    expect(result.total).toBe(1);
    expect(result.items[0]!.email).toBe("u1@a.test");
    expect(result.items[0]).not.toHaveProperty("passwordHash");
  });
});

describe("admin/createUser", () => {
  const input = (organizationId: string) => ({
    organizationId,
    name: "New",
    email: "new@a.test",
    role: "baseUser" as const,
  });

  it("invites a user (no password, reset token emailed) and audits", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    const email = new LoggingEmailSender({ info: () => {} });
    const deps = buildFakeAdminDeps(db, { email });

    const result = await createUser(deps, input(org.id), { exposeTokenForTests: true });
    const user = db.users.find((u) => u.id === result.userId)!;
    expect(user.role).toBe("baseUser");
    expect(user.passwordHash).toBeNull();
    expect(db.resetTokens).toHaveLength(1);
    expect(email.sent[0]!.text).toContain(result.inviteToken);
    expect(db.audits.some((a) => a.action === "admin.user.create")).toBe(true);
  });

  it("rejects a duplicate email within the tenant", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    db.addUser({ organizationId: org.id, email: "new@a.test" });
    await expect(createUser(buildFakeAdminDeps(db), input(org.id))).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("allows the SAME email in a different tenant (per-tenant uniqueness)", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    const b = db.addOrg({ slug: "bravo" });
    db.addUser({ organizationId: a.id, email: "new@a.test" });
    await expect(createUser(buildFakeAdminDeps(db), input(b.id))).resolves.toMatchObject({
      userId: expect.any(String),
    });
  });

  it("rejects an unknown organization", async () => {
    const db = new AdminFakeDb();
    await expect(createUser(buildFakeAdminDeps(db), input("nope"))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects assigning superAdmin via the schema", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    await expect(
      createUser(buildFakeAdminDeps(db), { ...input(org.id), role: "superAdmin" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("admin/updateUser", () => {
  it("updates role + bumps sessionVersion on access change", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    const u = db.addUser({ organizationId: org.id, email: "u@a.test", role: "baseUser" });

    await updateUser(buildFakeAdminDeps(db), {
      organizationId: org.id,
      userId: u.id,
      role: "proUser",
    });
    const after = db.users.find((x) => x.id === u.id)!;
    expect(after.role).toBe("proUser");
    expect(after.sessionVersion).toBe(1);
    expect(db.audits.some((a) => a.action === "admin.user.update")).toBe(true);
  });

  it("refuses to touch a user of a DIFFERENT tenant (defensive scoping)", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    const b = db.addOrg({ slug: "bravo" });
    const userB = db.addUser({ organizationId: b.id, email: "x@b.test" });
    // Ask to update userB but claim it belongs to tenant A → NotFound.
    await expect(
      updateUser(buildFakeAdminDeps(db), {
        organizationId: a.id,
        userId: userB.id,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.users.find((x) => x.id === userB.id)!.isActive).toBe(true);
  });

  it("refuses to modify a superAdmin", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    const sa = db.addUser({ organizationId: org.id, email: "sa@a.test", role: "superAdmin" });
    await expect(
      updateUser(buildFakeAdminDeps(db), {
        organizationId: org.id,
        userId: sa.id,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("admin/resetUserPassword", () => {
  it("issues a reset token, emails it and audits", async () => {
    const db = new AdminFakeDb();
    const org = db.addOrg({ slug: "alpha" });
    const u = db.addUser({ organizationId: org.id, email: "u@a.test" });
    const email = new LoggingEmailSender({ info: () => {} });

    const result = await resetUserPassword(buildFakeAdminDeps(db, { email }), {
      organizationId: org.id,
      userId: u.id,
    }, { exposeTokenForTests: true });

    expect(db.resetTokens).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("u@a.test");
    expect(email.sent[0]!.text).toContain(result.resetToken);
    expect(db.audits.some((a) => a.action === "admin.user.resetPassword")).toBe(true);
  });

  it("throws NotFound for a user of another tenant", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    const b = db.addOrg({ slug: "bravo" });
    const userB = db.addUser({ organizationId: b.id, email: "x@b.test" });
    await expect(
      resetUserPassword(buildFakeAdminDeps(db), { organizationId: a.id, userId: userB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
