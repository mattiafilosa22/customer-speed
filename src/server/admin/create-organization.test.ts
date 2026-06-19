import { describe, expect, it } from "vitest";

import { ConflictError, ValidationError } from "@/lib/errors";
import { LoggingEmailSender } from "@/server/email/logging-sender";
import { createOrganization } from "@/server/admin/create-organization";
import { AdminFakeDb, buildFakeAdminDeps } from "@/server/admin/test-helpers";

describe("admin/createOrganization", () => {
  const validInput = {
    name: "Acme",
    slug: "acme",
    appName: "Acme CRM",
    owner: { name: "Owner", email: "owner@acme.test" },
  };

  it("provisions the tenant + first proUser with defaults and an invite email", async () => {
    const db = new AdminFakeDb();
    const email = new LoggingEmailSender({ info: () => {} });
    const deps = buildFakeAdminDeps(db, { email });

    const result = await createOrganization(deps, validInput, { exposeTokenForTests: true });

    // Organization created with default theme + feature flags.
    const org = db.orgs.find((o) => o.id === result.organizationId);
    expect(org).toBeTruthy();
    expect(org!.slug).toBe("acme");
    expect((org!.featureFlags as Record<string, unknown>).calendarIntegrations).toBe(false);

    // Owner is a proUser, no password set (invite flow), email pre-verified.
    const owner = db.users.find((u) => u.id === result.ownerUserId);
    expect(owner!.role).toBe("proUser");
    expect(owner!.passwordHash).toBeNull();
    expect(owner!.emailVerified).not.toBeNull();

    // Default lists provisioned.
    expect(db.leadSources.length).toBeGreaterThan(0);
    expect(db.lossReasons.length).toBeGreaterThan(0);
    expect(db.stageConfigs).toHaveLength(9);

    // Invite token issued + emailed.
    expect(db.resetTokens).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("owner@acme.test");
    expect(email.sent[0]!.text).toContain(result.inviteToken);

    // Audited cross-tenant action.
    const audit = db.audits.find((a) => a.action === "admin.organization.create");
    expect(audit?.actorId).toBe("sa_1");
    expect(audit?.organizationId).toBe(result.organizationId);
  });

  it("rejects a duplicate slug with a typed conflict (no partial write)", async () => {
    const db = new AdminFakeDb();
    db.addOrg({ slug: "acme" });
    const before = { orgs: db.orgs.length, users: db.users.length };

    await expect(createOrganization(buildFakeAdminDeps(db), validInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
    // Nothing was created.
    expect(db.orgs.length).toBe(before.orgs);
    expect(db.users.length).toBe(before.users);
  });

  it("is atomic: a failure INSIDE the transaction rolls everything back", async () => {
    const db = new AdminFakeDb();
    // Force a step inside the transaction to throw AFTER the org + user are created.
    db.failOnStageConfigCreate = true;

    await expect(createOrganization(buildFakeAdminDeps(db), validInput)).rejects.toThrow("boom");
    // The $transaction restored the snapshot — nothing persisted.
    expect(db.orgs).toHaveLength(0);
    expect(db.users).toHaveLength(0);
    expect(db.resetTokens).toHaveLength(0);
  });

  it("rejects an invalid slug", async () => {
    const db = new AdminFakeDb();
    await expect(
      createOrganization(buildFakeAdminDeps(db), { ...validInput, slug: "Bad Slug!" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an invalid owner email", async () => {
    const db = new AdminFakeDb();
    await expect(
      createOrganization(buildFakeAdminDeps(db), {
        ...validInput,
        owner: { name: "X", email: "not-an-email" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
