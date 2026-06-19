import { CalendarProviderType } from "@/generated/prisma/enums";
import { errorResponse, jsonResponse } from "@/server/api/respond";
import { requireCalendarContext } from "@/server/calendar/route-guard";
import { buildAudit, buildConnectionStore } from "@/server/calendar/context-deps";

/**
 * POST /api/integrations/google/disconnect — remove the current user's Google
 * connection (docs/04 §4.9). Idempotent (removing a non-existent connection is a
 * no-op). Gated by auth → RBAC (`calendar.integrations`) → feature flag. The
 * delete is tenant + user scoped via the tenant client.
 *
 * RESIDUAL (infra setup): we delete the local row but do NOT yet revoke the
 * upstream OAuth grant or tear down the Google watch channel — those need live
 * credentials + the registered channel id. Until then a stale push channel is
 * neutralized defensively: the webhook re-checks the tenant flag and refuses
 * import for a tenant with no connection. Add a best-effort revoke + channel
 * stop here when credentials are provisioned.
 */
export async function POST() {
  try {
    const ctx = await requireCalendarContext();
    const store = buildConnectionStore(ctx);
    await store.remove(ctx.userId, CalendarProviderType.GOOGLE);

    await buildAudit().record({
      action: "calendar.disconnect",
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      entity: "CalendarConnection",
      meta: { provider: CalendarProviderType.GOOGLE },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
