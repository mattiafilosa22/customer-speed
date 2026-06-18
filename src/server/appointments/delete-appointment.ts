import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import { appointmentIdSchema } from "@/server/appointments/schemas";

/**
 * Delete an appointment (docs/04 §4.5 DELETE /appointments/:id). Hard delete:
 * appointments have no soft-delete column and are recreatable; removing a
 * mistaken one must actually drop it.
 *
 * Tenant isolation: a scoped read verifies the appointment belongs to the tenant
 * first (a cross-tenant / missing id → 404, non-revealing) and yields the
 * `leadId` for revalidation + audit; the delete is then tenant-scoped.
 */
export interface DeleteAppointmentResult {
  readonly id: string;
  readonly leadId: string | null;
}

export async function deleteAppointment(
  deps: AppointmentDeps,
  input: unknown,
): Promise<DeleteAppointmentResult> {
  const { id } = parseInput(appointmentIdSchema, input);

  const existing = await deps.prisma.appointment.findUnique({
    where: { id },
    select: { id: true, leadId: true },
  });
  if (!existing) {
    throw new NotFoundError("Appointment not found");
  }

  await deps.prisma.appointment.delete({ where: { id } });

  await deps.audit.record({
    action: "appointment.delete",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Appointment",
    entityId: id,
    meta: { leadId: existing.leadId },
  });

  return { id, leadId: existing.leadId };
}
