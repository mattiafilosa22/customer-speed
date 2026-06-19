import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { CalendarProviderType } from "@/generated/prisma/enums";
import { errorResponse } from "@/server/api/respond";
import { ProviderNotConfiguredError } from "@/server/calendar/provider";
import { getProvider } from "@/server/calendar/registry";
import { isProviderConfigured } from "@/server/calendar/config";
import {
  generateOAuthState,
  OAUTH_STATE_MAX_AGE_SECONDS,
  stateCookieName,
} from "@/server/calendar/oauth-state";
import { requireCalendarContext } from "@/server/calendar/route-guard";

/**
 * GET /api/integrations/calendly/connect — start the Calendly OAuth2 flow.
 *
 * docs/04 §4.9 lists this as POST, but an OAuth authorization start must be a
 * navigable redirect (the browser follows it to the consent screen), so it is
 * implemented as GET — same shape as Google's connect (DEVIATION noted in the
 * task report). CSRF `state` is set in an httpOnly cookie and echoed as `state`.
 *
 * Gating: auth → RBAC (`calendar.integrations`) → feature flag. Returns a 503
 * "not configured" JSON when Calendly credentials are absent (graceful
 * degradation pre-infra).
 */
export async function GET() {
  try {
    await requireCalendarContext();

    if (!isProviderConfigured(CalendarProviderType.CALENDLY)) {
      throw new ProviderNotConfiguredError(CalendarProviderType.CALENDLY);
    }
    const provider = getProvider(CalendarProviderType.CALENDLY);
    if (!provider) {
      throw new ProviderNotConfiguredError(CalendarProviderType.CALENDLY);
    }

    const state = generateOAuthState();
    const authUrl = provider.getAuthUrl({ state });

    const jar = await cookies();
    jar.set(stateCookieName("calendly"), state, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        { error: { code: "provider_not_configured", message: error.message } },
        { status: 503 },
      );
    }
    return errorResponse(error);
  }
}
