import { describe, expect, it } from "vitest";

import { ConflictError, ValidationError } from "@/lib/errors";
import { createLossReason } from "@/server/loss-reasons/create-loss-reason";
import { buildFakeLossReasonDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("createLossReason", () => {
  it("creates a reason, active by default, appended at the end (happy path)", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_A, label: "Budget insufficiente", sortOrder: 0 });
    store.addLossReason({ organizationId: ORG_A, label: "Non risponde", sortOrder: 1 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await createLossReason(deps, { label: "Ha scelto un competitor" });

    expect(result).toMatchObject({
      label: "Ha scelto un competitor",
      isActive: true,
      sortOrder: 2,
    });
    expect(store.lossReasons).toHaveLength(3);
  });

  it("trims the label and rejects an empty one", async () => {
    const store = new LeadStore();
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(createLossReason(deps, { label: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(store.lossReasons).toHaveLength(0);
  });

  it("rejects a label that already exists in the SAME tenant (duplicate, case-sensitive exact match)", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_A, label: "Budget insufficiente" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      createLossReason(deps, { label: "Budget insufficiente" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(store.lossReasons).toHaveLength(1);
  });

  it("allows the SAME label to exist in a DIFFERENT tenant (isolation)", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_B, label: "Budget insufficiente" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await createLossReason(deps, { label: "Budget insufficiente" });

    expect(result.label).toBe("Budget insufficiente");
    expect(store.lossReasons.filter((r) => r.organizationId === ORG_A)).toHaveLength(1);
    expect(store.lossReasons.filter((r) => r.organizationId === ORG_B)).toHaveLength(1);
  });

  it("does not let another tenant's sortOrder influence the appended position", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_B, label: "Altro tenant", sortOrder: 99 });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await createLossReason(deps, { label: "Primo motivo" });

    expect(result.sortOrder).toBe(0);
  });
});
