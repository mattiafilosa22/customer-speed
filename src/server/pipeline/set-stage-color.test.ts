import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
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

  it("returns NotFound for a config of another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_B);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(
      setStageColor(deps, { stage: LeadStage.TAKEN, colorToken: "--stage-won" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
