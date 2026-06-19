import { NextResponse, type NextRequest } from "next/server";

import { CalendarProviderType } from "@/generated/prisma/enums";
import { getProvider } from "@/server/calendar/registry";
import { buildAudit, buildWebhookConnectionStore } from "@/server/calendar/context-deps";
import { pullGoogleConnection } from "@/server/calendar/sync/pull-google";
import { getTenantFeatureFlags } from "@/server/tenant/feature-flags";

/**
 * POST /api/webhooks/google — Google Calendar push notification (docs/04 §4.9).
 *
 * Google push notifications carry NO event data; they only signal that a watched
 * resource changed via headers:
 *   - `X-Goog-Channel-ID`     — the channel we created at watch time;
 *   - `X-Goog-Channel-Token`  — an opaque token WE chose at watch time; it maps
 *     the channel to the owning connection. This is the trust anchor (Google
 *     does not sign the body), so we treat the token as the secure identifier of
 *     the connection — NEVER trusting the payload for the tenant.
 *   - `X-Goog-Resource-State` — "sync" (initial) | "exists" | "not_exists".
 *
 * On a real change we resolve the owning connection by the channel token
 * (stored as `providerAccountId` at watch time) and run an incremental pull,
 * which is idempotent on `(organizationId, provider, externalEventId)`.
 *
 * NOTE: registering the watch channel (and persisting the channel token) requires
 * LIVE Google credentials and a public callback URL; that is wired in the infra
 * setup. Until then this handler degrades gracefully: it always returns 200 (so
 * Google does not disable the channel) and no-ops when nothing matches.
 */
export async function POST(request: NextRequest) {
  const provider = getProvider(CalendarProviderType.GOOGLE);
  if (!provider) {
    // Not configured yet — acknowledge so Google does not retry/disable.
    return NextResponse.json({ ok: true, configured: false });
  }

  try {
    const resourceState = request.headers.get("x-goog-resource-state");
    const channelToken = request.headers.get("x-goog-channel-token");

    // The initial "sync" handshake carries no changes.
    if (resourceState === "sync" || !channelToken) {
      return NextResponse.json({ ok: true, handshake: true });
    }

    const store = buildWebhookConnectionStore();
    const connection = await store.getByProviderAccount(
      CalendarProviderType.GOOGLE,
      channelToken,
    );
    if (!connection) {
      // Unknown channel token → nothing to attribute. Acknowledge (no work).
      return NextResponse.json({ ok: true, matched: false });
    }

    // A disabled tenant must not receive imports even from a stale watch channel.
    const flags = await getTenantFeatureFlags(connection.organizationId);
    if (!flags.calendarIntegrations) {
      return NextResponse.json({ ok: true, matched: false });
    }

    const result = await pullGoogleConnection(
      { provider, store, audit: buildAudit() },
      connection,
    );
    return NextResponse.json({ ok: true, matched: true, ...result });
  } catch (error) {
    console.error("[webhook:google] unexpected error", error);
    // Acknowledge with 200 to avoid Google disabling the channel; the error is
    // logged for diagnosis. (A 5xx would cause aggressive retries.)
    return NextResponse.json({ ok: false });
  }
}
