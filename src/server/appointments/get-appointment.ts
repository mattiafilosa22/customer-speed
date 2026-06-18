import { NotFoundError } from "@/lib/errors";
import type { AppointmentDeps } from "@/server/appointments/deps";
import {
  appointmentListSelect,
  type AppointmentListRow,
} from "@/server/appointments/selectors";

/**
 * Read a single appointment by id (docs/04 §4.5 — implicit GET for the edit
 * form). Tenant-scoped: a cross-tenant / missing id is reported as
 * `NotFoundError` (404, non-revealing — never leaks whether the id exists in
 * another tenant). Same `select` as the list so the edit form has the lead link.
 */
export async function getAppointment(
  deps: AppointmentDeps,
  appointmentId: string,
): Promise<AppointmentListRow> {
  const row = await deps.prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: appointmentListSelect,
  });
  if (!row) {
    throw new NotFoundError("Appointment not found");
  }
  return row;
}
