import { AppointmentStatus } from "@/generated/prisma/enums";
import { parseInput } from "@/server/validation";
import type { AppointmentDeps } from "@/server/appointments/deps";
import { assertLeadInTenant } from "@/server/appointments/lead-link";
import { createAppointmentSchema } from "@/server/appointments/schemas";

/**
 * Create an appointment for the tenant (docs/02 §2.6, docs/04 §4.5 POST
 * /appointments). New appointments start `PENDING` ("Da fare").
 *
 * Invariants:
 *  1. **Lead ownership** — an optional `leadId` is verified to belong to the
 *     tenant via the scoped client (cross-tenant id → `NotFoundError`/404).
 *  2. **Owner stamping** — `ownerId` is set from the SERVER actor, never input.
 *  3. **Tenant isolation** — `organizationId` is injected by the tenant client on
 *     the create; we also pass it explicitly so the static type is satisfied.
 *
 * `provider` / `externalEventId` are left null: calendar sync is Fase 6 and
 * disabled for Fabio (`calendarIntegrations:false`).
 */
export interface CreateAppointmentResult {
  readonly id: string;
}

export async function createAppointment(
  deps: AppointmentDeps,
  input: unknown,
): Promise<CreateAppointmentResult> {
  const data = parseInput(createAppointmentSchema, input);

  await assertLeadInTenant(deps, data.leadId);

  const created = await deps.prisma.appointment.create({
    data: {
      organizationId: deps.actor.organizationId,
      ownerId: deps.actor.userId,
      leadId: data.leadId ?? null,
      startAt: data.startAt,
      reason: data.reason,
      status: AppointmentStatus.PENDING,
    },
    select: { id: true },
  });

  await deps.audit.record({
    action: "appointment.create",
    organizationId: deps.actor.organizationId,
    actorId: deps.actor.userId,
    entity: "Appointment",
    entityId: created.id,
    meta: { leadId: data.leadId ?? null },
  });

  return { id: created.id };
}
