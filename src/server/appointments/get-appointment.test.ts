import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/errors";
import { getAppointment } from "@/server/appointments/get-appointment";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("getAppointment", () => {
  it("returns a tenant appointment with its linked lead (happy path)", async () => {
    const store = new AppointmentStore();
    const lead = store.addLead({ organizationId: ORG_A, firstName: "Mario", lastName: "R" });
    const appt = store.addAppointment({
      organizationId: ORG_A,
      leadId: lead.id,
      reason: "Consulenza",
    });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const row = await getAppointment(deps, appt.id);

    expect(row.id).toBe(appt.id);
    expect(row.reason).toBe("Consulenza");
    expect(row.lead).toMatchObject({ firstName: "Mario", lastName: "R" });
  });

  it("rejects a cross-tenant appointment as NotFound (isolation)", async () => {
    const store = new AppointmentStore();
    const apptB = store.addAppointment({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(getAppointment(deps, apptB.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a missing id as NotFound", async () => {
    const store = new AppointmentStore();
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(getAppointment(deps, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });
});
