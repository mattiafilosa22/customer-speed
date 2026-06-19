import { NextResponse, type NextRequest } from "next/server";

import { CalendarProviderType } from "@/generated/prisma/enums";
import {
  ProviderNotConfiguredError,
  WebhookVerificationError,
} from "@/server/calendar/provider";
import { getProvider } from "@/server/calendar/registry";
import { buildAudit, buildWebhookConnectionStore } from "@/server/calendar/context-deps";
import { handleVerifiedWebhook } from "@/server/calendar/webhook-import";

/**
 * POST /api/webhooks/calendly — import Calendly `invitee.created` /
 * `invitee.canceled` events (docs/04 §4.9, docs/06 §6.4).
 *
 * This endpoint is NOT authenticated (Calendly calls it server-to-server), so
 * its trust comes entirely from the HMAC SIGNATURE:
 *  1. read the RAW body (signature is computed over the exact bytes);
 *  2. `provider.parseWebhook` verifies `Calendly-Webhook-Signature` and throws
 *     {@link WebhookVerificationError} (→ 401) on a missing/invalid signature;
 *  3. the tenant is resolved from the OWNING connection (by `providerAccountId`),
 *     NEVER from the payload — an event for an unknown account is ignored;
 *  4. import is idempotent on `(organizationId, provider, externalEventId)`, so
 *     replays update the same appointment instead of duplicating.
 *
 * No feature-flag/RBAC gate here: there is no session. Isolation is enforced by
 * the connection lookup + the tenant-scoped client downstream. If the platform
 * has no Calendly credentials (signing key absent) we cannot verify, so we
 * return 503 rather than trusting an unverifiable body.
 */
export async function POST(request: NextRequest) {
  const provider = getProvider(CalendarProviderType.CALENDLY);
  if (!provider || !provider.parseWebhook) {
    // No signing key configured → we cannot trust any body. Refuse safely.
    return NextResponse.json(
      { error: { code: "provider_not_configured", message: "Calendly not configured" } },
      { status: 503 },
    );
  }

  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Throws WebhookVerificationError (401) on a bad/missing signature.
    const parsed = provider.parseWebhook({ rawBody, headers });

    await handleVerifiedWebhook(
      { provider, store: buildWebhookConnectionStore(), audit: buildAudit() },
      parsed,
      CalendarProviderType.CALENDLY,
    );

    // Always 200 with a CONSTANT body for a verified webhook (even if
    // unattributed/ignored): Calendly should not retry a structurally-fine
    // webhook we deliberately skipped, and we avoid echoing whether the account
    // is known here (no existence oracle).
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return NextResponse.json(
        { error: { code: "invalid_signature", message: "Invalid signature" } },
        { status: 401 },
      );
    }
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { error: { code: "provider_not_configured", message: error.message } },
        { status: 503 },
      );
    }
    console.error("[webhook:calendly] unexpected error", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal error" } },
      { status: 500 },
    );
  }
}
