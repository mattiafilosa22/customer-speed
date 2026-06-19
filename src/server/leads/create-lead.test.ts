import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { createLead } from "@/server/leads/create-lead";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("createLead", () => {
  it("creates a lead owned by the actor, in TO_HANDLE, in the actor's tenant (happy path)", async () => {
    const store = new LeadStore();
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const { id } = await createLead(deps, {
      firstName: "Mario",
      lastName: "Rossi",
      email: "Mario.Rossi@example.com",
      phone: "+39 320 1112233",
    });

    expect(id).toBeTruthy();
    const lead = store.lead();
    expect(lead.organizationId).toBe(ORG_A);
    expect(lead.ownerId).toBe(USER_A);
    expect(lead.email).toBe("mario.rossi@example.com"); // normalized
    expect(lead.stage).toBe(LeadStage.TO_HANDLE);
  });

  it("rejects invalid input with ValidationError (missing name, bad email)", async () => {
    const store = new LeadStore();
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(
      createLead(deps, { firstName: "", lastName: "Rossi", email: "not-an-email" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a sourceId that belongs to the tenant", async () => {
    const store = new LeadStore();
    const source = store.addSource({ organizationId: ORG_A, label: "Funnel" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const { id } = await createLead(deps, {
      firstName: "Mario",
      lastName: "Rossi",
      sourceId: source.id,
    });
    expect(id).toBeTruthy();
  });

  it("rejects a sourceId belonging to ANOTHER tenant (cross-tenant isolation → 404)", async () => {
    const store = new LeadStore();
    const otherSource = store.addSource({ organizationId: ORG_B, label: "Funnel" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await expect(
      createLead(deps, { firstName: "Mario", lastName: "Rossi", sourceId: otherSource.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.leads).toHaveLength(0);
  });

  it("records an audit entry for the actor's tenant", async () => {
    const store = new LeadStore();
    const events: { action: string; organizationId?: string | null }[] = [];
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A, {
      audit: { record: async (e) => void events.push(e) },
    });
    await createLead(deps, { firstName: "Mario", lastName: "Rossi" });
    expect(events.some((e) => e.action === "lead.create" && e.organizationId === ORG_A)).toBe(true);
  });
});
