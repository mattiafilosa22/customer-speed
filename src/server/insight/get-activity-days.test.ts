import { describe, expect, it } from "vitest";

import { getActivityDays } from "@/server/insight/get-activity-days";
import { InsightStore } from "@/server/insight/test-helpers";

const SEPTEMBER_2026 = { year: 2026, month: 9 };

describe("getActivityDays", () => {
  it("returns only the days of the requested month, ordered by date", async () => {
    const store = new InsightStore();
    store.addActivityDay({ organizationId: "org-a", date: "2026-08-31", welcomeSent: 10 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-03", welcomeSent: 20 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-09-01", welcomeSent: 30 });
    store.addActivityDay({ organizationId: "org-a", date: "2026-10-01", welcomeSent: 40 });

    const days = await getActivityDays(store.deps("org-a"), SEPTEMBER_2026);

    expect(days.map((day) => day.welcomeSent)).toEqual([30, 20]);
  });

  it("carries the archive fields through untouched", async () => {
    const store = new InsightStore();
    store.addActivityDay({
      organizationId: "org-a",
      date: "2026-09-02",
      isArchived: true,
      archivedOutboundMessages: 7,
      archivedWelcomeAppointments: 2,
    });

    const days = await getActivityDays(store.deps("org-a"), SEPTEMBER_2026);

    expect(days[0]!.isArchived).toBe(true);
    expect(days[0]!.archivedOutboundMessages).toBe(7);
    expect(days[0]!.archivedWelcomeAppointments).toBe(2);
  });

  it("never returns another tenant's rows", async () => {
    const store = new InsightStore();
    store.addActivityDay({ organizationId: "org-b", date: "2026-09-05", welcomeSent: 99 });

    expect(await getActivityDays(store.deps("org-a"), SEPTEMBER_2026)).toEqual([]);
  });

  it("rejects an out-of-range month", async () => {
    const store = new InsightStore();

    await expect(getActivityDays(store.deps("org-a"), { year: 2026, month: 13 })).rejects.toThrow();
  });
});
