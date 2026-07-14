import { describe, expect, it } from "vitest";

import { LeadStage } from "@/generated/prisma/enums";
import { STAGE_ORDER } from "@/server/leads/stage";
import { synthesizeMissingOrder, synthesizeSortOrderForStage } from "@/server/pipeline/stage-order";

describe("synthesizeMissingOrder", () => {
  it("returns the canonical index for every position when nothing is persisted", () => {
    const order = STAGE_ORDER.map(() => undefined);

    expect(synthesizeMissingOrder(order)).toEqual(STAGE_ORDER.map((_, i) => i));
  });

  it("leaves persisted values untouched", () => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    expect(synthesizeMissingOrder(order)).toEqual(order);
  });

  it("interpolates a single gap strictly between its two neighbours", () => {
    // Gap at index 2, neighbours 1 and 3 → midpoint 2.
    const result = synthesizeMissingOrder([1, undefined, 3]);

    expect(result[1]).toBeGreaterThan(1);
    expect(result[1]).toBeLessThan(3);
  });

  it("offsets from the left when there is no right neighbour", () => {
    const result = synthesizeMissingOrder([5, undefined, undefined]);

    expect(result[1]).toBeGreaterThan(5);
    expect(result[2]).toBeGreaterThan(result[1] as number);
  });

  it("offsets from the right when there is no left neighbour", () => {
    const result = synthesizeMissingOrder([undefined, undefined, 5]);

    expect(result[1]).toBeLessThan(5);
    expect(result[0]).toBeLessThan(result[1] as number);
  });

  it("reproduces the exact PRESENTATION_CALL_2/STANDBY migration scenario: a tenant with the old 9-stage numbering gets both new stages placed BETWEEN their canonical neighbours, not at the tail", () => {
    // Legacy sortOrder (0..8) as persisted before this migration, indexed by
    // canonical STAGE_ORDER position (undefined for the two new stages).
    const legacyByStage = new Map<LeadStage, number>([
      [LeadStage.TO_HANDLE, 0],
      [LeadStage.TAKEN, 1],
      [LeadStage.CALL_SCHEDULED, 2],
      [LeadStage.WAITING_DOCS, 3],
      [LeadStage.PRESENTATION_CALL, 4],
      [LeadStage.WAITING_DECISION, 5],
      [LeadStage.WAITING_PAYMENT, 6],
      [LeadStage.WON, 7],
      [LeadStage.LOST, 8],
    ]);
    const order = STAGE_ORDER.map((stage) => legacyByStage.get(stage));

    const result = synthesizeMissingOrder(order);
    const byIndex = new Map(STAGE_ORDER.map((stage, i) => [stage, result[i] as number]));

    expect(byIndex.get(LeadStage.PRESENTATION_CALL)).toBeLessThan(
      byIndex.get(LeadStage.PRESENTATION_CALL_2) as number,
    );
    expect(byIndex.get(LeadStage.PRESENTATION_CALL_2)).toBeLessThan(
      byIndex.get(LeadStage.WAITING_DECISION) as number,
    );
    expect(byIndex.get(LeadStage.WAITING_DECISION)).toBeLessThan(
      byIndex.get(LeadStage.STANDBY) as number,
    );
    expect(byIndex.get(LeadStage.STANDBY)).toBeLessThan(
      byIndex.get(LeadStage.WAITING_PAYMENT) as number,
    );
  });
});

describe("synthesizeSortOrderForStage", () => {
  it("computes the same default a fresh getPipelineConfig read would show, for a single missing stage", () => {
    const existing = [
      { stage: LeadStage.WAITING_DECISION, sortOrder: 5 },
      { stage: LeadStage.WAITING_PAYMENT, sortOrder: 6 },
    ];

    const sortOrder = synthesizeSortOrderForStage(LeadStage.STANDBY, existing);

    expect(sortOrder).toBeGreaterThan(5);
    expect(sortOrder).toBeLessThan(6);
  });

  it("falls back to the canonical index when the tenant has no configs at all", () => {
    const sortOrder = synthesizeSortOrderForStage(LeadStage.STANDBY, []);

    expect(sortOrder).toBe(STAGE_ORDER.indexOf(LeadStage.STANDBY));
  });
});
