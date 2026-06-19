import { CalendarProviderType } from "@/generated/prisma/enums";
import { errorResponse, jsonResponse } from "@/server/api/respond";
import { requireCalendarContext } from "@/server/calendar/route-guard";
import { buildAudit, buildConnectionStore } from "@/server/calendar/context-deps";

/**
 * POST /api/integrations/calendly/disconnect — remove the current user's
 * Calendly connection. Idempotent, tenant + user scoped. Gated by auth → RBAC
 * (`calendar.integrations`) → feature flag.
 *
 * RESIDUAL (infra setup): the local row is removed but the Calendly webhook
 * subscription is NOT yet deleted upstream (needs the live API). A stale
 * subscription is neutralized defensively: the webhook re-checks the tenant flag
 * and refuses import when no connection matches. Add the subscription teardown
 * here when credentials are provisioned.
 */
export async function POST() {
  try {
    const ctx = await requireCalendarContext();
    const store = buildConnectionStore(ctx);
    await store.remove(ctx.userId, CalendarProviderType.CALENDLY);

    await buildAudit().record({
      action: "calendar.disconnect",
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      entity: "CalendarConnection",
      meta: { provider: CalendarProviderType.CALENDLY },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
