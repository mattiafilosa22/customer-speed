import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { updateAppointment } from "@/server/appointments/update-appointment";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("updateAppointment", () => {
  it("updates start + reason (happy path)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A, reason: "old" });
    const { deps, audits } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await updateAppointment(deps, appt.id, {
      startAt: "2026-07-01T11:00",
      reason: "new",
    });

    expect(store.appointment(0).reason).toBe("new");
    expect(store.appointment(0).startAt.getUTCMonth()).toBe(6); // July
    expect(audits.at(-1)?.action).toBe("appointment.update");
  });

  it("re-links to another tenant lead and reports both leadIds", async () => {
    const store = new AppointmentStore();
    const a = store.addLead({ organizationId: ORG_A, id: "lead_a" });
    const b = store.addLead({ organizationId: ORG_A, id: "lead_b" });
    const appt = store.addAppointment({ organizationId: ORG_A, leadId: a.id });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await updateAppointment(deps, appt.id, { leadId: b.id });

    expect(result.previousLeadId).toBe("lead_a");
    expect(result.nextLeadId).toBe("lead_b");
    expect(store.appointment(0).leadId).toBe("lead_b");
  });

  it("clears the lead link with null", async () => {
    const store = new AppointmentStore();
    const a = store.addLead({ organizationId: ORG_A });
    const appt = store.addAppointment({ organizationId: ORG_A, leadId: a.id });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await updateAppointment(deps, appt.id, { leadId: null });

    expect(result.nextLeadId).toBeNull();
    expect(store.appointment(0).leadId).toBeNull();
  });

  it("rejects linking to a cross-tenant lead (isolation)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A });
    const leadB = store.addLead({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      updateAppointment(deps, appt.id, { leadId: leadB.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects updating a cross-tenant appointment as NotFound", async () => {
    const store = new AppointmentStore();
    const apptB = store.addAppointment({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      updateAppointment(deps, apptB.id, { reason: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an empty patch (input invalid)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(updateAppointment(deps, appt.id, {})).rejects.toBeInstanceOf(ValidationError);
  });
});
