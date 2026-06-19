import { CalendarProviderType } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { CalendarConnectionStore } from "@/server/calendar/connection-store";
import type { CalendarEventInput, CalendarProvider } from "@/server/calendar/provider";
import {
  createExternalEvent,
  deleteExternalEvent,
  updateExternalEvent,
  type PushDeps,
} from "@/server/calendar/sync/push-appointment";

/**
 * Outbound sync orchestrator (docs/08 Fase 6). Reflects a LOCAL appointment
 * change onto the connected provider (Google), WITHOUT modifying the core
 * appointment use cases (they stay untouched + fully tested). The appointment
 * Server Actions call these best-effort hooks AFTER the use case succeeds.
 *
 * Default provider for outbound push = Google (the only bidirectional provider;
 * Calendly is inbound-only). All hooks no-op when:
 *  - Google is not configured, or
 *  - the acting user has no Google connection.
 *
 * Persisting the `externalEventId` is done on the LOCAL appointment via the
 * tenant-scoped client so a later update/delete can target the provider event.
 */

const OUTBOUND_PROVIDER = CalendarProviderType.GOOGLE;
/** Default duration when the local appointment has only a start time. */
const DEFAULT_DURATION_MS = 30 * 60 * 1000;

export interface OutboundDeps {
  /** Null when Google is not configured → all hooks no-op. */
  readonly provider: CalendarProvider | null;
  readonly store: CalendarConnectionStore;
  readonly prisma: TenantPrismaClient;
  readonly userId: string;
}

function toEventInput(startAt: Date, reason: string, attendeeEmail: string | null): CalendarEventInput {
  return {
    title: reason,
    startAt,
    endAt: new Date(startAt.getTime() + DEFAULT_DURATION_MS),
    attendeeEmail,
  };
}

function pushDeps(deps: OutboundDeps, provider: CalendarProvider): PushDeps {
  return {
    provider,
    store: deps.store,
    prisma: deps.prisma,
    providerType: OUTBOUND_PROVIDER,
    userId: deps.userId,
  };
}

/**
 * Read the fields needed to mirror an appointment to a provider, tenant-scoped.
 * Returns null when the appointment is gone (e.g. deleted concurrently).
 */
async function readAppointmentForSync(
  deps: OutboundDeps,
  appointmentId: string,
): Promise<{ startAt: Date; reason: string; provider: CalendarProviderType | null; externalEventId: string | null; attendeeEmail: string | null } | null> {
  const appt = await deps.prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      startAt: true,
      reason: true,
      provider: true,
      externalEventId: true,
      lead: { select: { email: true } },
    },
  });
  if (!appt) return null;
  return {
    startAt: appt.startAt,
    reason: appt.reason,
    provider: appt.provider,
    externalEventId: appt.externalEventId,
    attendeeEmail: appt.lead?.email ?? null,
  };
}

/** Mirror a newly-created local appointment to Google; store its external id. */
export async function pushCreatedAppointment(
  deps: OutboundDeps,
  appointmentId: string,
): Promise<void> {
  if (!deps.provider) return;
  const appt = await readAppointmentForSync(deps, appointmentId);
  if (!appt) return;

  const externalEventId = await createExternalEvent(
    pushDeps(deps, deps.provider),
    toEventInput(appt.startAt, appt.reason, appt.attendeeEmail),
  );
  if (!externalEventId) return;

  await deps.prisma.appointment.update({
    where: { id: appointmentId },
    data: { provider: OUTBOUND_PROVIDER, externalEventId },
    select: { id: true },
  });
}

/** Mirror an updated local appointment to Google (only when already linked). */
export async function pushUpdatedAppointment(
  deps: OutboundDeps,
  appointmentId: string,
): Promise<void> {
  if (!deps.provider) return;
  const appt = await readAppointmentForSync(deps, appointmentId);
  if (!appt || appt.provider !== OUTBOUND_PROVIDER || !appt.externalEventId) return;

  await updateExternalEvent(
    pushDeps(deps, deps.provider),
    appt.externalEventId,
    toEventInput(appt.startAt, appt.reason, appt.attendeeEmail),
  );
}

/**
 * Mirror a deleted local appointment to Google. The appointment is already gone
 * locally, so the caller passes the captured `externalEventId` (null when the
 * appointment was never synced → no-op).
 */
export async function pushDeletedAppointment(
  deps: OutboundDeps,
  externalEventId: string | null,
): Promise<void> {
  if (!deps.provider || !externalEventId) return;
  await deleteExternalEvent(pushDeps(deps, deps.provider), externalEventId);
}
