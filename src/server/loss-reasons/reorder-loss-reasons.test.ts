import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { reorderLossReasons } from "@/server/loss-reasons/reorder-loss-reasons";
import { buildFakeLossReasonDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("reorderLossReasons", () => {
  it("rewrites sortOrder 0..N-1 for the given full order (happy path)", async () => {
    const store = new LeadStore();
    const a = store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    const b = store.addLossReason({ organizationId: ORG_A, label: "B", sortOrder: 1 });
    const c = store.addLossReason({ organizationId: ORG_A, label: "C", sortOrder: 2 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await reorderLossReasons(deps, { order: [c.id, a.id, b.id] });

    expect(result.order).toEqual([c.id, a.id, b.id]);
    expect(store.lossReasons.find((r) => r.id === c.id)?.sortOrder).toBe(0);
    expect(store.lossReasons.find((r) => r.id === a.id)?.sortOrder).toBe(1);
    expect(store.lossReasons.find((r) => r.id === b.id)?.sortOrder).toBe(2);
  });

  it("includes inactive reasons in the reorderable set (Settings manages the full list)", async () => {
    const store = new LeadStore();
    const a = store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    const b = store.addLossReason({
      organizationId: ORG_A,
      label: "B",
      sortOrder: 1,
      isActive: false,
    });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await reorderLossReasons(deps, { order: [b.id, a.id] });

    expect(store.lossReasons.find((r) => r.id === b.id)?.sortOrder).toBe(0);
    expect(store.lossReasons.find((r) => r.id === a.id)?.sortOrder).toBe(1);
  });

  it("rejects an id belonging to another tenant (no write, whole reorder aborted)", async () => {
    const store = new LeadStore();
    const a = store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    const b = store.addLossReason({ organizationId: ORG_A, label: "B", sortOrder: 1 });
    const foreign = store.addLossReason({ organizationId: ORG_B, label: "Foreign", sortOrder: 0 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      reorderLossReasons(deps, { order: [foreign.id, a.id] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // No partial write: original order preserved.
    expect(store.lossReasons.find((r) => r.id === a.id)?.sortOrder).toBe(0);
    expect(store.lossReasons.find((r) => r.id === b.id)?.sortOrder).toBe(1);
  });

  it("rejects an incomplete order (missing a tenant reason)", async () => {
    const store = new LeadStore();
    const a = store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    store.addLossReason({ organizationId: ORG_A, label: "B", sortOrder: 1 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(reorderLossReasons(deps, { order: [a.id] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a duplicated id in the order with ValidationError", async () => {
    const store = new LeadStore();
    const a = store.addLossReason({ organizationId: ORG_A, label: "A", sortOrder: 0 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      reorderLossReasons(deps, { order: [a.id, a.id] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty order with ValidationError", async () => {
    const store = new LeadStore();
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(reorderLossReasons(deps, { order: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
