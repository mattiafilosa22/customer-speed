import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { CalendarProviderType } from "@/generated/prisma/enums";
import { errorResponse } from "@/server/api/respond";
import { ProviderNotConfiguredError } from "@/server/calendar/provider";
import { getProvider } from "@/server/calendar/registry";
import { isProviderConfigured } from "@/server/calendar/config";
import { stateCookieName, verifyOAuthState } from "@/server/calendar/oauth-state";
import { requireCalendarContext } from "@/server/calendar/route-guard";
import { buildAudit, buildConnectionStore } from "@/server/calendar/context-deps";

/**
 * GET /api/integrations/calendly/callback — finish the Calendly OAuth2 flow.
 * Mirrors the Google callback: CSRF state check → code exchange → persist the
 * connection with ENCRYPTED tokens + the owner URI as `providerAccountId` (used
 * to map inbound webhooks to this connection/tenant securely). Tokens are never
 * logged/returned.
 */
export async function GET(request: NextRequest) {
  const settingsUrl = (status: string) =>
    new URL(`/settings/integrations?status=${status}`, env.APP_URL);

  try {
    const ctx = await requireCalendarContext();

    const url = request.nextUrl;
    if (url.searchParams.get("error")) {
      return NextResponse.redirect(settingsUrl("denied"));
    }
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");

    const jar = await cookies();
    const cookieName = stateCookieName("calendly");
    const cookieState = jar.get(cookieName)?.value ?? null;
    jar.delete(cookieName);

    if (!code || !verifyOAuthState(stateParam, cookieState)) {
      return NextResponse.redirect(settingsUrl("invalid_state"));
    }

    if (!isProviderConfigured(CalendarProviderType.CALENDLY)) {
      throw new ProviderNotConfiguredError(CalendarProviderType.CALENDLY);
    }
    const provider = getProvider(CalendarProviderType.CALENDLY);
    if (!provider) {
      throw new ProviderNotConfiguredError(CalendarProviderType.CALENDLY);
    }

    const tokens = await provider.exchangeCode(code);
    const providerAccountId = provider.getAccountId
      ? await provider.getAccountId(tokens)
      : (tokens.accountId ?? null);

    const store = buildConnectionStore(ctx);
    const saved = await store.save({
      userId: ctx.userId,
      provider: CalendarProviderType.CALENDLY,
      tokens,
      providerAccountId,
    });

    await buildAudit().record({
      action: "calendar.connect",
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      entity: "CalendarConnection",
      entityId: saved.id,
      meta: { provider: CalendarProviderType.CALENDLY },
    });

    return NextResponse.redirect(settingsUrl("connected"));
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.redirect(settingsUrl("not_configured"));
    }
    return errorResponse(err);
  }
}
