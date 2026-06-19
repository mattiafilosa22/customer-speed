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
 * GET /api/integrations/google/connect — start the Google OAuth2 flow (docs/04
 * §4.9). Pipeline: auth → RBAC (`calendar.integrations`) → feature flag → build
 * a CSRF `state`, set it in an httpOnly cookie, and 302 to Google's consent URL.
 *
 * Gating: 401 (no session), 403 (baseUser), 404 (flag off). If the platform has
 * no Google credentials yet, returns a 503-style JSON ("not configured") instead
 * of redirecting — graceful degradation for the pre-infra state.
 */
export async function GET() {
  try {
    await requireCalendarContext();

    if (!isProviderConfigured(CalendarProviderType.GOOGLE)) {
      throw new ProviderNotConfiguredError(CalendarProviderType.GOOGLE);
    }
    const provider = getProvider(CalendarProviderType.GOOGLE);
    if (!provider) {
      throw new ProviderNotConfiguredError(CalendarProviderType.GOOGLE);
    }

    const state = generateOAuthState();
    const authUrl = provider.getAuthUrl({ state });

    const jar = await cookies();
    jar.set(stateCookieName("google"), state, {
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
