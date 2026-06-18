import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { softDeleteLead } from "@/server/leads/soft-delete-lead";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("softDeleteLead", () => {
  it("sets deletedAt (happy path) and records audit", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const events: { action: string }[] = [];
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A, {
      audit: { record: async (e) => void events.push(e) },
    });

    await softDeleteLead(deps, lead.id);

    expect(store.lead().deletedAt).toBeInstanceOf(Date);
    expect(events.some((e) => e.action === "lead.delete")).toBe(true);
  });

  it("cannot delete a lead in another tenant (cross-tenant → 404)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(softDeleteLead(deps, otherLead.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(store.leads.find((l) => l.id === otherLead.id)?.deletedAt).toBeNull();
  });

  it("returns 404 for an already soft-deleted lead", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, deletedAt: new Date() });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(softDeleteLead(deps, lead.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
