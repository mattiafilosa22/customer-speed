import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { createExternalRef, deleteExternalRef } from "@/server/leads/external-refs";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("external refs (Aggiornamento dati)", () => {
  it("creates an external ref on a tenant lead (happy path)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const { id } = await createExternalRef(deps, lead.id, {
      altName: "Mario R.",
      altEmail: "alt@example.com",
    });
    expect(id).toBeTruthy();
    expect(store.externalRefs[0]).toMatchObject({
      leadId: lead.id,
      organizationId: ORG_A,
      altEmail: "alt@example.com",
    });
  });

  it("rejects an empty ref (ValidationError)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(createExternalRef(deps, lead.id, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("cannot add a ref to a lead in another tenant (cross-tenant → 404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(createExternalRef(deps, otherLead.id, { altName: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(store.externalRefs).toHaveLength(0);
  });

  it("deletes a ref in the tenant", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const ref = store.addExternalRef({ organizationId: ORG_A, leadId: lead.id });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await deleteExternalRef(deps, ref.id);
    expect(store.externalRefs).toHaveLength(0);
  });

  it("cannot delete a ref in another tenant (404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const ref = store.addExternalRef({ organizationId: ORG_B, leadId: otherLead.id });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(deleteExternalRef(deps, ref.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(store.externalRefs).toHaveLength(1);
  });
});
