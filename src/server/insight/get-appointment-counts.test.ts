import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { getAppointmentCounts } from "@/server/insight/get-appointment-counts";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

function seedTenantWithInstagramSource() {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id });
  return { store, config: { sourceId: source.id, activeFrom: null } };
}

describe("getAppointmentCounts", () => {
  it("counts a lead on the day its FIRST appointment was booked", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-07")?.welcome.total).toBe(1);
  });

  it("does not count a second appointment booked for the same lead later", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-07" });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-21" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-07")?.welcome.total).toBe(1);
    expect(byDay.get("2026-09-21")).toBeUndefined();
  });

  it("excludes a lead whose first appointment predates the month", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.INBOUND,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-08-20" });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-02" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("merges both outbound channels into the outbound column", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const fromComment = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_COMMENT,
    });
    const fromStory = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.OUTBOUND_STORY,
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: fromComment.id,
      createdAt: "2026-09-04",
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: fromStory.id,
      createdAt: "2026-09-04",
    });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-04")?.outbound.total).toBe(2);
  });

  it("splits out how many were created from the Insight section", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const createdHere = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      createdFromInsight: true,
    });
    const createdElsewhere = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
      createdFromInsight: false,
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: createdHere.id,
      createdAt: "2026-09-05",
    });
    store.addAppointment({
      organizationId: "org-a",
      leadId: createdElsewhere.id,
      createdAt: "2026-09-05",
    });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.get("2026-09-05")?.welcome).toEqual({ total: 2, fromInsight: 1 });
  });

  it("ignores leads from another source", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const otherSource = store.addLeadSource({ organizationId: "org-a", label: "Referenza" });
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: otherSource.id,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-08" });

    const { byDay } = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(byDay.size).toBe(0);
  });

  it("counts leads of the linked source without a channel as unattributed", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-a",
      sourceId: config.sourceId,
      chatChannel: null,
    });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-09" });

    const counts = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(counts.unattributedLeadCount).toBe(1);
    expect(counts.byDay.size).toBe(0);
  });

  it("never counts another tenant's leads", async () => {
    const { store, config } = seedTenantWithInstagramSource();
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId: config.sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-b", leadId: lead.id, createdAt: "2026-09-10" });

    const counts = await getAppointmentCounts(store.deps("org-a"), config, SEPTEMBER_2026);

    expect(counts.byDay.size).toBe(0);
    expect(counts.unattributedLeadCount).toBe(0);
  });
});
