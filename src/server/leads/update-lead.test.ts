import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { CapitalBracket } from "@/generated/prisma/enums";
import { updateLead } from "@/server/leads/update-lead";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("updateLead", () => {
  it("updates only the provided fields (happy path)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, firstName: "Mario", lastName: "Rossi" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, {
      phone: "+39 333 0000000",
      capitalBracket: CapitalBracket.B_100_250K,
    });

    expect(store.lead().phone).toBe("+39 333 0000000");
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_100_250K);
    expect(store.lead().firstName).toBe("Mario"); // untouched
  });

  it("clears a nullable field when passed null", async () => {
    const store = new LeadStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      capitalBracket: CapitalBracket.B_0_50K,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, { capitalBracket: null });
    expect(store.lead().capitalBracket).toBeNull();
  });

  it("rejects an empty payload with ValidationError", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(updateLead(deps, lead.id, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a source from another tenant (cross-tenant → 404)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const otherSource = store.addSource({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(updateLead(deps, lead.id, { sourceId: otherSource.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("cannot update a lead in another tenant (404, no write)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B, firstName: "Other" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(updateLead(deps, otherLead.id, { firstName: "Hacked" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.leads.find((l) => l.id === otherLead.id)?.firstName).toBe("Other");
  });
});
