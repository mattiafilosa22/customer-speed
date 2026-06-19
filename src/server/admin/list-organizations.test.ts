import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { ValidationError } from "@/lib/errors";
import { listOrganizations } from "@/server/admin/list-organizations";
import { AdminFakeDb, buildFakeAdminDeps } from "@/server/admin/test-helpers";

describe("admin/listOrganizations", () => {
  function seed(): { db: AdminFakeDb } {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha", name: "Alpha", createdAt: new Date("2026-03-01") });
    const b = db.addOrg({ slug: "bravo", name: "Bravo", createdAt: new Date("2026-01-01") });
    db.addUser({ organizationId: a.id, email: "sa@x.test", role: "superAdmin" }); // excluded
    db.addUser({ organizationId: a.id, email: "u1@a.test", role: "proUser", isActive: true });
    db.addUser({ organizationId: a.id, email: "u2@a.test", role: "baseUser", isActive: false });
    // Tenant B has users but all inactive → suspended.
    db.addUser({ organizationId: b.id, email: "u3@b.test", role: "proUser", isActive: false });
    db.addLead({ organizationId: a.id, stage: LeadStage.WON });
    db.addLead({ organizationId: a.id, stage: LeadStage.TO_HANDLE, deletedAt: new Date() }); // excluded
    return { db };
  }

  it("returns per-tenant synthetic metrics (no N+1) ordered by createdAt desc", async () => {
    const { db } = seed();
    const result = await listOrganizations(buildFakeAdminDeps(db), {});

    expect(result.total).toBe(2);
    expect(result.items.map((o) => o.slug)).toEqual(["alpha", "bravo"]); // desc by createdAt

    const alpha = result.items[0]!;
    expect(alpha.userCount).toBe(2); // superAdmin excluded
    expect(alpha.leadCount).toBe(1); // soft-deleted excluded
    expect(alpha.isSuspended).toBe(false); // has an active user

    const bravo = result.items[1]!;
    expect(bravo.userCount).toBe(1);
    expect(bravo.isSuspended).toBe(true); // users exist but none active
  });

  it("paginates", async () => {
    const { db } = seed();
    const page1 = await listOrganizations(buildFakeAdminDeps(db), { page: 1, pageSize: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    const page2 = await listOrganizations(buildFakeAdminDeps(db), { page: 2, pageSize: 1 });
    expect(page2.items).toHaveLength(1);
    expect(page1.items[0]!.id).not.toBe(page2.items[0]!.id);
  });

  it("rejects an invalid pageSize", async () => {
    const { db } = seed();
    await expect(
      listOrganizations(buildFakeAdminDeps(db), { pageSize: 9999 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
