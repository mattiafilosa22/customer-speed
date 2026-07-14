import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { getBoard } from "@/server/pipeline/get-board";
import { buildFakePipelineDeps, LeadStore } from "@/server/leads/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("getBoard", () => {
  it("builds one column per VISIBLE stage in config order, with DB-side counts", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    // Hide CALL_SCHEDULED so it must not appear as a column.
    store.stageConfig(ORG_A, LeadStage.CALL_SCHEDULED).isVisible = false;
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TAKEN });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    expect(columns).toHaveLength(10); // 11 - 1 hidden
    expect(columns.map((c) => c.stage)).not.toContain(LeadStage.CALL_SCHEDULED);
    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(2);
    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.cards).toHaveLength(2);
    expect(columns.find((c) => c.stage === LeadStage.TAKEN)?.count).toBe(1);
  });

  it("places cards in the correct column and computes daysInStage", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.WAITING_DOCS,
      firstName: "Anna",
      stageChangedAt: new Date("2026-06-10T00:00:00.000Z"),
    });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    const col = columns.find((c) => c.stage === LeadStage.WAITING_DOCS);
    expect(col?.cards[0]?.firstName).toBe("Anna");
    expect(col?.cards[0]?.daysInStage).toBeGreaterThanOrEqual(0);
  });

  it("does NOT include leads from another tenant (cross-tenant isolation)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    store.addLead({ organizationId: ORG_B, stage: LeadStage.TO_HANDLE });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, {});

    expect(columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(0);
  });

  it("filters by period (year/month) on createdAt, consistent with the list", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      createdAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      createdAt: new Date("2025-12-31T00:00:00.000Z"),
    });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const all = await getBoard(deps, { year: "2026" });
    expect(all.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(1);

    const march = await getBoard(deps, { year: "2026", month: "3" });
    expect(march.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(1);

    const april = await getBoard(deps, { year: "2026", month: "4" });
    expect(april.columns.find((c) => c.stage === LeadStage.TO_HANDLE)?.count).toBe(0);
  });

  it("filters cards AND counts by sourceId", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const funnel = store.addSource({ organizationId: ORG_A, label: "Funnel" });
    const referral = store.addSource({ organizationId: ORG_A, label: "Referral" });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, sourceId: funnel.id });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, sourceId: funnel.id });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, sourceId: referral.id });
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE, sourceId: null });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, { sourceId: funnel.id });

    const toHandle = columns.find((c) => c.stage === LeadStage.TO_HANDLE);
    // Both the DB-side count AND the returned cards are restricted to the source.
    expect(toHandle?.count).toBe(2);
    expect(toHandle?.cards).toHaveLength(2);
    expect(toHandle?.cards.every((card) => card.source?.id === funnel.id)).toBe(true);
  });

  it("returns an empty board for a sourceId of another tenant (cross-tenant)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.seedStageConfigs(ORG_B);
    const foreignSource = store.addSource({ organizationId: ORG_B, label: "Funnel B" });
    // Lead in A, but we filter by a source that belongs to B → no rows for A.
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, { sourceId: foreignSource.id });

    expect(columns.every((c) => c.count === 0)).toBe(true);
    expect(columns.every((c) => c.cards.length === 0)).toBe(true);
  });

  it("returns an empty board for a non-existent sourceId", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    store.addLead({ organizationId: ORG_A, stage: LeadStage.TO_HANDLE });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, { sourceId: "src_does_not_exist" });

    expect(columns.every((c) => c.count === 0)).toBe(true);
  });

  it("combines period and source filters (both must match)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const funnel = store.addSource({ organizationId: ORG_A, label: "Funnel" });
    // Matches both filters.
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      sourceId: funnel.id,
      createdAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    // Right source, wrong period.
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      sourceId: funnel.id,
      createdAt: new Date("2025-03-15T00:00:00.000Z"),
    });
    // Right period, wrong source.
    store.addLead({
      organizationId: ORG_A,
      stage: LeadStage.TO_HANDLE,
      sourceId: null,
      createdAt: new Date("2026-03-15T00:00:00.000Z"),
    });
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    const { columns } = await getBoard(deps, { year: "2026", month: "3", sourceId: funnel.id });

    const toHandle = columns.find((c) => c.stage === LeadStage.TO_HANDLE);
    expect(toHandle?.count).toBe(1);
    expect(toHandle?.cards).toHaveLength(1);
  });

  it("rejects an invalid period (out-of-range month)", async () => {
    const store = new LeadStore();
    store.seedStageConfigs(ORG_A);
    const { deps } = buildFakePipelineDeps(store, ORG_A, USER_A);

    await expect(getBoard(deps, { year: "2026", month: "13" })).rejects.toThrow();
  });
});
