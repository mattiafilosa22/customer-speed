import { describe, expect, it } from "vitest";

import { listLossReasons } from "@/server/loss-reasons/list-loss-reasons";
import { buildFakeLossReasonDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("listLossReasons", () => {
  it("defaults to ONLY active reasons (the picker use), ordered by sortOrder", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_A, label: "B", sortOrder: 1 });
    store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    store.addLossReason({
      organizationId: ORG_A,
      label: "Inattivo",
      sortOrder: 2,
      isActive: false,
    });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await listLossReasons(deps);

    expect(result.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("includeInactive: true returns every reason (the Settings use), still ordered", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_A, label: "B", sortOrder: 1 });
    store.addLossReason({
      organizationId: ORG_A,
      label: "Inattivo",
      sortOrder: 0,
      isActive: false,
    });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await listLossReasons(deps, { includeInactive: true });

    expect(result.map((r) => r.label)).toEqual(["Inattivo", "B"]);
    expect(result.map((r) => r.isActive)).toEqual([false, true]);
  });

  it("never returns another tenant's reasons (isolation)", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_B, label: "Altro tenant" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await listLossReasons(deps, { includeInactive: true });

    expect(result).toHaveLength(0);
  });

  it("returns an empty list for a tenant with no loss reasons", async () => {
    const store = new LeadStore();
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await listLossReasons(deps);

    expect(result).toEqual([]);
  });
});
