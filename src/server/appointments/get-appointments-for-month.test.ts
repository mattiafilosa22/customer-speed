import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { getAppointmentsForMonth } from "@/server/appointments/get-appointments-for-month";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

// Use UTC-midday dates so the fake's UTC-day bucketing matches the day intended
// (the real query buckets at Europe/Rome; midday is unambiguous for both).
function at(day: number): Date {
  return new Date(Date.UTC(2026, 5, day, 12, 0, 0)); // June (month index 5)
}

describe("getAppointmentsForMonth", () => {
  it("aggregates the days that have appointments, with counts (happy path)", async () => {
    const store = new AppointmentStore();
    store.addAppointment({ organizationId: ORG_A, startAt: at(5) });
    store.addAppointment({ organizationId: ORG_A, startAt: at(5) });
    store.addAppointment({ organizationId: ORG_A, startAt: at(18) });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await getAppointmentsForMonth(deps, { year: 2026, month: 6 });

    expect(result.year).toBe(2026);
    expect(result.month).toBe(6);
    expect(result.days).toEqual([
      { day: 5, count: 2 },
      { day: 18, count: 1 },
    ]);
  });

  it("excludes other months", async () => {
    const store = new AppointmentStore();
    store.addAppointment({ organizationId: ORG_A, startAt: at(10) });
    store.addAppointment({
      organizationId: ORG_A,
      startAt: new Date(Date.UTC(2026, 6, 1, 12, 0, 0)), // July
    });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await getAppointmentsForMonth(deps, { year: 2026, month: 6 });

    expect(result.days).toEqual([{ day: 10, count: 1 }]);
  });

  it("never counts another tenant's appointments (isolation)", async () => {
    const store = new AppointmentStore();
    store.addAppointment({ organizationId: ORG_B, startAt: at(5) });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await getAppointmentsForMonth(deps, { year: 2026, month: 6 });

    expect(result.days).toEqual([]);
  });

  it("rejects an out-of-range month (input invalid)", async () => {
    const store = new AppointmentStore();
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      getAppointmentsForMonth(deps, { year: 2026, month: 13 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
