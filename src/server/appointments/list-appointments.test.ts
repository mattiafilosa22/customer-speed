import { describe, expect, it } from "vitest";

import { AppointmentStatus } from "@/generated/prisma/enums";
import { listAppointments } from "@/server/appointments/list-appointments";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

function seed(store: AppointmentStore): void {
  store.addAppointment({
    organizationId: ORG_A,
    startAt: new Date("2026-06-12T09:00:00.000Z"),
    status: AppointmentStatus.PENDING,
    reason: "second",
  });
  store.addAppointment({
    organizationId: ORG_A,
    startAt: new Date("2026-06-10T09:00:00.000Z"),
    status: AppointmentStatus.DONE,
    reason: "first",
  });
  store.addAppointment({
    organizationId: ORG_A,
    startAt: new Date("2026-06-15T09:00:00.000Z"),
    status: AppointmentStatus.CANCELED,
    reason: "third",
  });
}

describe("listAppointments", () => {
  it("returns all appointments ordered by startAt asc with tab counts (happy path)", async () => {
    const store = new AppointmentStore();
    seed(store);
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "all" });

    expect(result.data.map((a) => a.reason)).toEqual(["first", "second", "third"]);
    // counts: all=3, todo(PENDING)=1, done(DONE)=1 (canceled excluded from tabs).
    expect(result.counts).toEqual({ all: 3, todo: 1, done: 1 });
    expect(result.total).toBe(3);
  });

  it("filters 'todo' to PENDING only", async () => {
    const store = new AppointmentStore();
    seed(store);
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "todo" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe(AppointmentStatus.PENDING);
    expect(result.total).toBe(1);
    // Counts always span the full scope regardless of the active filter.
    expect(result.counts.all).toBe(3);
  });

  it("filters 'done' to DONE only", async () => {
    const store = new AppointmentStore();
    seed(store);
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "done" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe(AppointmentStatus.DONE);
  });

  it("restricts to a single lead when leadId is given", async () => {
    const store = new AppointmentStore();
    const lead = store.addLead({ organizationId: ORG_A, firstName: "Anna", lastName: "B" });
    store.addAppointment({ organizationId: ORG_A, leadId: lead.id, reason: "linked" });
    store.addAppointment({ organizationId: ORG_A, reason: "unlinked" });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "all", leadId: lead.id });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.reason).toBe("linked");
    expect(result.data[0]?.lead).toMatchObject({ firstName: "Anna", lastName: "B" });
  });

  it("never returns another tenant's appointments (isolation)", async () => {
    const store = new AppointmentStore();
    store.addAppointment({ organizationId: ORG_B, reason: "other-tenant" });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "all" });

    expect(result.data).toHaveLength(0);
    expect(result.counts.all).toBe(0);
  });

  it("restricts to a single day in Europe/Rome when date is given", async () => {
    const store = new AppointmentStore();
    // 2026-06-20 in Europe/Rome (CEST) = [2026-06-19T22:00Z, 2026-06-20T22:00Z).
    store.addAppointment({
      organizationId: ORG_A,
      startAt: new Date("2026-06-20T07:30:00.000Z"), // inside the Rome day
      reason: "in-day",
    });
    store.addAppointment({
      organizationId: ORG_A,
      startAt: new Date("2026-06-20T22:30:00.000Z"), // already the 21st in Rome
      reason: "next-day",
    });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await listAppointments(deps, { filter: "all", date: "2026-06-20" });

    expect(result.data.map((a) => a.reason)).toEqual(["in-day"]);
  });

  it("paginates", async () => {
    const store = new AppointmentStore();
    for (let i = 0; i < 5; i += 1) {
      store.addAppointment({
        organizationId: ORG_A,
        startAt: new Date(`2026-06-1${i}T09:00:00.000Z`),
        reason: `a${i}`,
      });
    }
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const page2 = await listAppointments(deps, { filter: "all", page: 2, pageSize: 2 });

    expect(page2.data).toHaveLength(2);
    expect(page2.total).toBe(5);
    expect(page2.page).toBe(2);
  });
});
