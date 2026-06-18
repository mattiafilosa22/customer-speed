import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { listLeads } from "@/server/leads/list-leads";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";
const NOW = new Date("2026-06-18T12:00:00.000Z");

function seedTenantA(store: LeadStore): void {
  store.addLead({
    organizationId: ORG_A,
    firstName: "Annalisa",
    lastName: "Giobbio",
    email: "annalisa@example.com",
    stage: LeadStage.WAITING_DECISION,
    stageChangedAt: new Date("2026-06-01T00:00:00.000Z"), // 17 days
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
  });
  store.addLead({
    organizationId: ORG_A,
    firstName: "Andrea",
    lastName: "Carapezza",
    stage: LeadStage.CALL_SCHEDULED,
    stageChangedAt: new Date("2026-06-17T00:00:00.000Z"), // 1 day
    createdAt: new Date("2026-06-10T00:00:00.000Z"),
  });
  store.addLead({
    organizationId: ORG_A,
    firstName: "Fabrizio",
    lastName: "Checchi",
    stage: LeadStage.LOST,
    stageChangedAt: new Date("2026-05-01T00:00:00.000Z"), // 48 days
    createdAt: new Date("2026-04-15T00:00:00.000Z"),
  });
}

describe("listLeads", () => {
  it("returns paginated leads with day counts + tab counts (happy path)", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, {});

    expect(res.total).toBe(3);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(25);
    expect(res.stageCounts.all).toBe(3);
    expect(res.stageCounts[LeadStage.WAITING_DECISION]).toBe(1);
    expect(res.stageCounts[LeadStage.LOST]).toBe(1);
    const annalisa = res.data.find((l) => l.firstName === "Annalisa");
    expect(annalisa?.daysInStage).toBe(17);
  });

  it("filters by stage tab", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, { stage: LeadStage.LOST });
    expect(res.total).toBe(1);
    expect(res.data[0]?.firstName).toBe("Fabrizio");
    // Tab counts still span the whole period, not the active tab.
    expect(res.stageCounts.all).toBe(3);
  });

  it("searches by name (case-insensitive)", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, { query: "carap" });
    expect(res.data.map((l) => l.lastName)).toEqual(["Carapezza"]);
  });

  it("sorts by days descending (most stuck first)", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, { sort: "days_desc" });
    expect(res.data.map((l) => l.firstName)).toEqual(["Fabrizio", "Annalisa", "Andrea"]);
  });

  it("filters by minDays", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, { minDays: 25 });
    // Only Fabrizio (48 days) qualifies. stageChangedAt <= now - 25d.
    expect(res.data.map((l) => l.firstName)).toEqual(["Fabrizio"]);
  });

  it("paginates", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const page1 = await listLeads(deps, { pageSize: 2, page: 1 });
    const page2 = await listLeads(deps, { pageSize: 2, page: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page2.data).toHaveLength(1);
    expect(page1.total).toBe(3);
  });

  it("rejects an invalid sort with ValidationError", async () => {
    const store = new LeadStore();
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    await expect(listLeads(deps, { sort: "nope" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("never returns leads from another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    store.addLead({ organizationId: ORG_B, firstName: "Secret", lastName: "Tenant" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, {});
    expect(res.total).toBe(3);
    expect(res.data.some((l) => l.firstName === "Secret")).toBe(false);
  });

  it("excludes soft-deleted leads", async () => {
    const store = new LeadStore();
    seedTenantA(store);
    store.addLead({ organizationId: ORG_A, firstName: "Deleted", deletedAt: new Date() });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const res = await listLeads(deps, {});
    expect(res.total).toBe(3);
    expect(res.data.some((l) => l.firstName === "Deleted")).toBe(false);
  });

  // Guard against accidental regression of "now" wiring.
  it("computes days relative to the injected clock", async () => {
    const store = new LeadStore();
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TAKEN,
      stageChangedAt: NOW,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);
    const res = await listLeads(deps, {});
    expect(res.data[0]?.daysInStage).toBe(0);
  });
});
