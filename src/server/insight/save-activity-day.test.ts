import { describe, expect, it } from "vitest";

import { saveActivityDay } from "@/server/insight/save-activity-day";
import { InsightStore } from "@/server/insight/test-helpers";

const MID_SEPTEMBER = () => new Date("2026-09-10T12:00:00.000Z");

function validCounters(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-09-09",
    welcomeSent: 30,
    welcomeReplies: 3,
    outboundComments: 2,
    outboundStories: 1,
    outboundReplies: 2,
    inboundReceived: 1,
    ...overrides,
  };
}

function seedConfiguredTenant(activeFrom: Date | null = new Date(Date.UTC(2026, 8, 1))) {
  const store = new InsightStore();
  const source = store.addLeadSource({ organizationId: "org-a", label: "Instagram" });
  store.addOrganization({ id: "org-a", insightSourceId: source.id, insightActiveFrom: activeFrom });
  return store;
}

describe("saveActivityDay", () => {
  it("creates and then updates one row per day and tenant", async () => {
    const store = seedConfiguredTenant();

    await saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters());
    await saveActivityDay(
      store.deps("org-a", MID_SEPTEMBER),
      validCounters({ welcomeSent: 42 }),
    );

    const rows = store.chatActivityDays.filter((day) => day.organizationId === "org-a");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ welcomeSent: 42, isArchived: false });
  });

  it("allows welcome replies to exceed welcome messages, including zero sent", async () => {
    const store = seedConfiguredTenant();

    await saveActivityDay(
      store.deps("org-a", MID_SEPTEMBER),
      validCounters({ welcomeSent: 3, welcomeReplies: 5 }),
    );
    await saveActivityDay(
      store.deps("org-a", MID_SEPTEMBER),
      validCounters({ welcomeSent: 0, welcomeReplies: 5 }),
    );

    const rows = store.chatActivityDays.filter((day) => day.organizationId === "org-a");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ welcomeSent: 0, welcomeReplies: 5 });
    expect(store.audits).toHaveLength(2);
  });

  it("rolls back the counter write when recording its audit event fails", async () => {
    const store = seedConfiguredTenant();
    store.failNextAuditRecord();

    await expect(saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters())).rejects.toThrow(
      "simulated audit.record failure",
    );

    expect(store.chatActivityDays).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it.each([
    ["negative counters", { inboundReceived: -1 }, "inboundReceived"],
    ["decimal counters", { welcomeReplies: 1.5 }, "welcomeReplies"],
    ["non-numeric counters", { welcomeReplies: "not-a-number" }, "welcomeReplies"],
    ["counters above the absolute limit", { welcomeReplies: 100_001 }, "welcomeReplies"],
  ])("rejects %s", async (_label, overrides, field) => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(store.deps("org-a", MID_SEPTEMBER), validCounters(overrides)),
    ).rejects.toMatchObject({
      name: "ValidationError",
      issues: expect.objectContaining({ [field]: expect.any(Array) }),
    });
  });

  it("refuses to write a future day", async () => {
    const store = seedConfiguredTenant();

    await expect(
      saveActivityDay(
        store.deps("org-a", MID_SEPTEMBER),
        validCounters({ date: "2026-09-11" }),
      ),
    ).rejects.toMatchObject({ issues: { date: ["insight.errors.futureDay"] } });
  });

  it("refuses to write an archived day", async () => {
    const store = seedConfiguredTenant(new Date(Date.UTC(2026, 8, 5)));

    await expect(
      saveActivityDay(
        store.deps("org-a", MID_SEPTEMBER),
        validCounters({ date: "2026-09-02" }),
      ),
    ).rejects.toMatchObject({ issues: { date: ["insight.errors.archivedDay"] } });
  });

  it("writes into the caller's tenant only and records an audit event", async () => {
    const store = seedConfiguredTenant();
    store.addOrganization({ id: "org-b", insightSourceId: null });
    store.chatActivityDays.push({
      id: "org-b-existing-day",
      organizationId: "org-b",
      date: new Date("2026-09-09T00:00:00.000Z"),
      welcomeSent: 7,
      welcomeReplies: 9,
      outboundComments: 0,
      outboundStories: 0,
      outboundReplies: 0,
      inboundReceived: 0,
      isArchived: false,
      archivedOutboundMessages: null,
      archivedWelcomeAppointments: null,
      archivedWelcomeSales: null,
      archivedOutboundAppointments: null,
      archivedOutboundSales: null,
      archivedInboundAppointments: null,
      archivedInboundSales: null,
      createdAt: MID_SEPTEMBER(),
      updatedAt: MID_SEPTEMBER(),
    });

    await saveActivityDay(
      store.deps("org-a", MID_SEPTEMBER),
      { ...validCounters(), organizationId: "org-b" },
    );

    expect(store.chatActivityDays).toHaveLength(2);
    expect(store.chatActivityDays.find((day) => day.organizationId === "org-b")).toMatchObject({
      welcomeSent: 7,
      welcomeReplies: 9,
    });
    expect(store.audits).toContainEqual(
      expect.objectContaining({
        action: "insight.activityDay.save",
        organizationId: "org-a",
        entityId: "2026-09-09",
      }),
    );
  });
});
