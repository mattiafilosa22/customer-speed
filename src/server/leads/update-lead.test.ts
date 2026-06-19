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

  it("derives and saves the bracket from an exact capital amount", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    // Exact amount 175 000 → bracket 100–250k (and the amount is stored too).
    await updateLead(deps, lead.id, { capitalAmount: "175000", capitalBracket: null });

    expect(store.lead().capitalAmount).toBe(175_000);
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_100_250K);
  });

  it("ignores a client-sent bracket when an exact amount is present (server derives it)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    // Client lies (B_OVER_1M) but the amount maps to 50–100k → server wins.
    await updateLead(deps, lead.id, {
      capitalAmount: "75000",
      capitalBracket: CapitalBracket.B_OVER_1M,
    });

    expect(store.lead().capitalAmount).toBe(75_000);
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_50_100K);
  });

  it("accepts a comma decimal separator from the form", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, { capitalAmount: "1.234,50", capitalBracket: null });

    expect(store.lead().capitalAmount).toBe(1234.5);
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_0_50K);
  });

  it("clears the exact amount when a bracket is chosen instead", async () => {
    const store = new LeadStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      capitalAmount: 175_000,
      capitalBracket: CapitalBracket.B_100_250K,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, {
      capitalAmount: null,
      capitalBracket: CapitalBracket.B_500K_1M,
    });

    expect(store.lead().capitalAmount).toBeNull();
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_500K_1M);
  });

  it("clears both amount and bracket when both are empty", async () => {
    const store = new LeadStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      capitalAmount: 175_000,
      capitalBracket: CapitalBracket.B_100_250K,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, { capitalAmount: null, capitalBracket: null });

    expect(store.lead().capitalAmount).toBeNull();
    expect(store.lead().capitalBracket).toBeNull();
  });

  it("leaves capital untouched when neither field is provided", async () => {
    const store = new LeadStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      capitalAmount: 175_000,
      capitalBracket: CapitalBracket.B_100_250K,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await updateLead(deps, lead.id, { phone: "+39 333 111" });

    expect(store.lead().capitalAmount).toBe(175_000);
    expect(store.lead().capitalBracket).toBe(CapitalBracket.B_100_250K);
  });

  it("rejects a negative exact amount with ValidationError", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(
      updateLead(deps, lead.id, { capitalAmount: "-100", capitalBracket: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-numeric exact amount with ValidationError", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(
      updateLead(deps, lead.id, { capitalAmount: "abc", capitalBracket: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cannot set the capital of a lead in another tenant (404, no write)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(
      updateLead(deps, otherLead.id, { capitalAmount: "175000", capitalBracket: null }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.leads.find((l) => l.id === otherLead.id)?.capitalAmount).toBeNull();
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
