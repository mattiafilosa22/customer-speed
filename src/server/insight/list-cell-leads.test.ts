import { describe, expect, it } from "vitest";

import { ChatChannel, LeadStage } from "@/generated/prisma/enums";
import { listCellLeads } from "@/server/insight/list-cell-leads";
import { InsightStore } from "@/server/insight/test-helpers";

function seedConfiguredTenant() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, sourceId: source.id };
}

describe("listCellLeads", () => {
  it("lists the leads behind an appointments cell", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
      firstName: "Marco",
      lastName: "Bianchi",
      stage: LeadStage.CALL_SCHEDULED,
      createdFromInsight: true,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-07",
      group: "welcome",
      metric: "appointments",
    });

    expect(leads).toEqual([
      {
        id: lead.id,
        firstName: "Marco",
        lastName: "Bianchi",
        stage: LeadStage.CALL_SCHEDULED,
        createdFromInsight: true,
      },
    ]);
  });

  it("lists the leads behind a sales cell", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.INBOUND,
      stage: LeadStage.WON,
    });
    store.addStageHistory({
      organizationId: "org-a",
      leadId: lead.id,
      toStage: LeadStage.WON,
      changedAt: "2026-09-15",
    });

    const leads = await listCellLeads(store.deps("org-a"), {
      date: "2026-09-15",
      group: "inbound",
      metric: "sales",
    });

    expect(leads.map((row) => row.id)).toEqual([lead.id]);
  });

  it("returns no lead for another group or tenant", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    const own = store.addLead({
      organizationId: "org-a",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    const foreign = store.addLead({
      organizationId: "org-b",
      sourceId,
      chatChannel: ChatChannel.INBOUND,
    });
    store.addAppointment({ organizationId: "org-a", leadId: own.id, createdAt: "2026-09-07" });
    store.addAppointment({ organizationId: "org-b", leadId: foreign.id, createdAt: "2026-09-07" });

    expect(
      await listCellLeads(store.deps("org-a"), {
        date: "2026-09-07",
        group: "inbound",
        metric: "appointments",
      }),
    ).toEqual([]);
  });

  it("rejects malformed coordinates", async () => {
    const { store } = seedConfiguredTenant();

    await expect(
      listCellLeads(store.deps("org-a"), {
        date: "07/09/2026",
        group: "welcome",
        metric: "appointments",
      }),
    ).rejects.toThrow();
  });
});
