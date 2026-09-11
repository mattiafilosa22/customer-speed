import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { getSaleCounts } from "@/server/insight/get-sale-counts";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

function seedTenantWithInstagramSource() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, config: { sourceId: source.id, activeFrom: null } };
}

describe("getSaleCounts", () => {
  it("counts a sale on the day the lead moved to WON", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.INBOUND,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-15",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-15")?.inbound.total).toBe(1);
  });

  it("counts a lead once, on its last move to WON", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-02",
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-20",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-02")).toBeUndefined();
    expect(byDay.get("2026-09-20")?.welcome.total).toBe(1);
  });

  it("drops a lead that was reopened", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WAITING_PAYMENT,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-11",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("ignores leads without a channel and leads of another source", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });
    const noChannel = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: null,
      stage: LeadStage.WON,
    });
    const otherSourceLead = store.addLead({
      organizationId: "org-a",
      sourceId: otherSource.id,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    for (const lead of [noChannel, otherSourceLead]) {
      store.addStageHistory({
        organizationId: "org-a",
        leadId: lead.id,
        toStage: LeadStage.WON,
        changedAt: "2026-09-12",
      });
    }

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("splits out how many were created from the Insight section", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_STORY,
      stage: LeadStage.WON,
      createdFromInsight: true,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-18",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-18")?.outbound).toEqual({ total: 1, fromInsight: 1 });
  });

  it("never counts another tenant's sales", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-b",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-19",
    });

    const byDay = await getSaleCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });
});
