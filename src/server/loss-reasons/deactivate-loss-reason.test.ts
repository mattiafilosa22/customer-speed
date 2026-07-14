import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { setLossReasonActive } from "@/server/loss-reasons/deactivate-loss-reason";
import { listLossReasons } from "@/server/loss-reasons/list-loss-reasons";
import { buildFakeLossReasonDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("setLossReasonActive", () => {
  it("deactivates an active reason", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await setLossReasonActive(deps, { id: reason.id, isActive: false });

    expect(result.isActive).toBe(false);
    expect(store.lossReasons[0]?.isActive).toBe(false);
  });

  it("reactivates a deactivated reason (toggle both directions)", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({
      organizationId: ORG_A,
      label: "Non risponde",
      isActive: false,
    });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    const result = await setLossReasonActive(deps, { id: reason.id, isActive: true });

    expect(result.isActive).toBe(true);
  });

  it("a deactivated reason disappears from the picker (includeInactive: false) but the row is untouched otherwise", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await setLossReasonActive(deps, { id: reason.id, isActive: false });

    const picker = await listLossReasons(deps, { includeInactive: false });
    const settingsList = await listLossReasons(deps, { includeInactive: true });

    expect(picker).toHaveLength(0);
    expect(settingsList).toHaveLength(1);
    expect(settingsList[0]).toMatchObject({ id: reason.id, label: "Non risponde" });
  });

  it("a lead already referencing a deactivated reason still resolves it (not deleted, only hidden from the picker)", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    store.addLead({ organizationId: ORG_A, lossReasonId: reason.id });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await setLossReasonActive(deps, { id: reason.id, isActive: false });

    expect(store.leads[0]?.lossReasonId).toBe(reason.id);
    expect(store.lossReasons[0]?.isActive).toBe(false);
  });

  it("rejects a non-boolean isActive with ValidationError", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      setLossReasonActive(deps, { id: reason.id, isActive: "no" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cannot toggle a reason belonging to another tenant (404, no write)", async () => {
    const store = new LeadStore();
    const otherReason = store.addLossReason({ organizationId: ORG_B, label: "Non risponde" });
    const deps = buildFakeLossReasonDeps(store, ORG_A, USER_A);

    await expect(
      setLossReasonActive(deps, { id: otherReason.id, isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.lossReasons.find((r) => r.id === otherReason.id)?.isActive).toBe(true);
  });
});
