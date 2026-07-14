import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { PIPELINE_REORDER_ERROR, reorderStages } from "@/server/pipeline/reorder-stages";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

const VALID_ORDER = [
  LeadStage.TAKEN,
  LeadStage.TO_HANDLE,
  LeadStage.CALL_SCHEDULED,
  LeadStage.WAITING_DOCS,
  LeadStage.PRESENTATION_CALL,
  LeadStage.PRESENTATION_CALL_2,
  LeadStage.WAITING_DECISION,
  LeadStage.STANDBY,
  LeadStage.WAITING_PAYMENT,
  LeadStage.WON,
  LeadStage.LOST,
];

describe("reorderStages", () => {
  it("persists a new total sortOrder atomically (happy path) + audits", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await reorderStages(deps, { order: VALID_ORDER });

    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).sortOrder).toBe(0);
    expect(store.stageConfig(ORG_A, LeadStage.TO_HANDLE).sortOrder).toBe(1);
    expect(store.stageConfig(ORG_A, LeadStage.LOST).sortOrder).toBe(10);
    expect(audits.some((a) => a.action === "pipeline.stage.reorder")).toBe(true);
  });

  it("rejects an order where a terminal stage precedes a non-terminal one", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const incoherent = [
      LeadStage.TO_HANDLE,
      LeadStage.WON, // terminal in the middle
      LeadStage.TAKEN,
      LeadStage.CALL_SCHEDULED,
      LeadStage.WAITING_DOCS,
      LeadStage.PRESENTATION_CALL,
      LeadStage.PRESENTATION_CALL_2,
      LeadStage.WAITING_DECISION,
      LeadStage.STANDBY,
      LeadStage.WAITING_PAYMENT,
      LeadStage.LOST,
    ];

    await expect(reorderStages(deps, { order: incoherent })).rejects.toMatchObject({
      message: PIPELINE_REORDER_ERROR,
    });
    // No partial write: original order preserved.
    expect(store.stageConfig(ORG_A, LeadStage.TO_HANDLE).sortOrder).toBe(0);
  });

  it("rejects an incomplete order (missing a stage)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      reorderStages(deps, { order: VALID_ORDER.slice(0, 8) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an order with a duplicated stage", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const dup = [...VALID_ORDER.slice(0, 8), LeadStage.WON];
    await expect(reorderStages(deps, { order: dup })).rejects.toBeInstanceOf(ValidationError);
  });

  it("self-heals missing config rows for a tenant that predates the new stages (docs/03 §3.3), instead of aborting the whole reorder", async () => {
    const store = new LeadStore();
    // ORG_A has config rows only for the original 9 stages (pre-migration
    // numbering) — no row yet for PRESENTATION_CALL_2/STANDBY.
    const legacyStages = [
      LeadStage.TO_HANDLE,
      LeadStage.TAKEN,
      LeadStage.CALL_SCHEDULED,
      LeadStage.WAITING_DOCS,
      LeadStage.PRESENTATION_CALL,
      LeadStage.WAITING_DECISION,
      LeadStage.WAITING_PAYMENT,
      LeadStage.WON,
      LeadStage.LOST,
    ];
    legacyStages.forEach((stage, index) => {
      store.addStageConfig({ organizationId: ORG_A, stage, sortOrder: index });
    });
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await reorderStages(deps, { order: VALID_ORDER });

    expect(store.stageConfig(ORG_A, LeadStage.PRESENTATION_CALL_2).sortOrder).toBe(5);
    expect(store.stageConfig(ORG_A, LeadStage.PRESENTATION_CALL_2).isVisible).toBe(true);
    expect(store.stageConfig(ORG_A, LeadStage.STANDBY).sortOrder).toBe(7);
    expect(store.stageConfig(ORG_A, LeadStage.STANDBY).isVisible).toBe(true);
    expect(audits.some((a) => a.action === "pipeline.stage.reorder")).toBe(true);
  });

  it("only reorders the acting tenant's configs (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await reorderStages(deps, { order: VALID_ORDER });

    // ORG_B keeps its original order (TO_HANDLE first).
    expect(store.stageConfig(ORG_B, LeadStage.TO_HANDLE).sortOrder).toBe(0);
    expect(store.stageConfig(ORG_B, LeadStage.TAKEN).sortOrder).toBe(1);
  });
});
