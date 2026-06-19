import { describe, expect, it } from "vitest";

import { AppointmentStatus } from "@/generated/prisma/enums";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { changeAppointmentStatus } from "@/server/appointments/change-status";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("changeAppointmentStatus", () => {
  it("marks a PENDING appointment as DONE (happy path)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A, status: AppointmentStatus.PENDING });
    const { deps, audits } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await changeAppointmentStatus(deps, appt.id, { status: "DONE" });

    expect(result.id).toBe(appt.id);
    expect(store.appointment(0).status).toBe(AppointmentStatus.DONE);
    expect(audits.at(-1)?.action).toBe("appointment.changeStatus");
  });

  it("supports CANCELED and re-opening to PENDING", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A, status: AppointmentStatus.DONE });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await changeAppointmentStatus(deps, appt.id, { status: "CANCELED" });
    expect(store.appointment(0).status).toBe(AppointmentStatus.CANCELED);

    await changeAppointmentStatus(deps, appt.id, { status: "PENDING" });
    expect(store.appointment(0).status).toBe(AppointmentStatus.PENDING);
  });

  it("returns the linked leadId for revalidation", async () => {
    const store = new AppointmentStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const appt = store.addAppointment({ organizationId: ORG_A, leadId: lead.id });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await changeAppointmentStatus(deps, appt.id, { status: "DONE" });

    expect(result.leadId).toBe(lead.id);
  });

  it("rejects a cross-tenant appointment as NotFound (isolation)", async () => {
    const store = new AppointmentStore();
    const apptB = store.addAppointment({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      changeAppointmentStatus(deps, apptB.id, { status: "DONE" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.appointment(0).status).toBe(AppointmentStatus.PENDING);
  });

  it("rejects an invalid status value (input invalid)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      changeAppointmentStatus(deps, appt.id, { status: "WHATEVER" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
