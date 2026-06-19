import { describe, expect, it } from "vitest";

import { AppointmentStatus } from "@/generated/prisma/enums";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createAppointment } from "@/server/appointments/create-appointment";
import { AppointmentStore, buildFakeAppointmentDeps } from "@/server/appointments/test-helpers";

const ORG_A = "org_a";
const ORG_B = "org_b";
const USER_A = "user_a";

const validInput = (overrides: Record<string, unknown> = {}) => ({
  startAt: "2026-06-20T10:30",
  reason: "Call conoscitiva",
  ...overrides,
});

describe("createAppointment", () => {
  it("creates a PENDING appointment stamped with the actor (happy path)", async () => {
    const store = new AppointmentStore();
    const { deps, audits } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    const result = await createAppointment(deps, validInput());

    expect(result.id).toBeTruthy();
    const created = store.appointment(0);
    expect(created.organizationId).toBe(ORG_A);
    expect(created.ownerId).toBe(USER_A);
    expect(created.status).toBe(AppointmentStatus.PENDING);
    expect(created.reason).toBe("Call conoscitiva");
    expect(created.leadId).toBeNull();
    expect(audits.at(-1)?.action).toBe("appointment.create");
  });

  it("links an appointment to a lead of the same tenant", async () => {
    const store = new AppointmentStore();
    const lead = store.addLead({ organizationId: ORG_A });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await createAppointment(deps, validInput({ leadId: lead.id }));

    expect(store.appointment(0).leadId).toBe(lead.id);
  });

  it("rejects a cross-tenant lead as NotFound (isolation)", async () => {
    const store = new AppointmentStore();
    const leadB = store.addLead({ organizationId: ORG_B });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      createAppointment(deps, validInput({ leadId: leadB.id })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.appointments).toHaveLength(0);
  });

  it("rejects a soft-deleted lead as NotFound", async () => {
    const store = new AppointmentStore();
    const deleted = store.addLead({ organizationId: ORG_A, deletedAt: new Date() });
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      createAppointment(deps, validInput({ leadId: deleted.id })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an empty reason and an invalid date (input invalid)", async () => {
    const store = new AppointmentStore();
    const { deps } = buildFakeAppointmentDeps(store, ORG_A, USER_A);

    await expect(
      createAppointment(deps, validInput({ reason: "  " })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createAppointment(deps, validInput({ startAt: "not-a-date" })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.appointments).toHaveLength(0);
  });
});
