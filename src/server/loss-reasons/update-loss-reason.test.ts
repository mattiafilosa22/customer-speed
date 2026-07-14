import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { updateLossReason } from "@/server/loss-reasons/update-loss-reason";
import { buildFakeLossReasonDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("updateLossReason", () => {
  it("renames a reason (happy path)", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await updateLossReason(deps, { id: reason.id, label: "Non risponde più" });

    expect(result.label).toBe("Non risponde più");
    expect(store.lossReasons[0]?.label).toBe("Non risponde più");
  });

  it("allows saving the SAME label back on the SAME reason (no self-collision)", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await updateLossReason(deps, { id: reason.id, label: "Non risponde" });

    expect(result.label).toBe("Non risponde");
  });

  it("rejects a new label that collides with ANOTHER reason in the same tenant", async () => {
    const store = new LeadStore();
    store.addLossReason({ organizationId: ORG_A, label: "Budget insufficiente" });
    const other = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      updateLossReason(deps, { id: other.id, label: "Budget insufficiente" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(store.lossReasons.find((r) => r.id === other.id)?.label).toBe("Non risponde");
  });

  it("rejects an empty label with ValidationError", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(updateLossReason(deps, { id: reason.id, label: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("cannot rename a reason belonging to another tenant (404, no write)", async () => {
    const store = new LeadStore();
    const otherReason = store.addLossReason({ organizationId: ORG_B, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      updateLossReason(deps, { id: otherReason.id, label: "Hacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.lossReasons.find((r) => r.id === otherReason.id)?.label).toBe("Non risponde");
  });
});
