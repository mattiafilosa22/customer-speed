import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { getLead } from "@/server/leads/get-lead";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("getLead", () => {
  it("returns the lead detail for the tenant (happy path)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, firstName: "Mario" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const detail = await getLead(deps, lead.id);
    expect(detail.id).toBe(lead.id);
    expect(detail.firstName).toBe("Mario");
  });

  it("returns 404 for a lead in another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(getLead(deps, otherLead.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns 404 for a soft-deleted lead", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, deletedAt: new Date() });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(getLead(deps, lead.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
