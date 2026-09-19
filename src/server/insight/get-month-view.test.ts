import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { getMonthView } from "@/server/insight/get-month-view";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };
const MID_SEPTEMBER = () => new Date("2026-09-10T12:00:00.000Z");

function seedConfiguredTenant(activeFrom: Date | null = new Date(Date.UTC(2026, 8, 1))) {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id, insightActiveFrom: activeFrom });
  return { store, sourceId: source.id };
}

describe("getMonthView", () => {
  it("returns null when the tenant has no linked source", async () => {
    const store = new InsightStore();
    store.addOrganization({ id: "org-a", insightSourceId: null });

    expect(await getMonthView(store.deps("org-a"), SEPTEMBER_2026)).toBeNull();
  });

  it("emits one row per calendar day and zero-fills missing rows", async () => {
    const { store } = seedConfiguredTenant();
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-04", welcomeSent: 33 });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.days).toHaveLength(30);
    expect(view?.days[0]).toMatchObject({ date: "2026-09-01", welcome: { sent: 0 } });
    expect(view?.days[3]).toMatchObject({ date: "2026-09-04", welcome: { sent: 33 } });
  });

  it("marks days after today as future", async () => {
    const { store } = seedConfiguredTenant();
    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.days.find((day) => day.date === "2026-09-10")?.isFuture).toBe(false);
    expect(view?.days.find((day) => day.date === "2026-09-11")?.isFuture).toBe(true);
  });

  it("uses frozen counts before the activation boundary", async () => {
    const { store } = seedConfiguredTenant(new Date(Date.UTC(2026, 8, 5)));
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-02",
      isArchived: true,
      archivedOutboundMessages: 11,
      archivedWelcomeAppointments: 2,
      archivedWelcomeSales: 1,
    });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);
    const day = view?.days.find((row) => row.date === "2026-09-02");

    expect(day).toMatchObject({
      isArchived: true,
      outbound: { archivedMessages: 11 },
      welcome: { appointments: 2, sales: 1 },
    });
    expect(view).toMatchObject({ containsArchivedDays: true, containsLiveDays: true });
  });

  it("fills live derived columns and row totals from real entities", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    for (const channel of [ChatChannel.WELCOME, ChatChannel.OUTBOUND_COMMENT, ChatChannel.INBOUND]) {
      const lead = store.addLead({
        organizationId: "org-a",
        sourceId,
        chatChannel: channel,
        createdFromInsight: channel === ChatChannel.WELCOME,
      });
      store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-08" });
    }

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);
    const day = view?.days.find((row) => row.date === "2026-09-08");

    expect(day?.welcome).toMatchObject({ appointments: 1, appointmentsFromInsight: 1 });
    expect(day?.totalAppointments).toBe(3);
  });

  it("surfaces unattributed leads and computes totals and rates", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-03",
      welcomeSent: 100,
      welcomeReplies: 10,
    });
    const lead = store.addLead({ organizationId: "org-a", sourceId, chatChannel: null });
    store.addAppointment({ organizationId: "org-a", leadId: lead.id, createdAt: "2026-09-09" });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.unattributedLeadCount).toBe(1);
    expect(view?.totals.welcomeSent).toBe(100);
    expect(view?.rates.welcomeReplyRate).toBeCloseTo(0.1);
  });

  it("never mixes another tenant's data in", async () => {
    const { store, sourceId } = seedConfiguredTenant();
    store.addActivityDay({ organizationId: "org-b", date: "2026-09-03", welcomeSent: 999 });
    const lead = store.addLead({
      organizationId: "org-b",
      sourceId,
      chatChannel: ChatChannel.WELCOME,
    });
    store.addAppointment({ organizationId: "org-b", leadId: lead.id, createdAt: "2026-09-03" });

    const view = await getMonthView(store.deps("org-a", MID_SEPTEMBER), SEPTEMBER_2026);

    expect(view?.totals.welcomeSent).toBe(0);
    expect(view?.totals.totalAppointments).toBe(0);
  });
});
