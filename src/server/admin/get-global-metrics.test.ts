import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { getGlobalMetrics } from "@/server/admin/get-global-metrics";
import { AdminFakeDb, buildFakeAdminDeps } from "@/server/admin/test-helpers";

/**
 * getGlobalMetrics aggregates CROSS-TENANT (docs/08 Fase 7). These tests prove
 * the counts/sums fold across MULTIPLE tenants — i.e. the use case does NOT use a
 * tenant filter — and that derived figures (conv. rate) are correct.
 */
describe("admin/getGlobalMetrics", () => {
  it("aggregates tenants, users, leads and revenue across ALL tenants", async () => {
    const db = new AdminFakeDb();
    const a = db.addOrg({ slug: "alpha" });
    const b = db.addOrg({ slug: "bravo" });
    // superAdmin lives in tenant A but must NOT be counted as a tenant user.
    db.addUser({ organizationId: a.id, email: "sa@x.test", role: "superAdmin" });
    db.addUser({ organizationId: a.id, email: "u1@a.test", role: "proUser" });
    db.addUser({ organizationId: b.id, email: "u2@b.test", role: "baseUser" });
    db.addUser({ organizationId: b.id, email: "u3@b.test", role: "baseUser" });

    db.addLead({ organizationId: a.id, stage: LeadStage.WON });
    db.addLead({ organizationId: a.id, stage: LeadStage.TO_HANDLE });
    db.addLead({ organizationId: b.id, stage: LeadStage.WON });
    db.addLead({ organizationId: b.id, stage: LeadStage.LOST });
    // Soft-deleted lead must be excluded.
    db.addLead({ organizationId: b.id, stage: LeadStage.WON, deletedAt: new Date() });

    db.addInvoice(a.id, "1000.00");
    db.addInvoice(b.id, "2500.50");

    const metrics = await getGlobalMetrics(buildFakeAdminDeps(db));

    expect(metrics.tenantCount).toBe(2);
    expect(metrics.userCount).toBe(3); // superAdmin excluded
    expect(metrics.leadCount).toBe(4); // soft-deleted excluded
    expect(metrics.wonCount).toBe(2); // soft-deleted WON excluded
    expect(metrics.convRate).toBeCloseTo(2 / 4);
    expect(metrics.netRevenue).toBeCloseTo(3500.5);
  });

  it("returns zeros (no division by zero) with no data", async () => {
    const db = new AdminFakeDb();
    const metrics = await getGlobalMetrics(buildFakeAdminDeps(db));
    expect(metrics).toEqual({
      tenantCount: 0,
      userCount: 0,
      leadCount: 0,
      wonCount: 0,
      convRate: 0,
      netRevenue: 0,
    });
  });
});
