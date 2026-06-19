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
 * GET /api/integrations/google/callback — finish the Google OAuth2 flow (docs/04
 * §4.9).
 *
 * Steps:
 *  1. auth → RBAC → feature flag (same guard as connect);
 *  2. CSRF: compare the `state` query param to the httpOnly cookie (constant
 *     time) and clear the cookie — a forged callback is rejected;
 *  3. exchange the `code` for tokens (via the abstract provider, fake HTTP in
 *     tests);
 *  4. resolve the stable account id (OIDC `sub`) for secure webhook mapping;
 *  5. persist a `CalendarConnection` with tokens ENCRYPTED at rest;
 *  6. redirect back to the settings/integrations page with a status flag.
 *
 * Tokens are never logged and never returned to the client.
 */
export async function GET(request: NextRequest) {
  const settingsUrl = (status: string) =>
    new URL(`/settings/integrations?status=${status}`, env.APP_URL);

  try {
    const ctx = await requireCalendarContext();

    const url = request.nextUrl;
    const error = url.searchParams.get("error");
    if (error) {
      // User denied consent (or Google returned an error). Bounce back cleanly.
      return NextResponse.redirect(settingsUrl("denied"));
    }

    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");

    const jar = await cookies();
    const cookieName = stateCookieName("google");
    const cookieState = jar.get(cookieName)?.value ?? null;
    jar.delete(cookieName);

    if (!code || !verifyOAuthState(stateParam, cookieState)) {
      return NextResponse.redirect(settingsUrl("invalid_state"));
    }

    if (!isProviderConfigured(CalendarProviderType.GOOGLE)) {
      throw new ProviderNotConfiguredError(CalendarProviderType.GOOGLE);
    }
    const provider = getProvider(CalendarProviderType.GOOGLE);
    if (!provider) {
      throw new ProviderNotConfiguredError(CalendarProviderType.GOOGLE);
    }

    const tokens = await provider.exchangeCode(code);
    const providerAccountId = provider.getAccountId
      ? await provider.getAccountId(tokens)
      : null;

    const store = buildConnectionStore(ctx);
    const saved = await store.save({
      userId: ctx.userId,
      provider: CalendarProviderType.GOOGLE,
      tokens,
      providerAccountId,
    });

    await buildAudit().record({
      action: "calendar.connect",
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      entity: "CalendarConnection",
      entityId: saved.id,
      meta: { provider: CalendarProviderType.GOOGLE },
    });

    return NextResponse.redirect(settingsUrl("connected"));
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.redirect(settingsUrl("not_configured"));
    }
    return errorResponse(err);
  }
}
