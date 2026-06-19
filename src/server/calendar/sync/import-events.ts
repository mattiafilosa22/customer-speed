import { AppointmentStatus, type CalendarProviderType } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import type { AuditLogger } from "@/server/audit/audit-log";
import type { CalendarEvent } from "@/server/calendar/provider";

/**
 * Import normalized provider events into local `Appointment` rows (docs/08 Fase 6
 * "webhook import / sync"). Shared by the Calendly webhook AND the Google pull.
 *
 * Properties (docs/00 §4):
 *  - **Idempotent**: keyed on `(organizationId, provider, externalEventId)` — the
 *    DB has a UNIQUE index there, so a webhook replay updates the same row
 *    instead of duplicating. We upsert via "find then create/update".
 *  - **Tenant-scoped**: the `prisma` is the tenant client AND `organizationId`
 *    comes from the OWNING connection (resolved before this call) — never from
 *    the event payload. Every write carries the tenant id.
 *  - **Lead match by email**: when the event has an attendee email, we link the
 *    appointment to a lead of the SAME tenant with that email (best-effort; an
 *    unmatched event still imports with `leadId = null`).
 *  - **Cancellation**: a canceled upstream event flips the local status to
 *    CANCELED (it is never hard-deleted, preserving history/audit).
 */

export interface ImportEventsInput {
  readonly prisma: TenantPrismaClient;
  readonly audit: AuditLogger;
  readonly organizationId: string;
  readonly provider: CalendarProviderType;
  readonly events: readonly CalendarEvent[];
}

export interface ImportEventsResult {
  readonly created: number;
  readonly updated: number;
  readonly canceled: number;
}

async function findLeadIdByEmail(
  prisma: TenantPrismaClient,
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null;
  // Tenant-scoped read (the client injects organizationId): a same-email lead in
  // another tenant is invisible here, so cross-tenant leakage is impossible.
  const lead = await prisma.lead.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return lead?.id ?? null;
}

export async function importEvents(input: ImportEventsInput): Promise<ImportEventsResult> {
  const { prisma, audit, organizationId, provider, events } = input;
  let created = 0;
  let updated = 0;
  let canceled = 0;

  for (const event of events) {
    const leadId = await findLeadIdByEmail(prisma, event.attendeeEmail);

    // Idempotency lookup: the tenant client scopes by organizationId; we add the
    // provider + externalEventId. (Matches the UNIQUE index.)
    const existing = await prisma.appointment.findFirst({
      where: { provider, externalEventId: event.externalEventId },
      select: { id: true, status: true },
    });

    const status = event.canceled ? AppointmentStatus.CANCELED : AppointmentStatus.PENDING;

    if (existing) {
      await prisma.appointment.update({
        where: { id: existing.id },
        data: {
          startAt: event.startAt,
          reason: event.title,
          status,
          // Re-link if a matching lead now exists; never unlink on null.
          ...(leadId ? { lead: { connect: { id: leadId } } } : {}),
        },
        select: { id: true },
      });
      if (event.canceled) canceled += 1;
      else updated += 1;
      continue;
    }

    await prisma.appointment.create({
      data: {
        organizationId,
        leadId,
        startAt: event.startAt,
        reason: event.title,
        status,
        provider,
        externalEventId: event.externalEventId,
      },
      select: { id: true },
    });
    if (event.canceled) canceled += 1;
    else created += 1;
  }

  if (events.length > 0) {
    await audit.record({
      action: "calendar.import",
      organizationId,
      entity: "Appointment",
      meta: { provider, created, updated, canceled, total: events.length },
    });
  }

  return { created, updated, canceled };
}
