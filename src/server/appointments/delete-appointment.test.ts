import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import { deleteAppointment } from "@/server/appointments/delete-appointment";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

describe("deleteAppointment", () => {
  it("hard-deletes a tenant appointment (happy path)", async () => {
    const store = new AppointmentStore();
    const appt = store.addAppointment({ organizationId: ORG_A });
    const { deps, audits } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await deleteAppointment(deps, { id: appt.id });

    expect(result.id).toBe(appt.id);
    expect(store.appointments).toHaveLength(0);
    expect(audits.at(-1)?.action).toBe("appointment.delete");
  });

  it("rejects a cross-tenant appointment as NotFound (isolation)", async () => {
    const store = new AppointmentStore();
    const apptB = store.addAppointment({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(deleteAppointment(deps, { id: apptB.id })).rejects.toBeInstanceOf(NotFoundError);
    expect(store.appointments).toHaveLength(1);
  });

  it("rejects an empty id (input invalid)", async () => {
    const store = new AppointmentStore();
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(deleteAppointment(deps, { id: "" })).rejects.toBeInstanceOf(ValidationError);
  });
});
