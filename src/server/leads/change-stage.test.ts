import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { changeStage } from "@/server/leads/change-stage";
import { buildFakeLeadDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";
const NOW = new Date("2026-06-18T12:00:00.000Z");

describe("changeStage", () => {
  it("updates stage + stageChangedAt and writes a StageHistory row atomically (happy path)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      stageChangedAt: new Date("2026-06-01T00:00:00.000Z"),
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const result = await changeStage(deps, lead.id, { stage: LeadStage.TAKEN });

    expect(result.changed).toBe(true);
    expect(store.lead().stage).toBe(LeadStage.TAKEN);
    expect(store.lead().stageChangedAt).toEqual(NOW); // day counter reset
    expect(store.stageHistory).toHaveLength(1);
    expect(store.stageHistory[0]).toMatchObject({
      leadId: lead.id,
      fromStage: LeadStage.TO_HANDLE,
      toStage: LeadStage.TAKEN,
      changedById: USER_A,
      organizationId: ORG_A,
    });
  });

  it("is an idempotent no-op (no history, no counter reset) when moving to the SAME stage", async () => {
    const store = new LeadStore();
    const stageChangedAt = new Date("2026-06-01T00:00:00.000Z");
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN, stageChangedAt });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const result = await changeStage(deps, lead.id, { stage: LeadStage.TAKEN });

    expect(result.changed).toBe(false);
    expect(store.lead().stageChangedAt).toEqual(stageChangedAt); // unchanged
    expect(store.stageHistory).toHaveLength(0);
  });

  it("requires a lossReasonId when moving to LOST (ValidationError when missing)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await expect(changeStage(deps, lead.id, { stage: LeadStage.LOST })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // No write happened.
    expect(store.lead().stage).toBe(LeadStage.WAITING_DECISION);
    expect(store.stageHistory).toHaveLength(0);
  });

  it("accepts LOST with a tenant loss reason and stores the reason", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non ha più risposto" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const result = await changeStage(deps, lead.id, {
      stage: LeadStage.LOST,
      lossReasonId: reason.id,
    });

    expect(result.changed).toBe(true);
    expect(store.lead().stage).toBe(LeadStage.LOST);
    expect(store.lead().lossReasonId).toBe(reason.id);
  });

  it("rejects a lossReasonId from ANOTHER tenant (cross-tenant isolation → 404)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const otherReason = store.addLossReason({ organizationId: ORG_B, label: "X" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await expect(
      changeStage(deps, lead.id, { stage: LeadStage.LOST, lossReasonId: otherReason.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.lead().stage).toBe(LeadStage.WAITING_DECISION);
  });

  it("clears the loss reason when leaving LOST for another stage", async () => {
    const store = new LeadStore();
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non ha più risposto" });
    const lead = store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.LOST,
      lossReasonId: reason.id,
    });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await changeStage(deps, lead.id, { stage: LeadStage.TAKEN });

    expect(store.lead().stage).toBe(LeadStage.TAKEN);
    expect(store.lead().lossReasonId).toBeNull();
  });

  it("cannot change the stage of a lead in ANOTHER tenant (404, no write)", async () => {
    const store = new LeadStore();
    const otherLead = store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await expect(
      changeStage(deps, otherLead.id, { stage: LeadStage.TAKEN }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.leads.find((l) => l.id === otherLead.id)?.stage).toBe(LeadStage.TO_HANDLE);
    expect(store.stageHistory).toHaveLength(0);
  });

  it("rejects LOST with both lossReasonId and lossReasonCustomText", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const reason = store.addLossReason({ organizationId: ORG_A, label: "Non ha più risposto" });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await expect(
      changeStage(deps, lead.id, {
        stage: LeadStage.LOST,
        lossReasonId: reason.id,
        lossReasonCustomText: "Non risponde più alle chiamate",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // No write happened.
    expect(store.lead().stage).toBe(LeadStage.WAITING_DECISION);
    expect(store.stageHistory).toHaveLength(0);
  });

  it("accepts LOST with only lossReasonCustomText (no lossReasonId)", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    const result = await changeStage(deps, lead.id, {
      stage: LeadStage.LOST,
      lossReasonCustomText: "Non risponde più alle chiamate",
    });

    expect(result.changed).toBe(true);
    expect(store.lead().stage).toBe(LeadStage.LOST);
    expect(store.lead().lossReasonId).toBeNull();
    expect(store.lead().lossReasonCustomText).toBe("Non risponde più alle chiamate");
  });

  it("clears lossReasonCustomText when moving away from LOST", async () => {
    const store = new LeadStore();
    const lead = store.addLead({ organizationId: ORG_A, stage: LeadStage.WAITING_DECISION });
    const deps = buildFakeLeadDeps(store, ORG_A, USER_A);

    await changeStage(deps, lead.id, {
      stage: LeadStage.LOST,
      lossReasonCustomText: "Prezzo troppo alto",
    });
    await changeStage(deps, lead.id, { stage: LeadStage.WAITING_DECISION });

    expect(store.lead().lossReasonCustomText).toBeNull();
    expect(store.lead().lossReasonId).toBeNull();
  });
});
