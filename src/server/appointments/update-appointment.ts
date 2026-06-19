import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import { assertLeadInTenant } from "@/server/appointments/lead-link";
import { updateAppointmentSchema } from "@/server/appointments/schemas";

/**
 * Update an appointment's start/reason/lead link (docs/04 §4.5 PATCH
 * /appointments/:id). Status is changed by its own use case.
 *
 * Tenant isolation: the appointment is read via the scoped client (a
 * cross-tenant / missing id → `NotFoundError`/404). A new `leadId` is then
 * verified to belong to the tenant; `leadId: null` clears the link. We return the
 * previous and next `leadId` so the action can revalidate BOTH lead detail pages.
 */
export interface UpdateAppointmentResult {
  readonly id: string;
  readonly previousLeadId: string | null;
  readonly nextLeadId: string | null;
}

export async function updateAppointment(
  deps: AppointmentDeps,
  appointmentId: string,
  input: unknown,
): Promise<UpdateAppointmentResult> {
  const data = parseInput(updateAppointmentSchema, input);

  const existing = await deps.prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, leadId: true },
  });
  if (!existing) {
    throw new NotFoundError("Appointment not found");
  }

  const patch: Prisma.AppointmentUpdateInput = {};
  if (data.startAt !== undefined) patch.startAt = data.startAt;
  if (data.reason !== undefined) patch.reason = data.reason;

  let nextLeadId = existing.leadId;
  if ("leadId" in data) {
    // `null` clears the link; a non-empty id must belong to the tenant.
    await assertLeadInTenant(deps, data.leadId);
    nextLeadId = data.leadId ?? null;
    patch.lead = data.leadId
      ? { connect: { id: data.leadId } }
      : { disconnect: true };
  }

  await deps.prisma.appointment.update({
    where: { id: appointmentId },
    data: patch,
    select: { id: true },
  });

  await deps.audit.record({
    action: "appointment.update",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Appointment",
    entityId: appointmentId,
    meta: { leadId: nextLeadId },
  });

  return { id: appointmentId, previousLeadId: existing.leadId, nextLeadId };
}
