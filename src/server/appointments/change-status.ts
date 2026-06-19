import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import { changeAppointmentStatusSchema } from "@/server/appointments/schemas";

/**
 * Change an appointment's status (docs/02 §2.6 "✓ Fatto"; docs/04 §4.5 PATCH).
 * The three statuses (PENDING / DONE / CANCELED) form an open transition: any
 * status may move to any other (an operator can re-open a "Fatto", cancel, etc.).
 *
 * Tenant isolation: the appointment is read via the scoped client first (a
 * cross-tenant / missing id → `NotFoundError`/404, non-revealing); the update is
 * itself tenant-scoped. Returns the linked `leadId` for revalidation + audit.
 */
export interface ChangeAppointmentStatusResult {
  readonly id: string;
  readonly leadId: string | null;
}

export async function changeAppointmentStatus(
  deps: AppointmentDeps,
  appointmentId: string,
  input: unknown,
): Promise<ChangeAppointmentStatusResult> {
  const { status } = parseInput(changeAppointmentStatusSchema, input);

  const existing = await deps.prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, leadId: true },
  });
  if (!existing) {
    throw new NotFoundError("Appointment not found");
  }

  await deps.prisma.appointment.update({
    where: { id: appointmentId },
    data: { status },
    select: { id: true },
  });

  await deps.audit.record({
    action: "appointment.changeStatus",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Appointment",
    entityId: appointmentId,
    meta: { status, leadId: existing.leadId },
  });

  return { id: appointmentId, leadId: existing.leadId };
}
