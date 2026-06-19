import type { CalendarProviderType } from "@/generated/prisma/enums";
import type { TenantPrismaClient } from "@/lib/prisma-tenant";
import { getValidAccessToken } from "@/server/calendar/access-token";
import type { CalendarConnectionStore } from "@/server/calendar/connection-store";
import type { CalendarEventInput, CalendarProvider } from "@/server/calendar/provider";

/**
 * Push a local appointment change to the connected provider (Google) — the
 * "outbound" half of the bidirectional sync (docs/08 Fase 6).
 *
 * Design:
 *  - The provider access token is resolved + refreshed via {@link getValidAccessToken}
 *    (token never leaves memory in plaintext; refresh is re-encrypted at rest).
 *  - `createExternalEvent` returns the `externalEventId` so the caller persists it
 *    on the Appointment (closing the loop for later updates/deletes).
 *  - `updateExternalEvent` / `deleteExternalEvent` operate on a known
 *    `externalEventId`.
 *
 * Conflict handling (kept simple + documented): we use a LAST-WRITE-WINS policy.
 * A local edit overwrites the provider event; an inbound webhook/pull overwrites
 * the local row (see import-events). There is no field-level merge — for a
 * single-user CRM (Fabio is solo) this is sufficient and predictable. A future
 * multi-user tenant could add an `etag`/`updatedAt` compare-and-set; tracked.
 *
 * Provider capability is OPTIONAL on the interface: if a provider cannot push
 * (Calendly), the helpers no-op gracefully — the caller checks the returned id.
 */

export interface PushDeps {
  readonly provider: CalendarProvider;
  readonly store: CalendarConnectionStore;
  readonly prisma: TenantPrismaClient;
  readonly providerType: CalendarProviderType;
  readonly userId: string;
}

/**
 * Create the provider event for an appointment. Returns the external id to
 * persist, or `null` when the user has no connection / the provider cannot push.
 */
export async function createExternalEvent(
  deps: PushDeps,
  input: CalendarEventInput,
): Promise<string | null> {
  if (!deps.provider.createEvent) return null;
  const connection = await deps.store.getForUser(deps.userId, deps.providerType);
  if (!connection) return null;

  const accessToken = await getValidAccessToken(deps.provider, deps.store, connection);
  const { externalEventId } = await deps.provider.createEvent(accessToken, input);
  return externalEventId;
}

/** Update an existing provider event. No-op when there is no connection/push support. */
export async function updateExternalEvent(
  deps: PushDeps,
  externalEventId: string,
  input: CalendarEventInput,
): Promise<void> {
  if (!deps.provider.updateEvent) return;
  const connection = await deps.store.getForUser(deps.userId, deps.providerType);
  if (!connection) return;

  const accessToken = await getValidAccessToken(deps.provider, deps.store, connection);
  await deps.provider.updateEvent(accessToken, externalEventId, input);
}

/** Delete a provider event mirroring a deleted local appointment. */
export async function deleteExternalEvent(
  deps: PushDeps,
  externalEventId: string,
): Promise<void> {
  if (!deps.provider.deleteEvent) return;
  const connection = await deps.store.getForUser(deps.userId, deps.providerType);
  if (!connection) return;

  const accessToken = await getValidAccessToken(deps.provider, deps.store, connection);
  await deps.provider.deleteEvent(accessToken, externalEventId);
}
