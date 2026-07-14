import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { LeadStage } from "@/generated/prisma/enums";
import { setStageColor } from "@/server/pipeline/set-stage-color";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("setStageColor", () => {
  it("sets a valid --stage-* token (happy path) + audits", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await setStageColor(deps, { stage: LeadStage.TAKEN, colorToken: "--stage-won" });

    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).colorToken).toBe("--stage-won");
    expect(audits.some((a) => a.action === "pipeline.stage.color")).toBe(true);
  });

  it("resets the colour when given an empty string (→ null)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.stageConfig(ORG_A, LeadStage.TAKEN).colorToken = "--stage-won";
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await setStageColor(deps, { stage: LeadStage.TAKEN, colorToken: "" });

    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).colorToken).toBeNull();
  });

  it("rejects an arbitrary (non-token) colour value (anti-injection)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      setStageColor(deps, { stage: LeadStage.TAKEN, colorToken: "red; background:url(x)" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("self-heals a missing config row (pre-existing tenant, docs/03 §3.3) without touching another tenant's row", async () => {
    const store = new LeadStore();
    // ORG_A has NO config rows at all (simulates a tenant seeded before this
    // stage existed); ORG_B has its own, distinct, seeded row for the SAME
    // stage. Setting the colour for ORG_A must CREATE ORG_A's own row and must
    // NEVER read/touch ORG_B's.
    store.seedStageConfigs(ORG_B);
    const { deps, audits } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const result = await setStageColor(deps, { stage: LeadStage.TAKEN, colorToken: "--stage-won" });

    expect(result).toEqual({ stage: LeadStage.TAKEN, colorToken: "--stage-won" });
    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).colorToken).toBe("--stage-won");
    expect(store.stageConfig(ORG_A, LeadStage.TAKEN).organizationId).toBe(ORG_A);
    // ORG_B's own row is untouched.
    expect(store.stageConfig(ORG_B, LeadStage.TAKEN).colorToken).toBeNull();
    expect(audits.some((a) => a.action === "pipeline.stage.color")).toBe(true);
  });
});
