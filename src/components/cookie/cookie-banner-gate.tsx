import { cookies } from "next/headers";

import {
  COOKIE_CONSENT_NAME,
  parseCookieConsent,
  shouldShowBanner,
} from "@/lib/cookie-consent";
import { CookieBanner } from "@/components/cookie/cookie-banner";

/**
 * Server gate for the cookie banner: reads the consent cookie and renders the
 * banner ONLY when a (re-)prompt is due — no stored choice, outdated policy
 * version, or older than the 180-day window (docs/09 §9.3). Rendering it
 * server-side avoids a flash of the banner for users who already chose.
 */
export async function CookieBannerGate() {
  const store = await cookies();
  const state = parseCookieConsent(store.get(COOKIE_CONSENT_NAME)?.value);
  if (!shouldShowBanner(state)) {
    return null;
  }
  return <CookieBanner />;
}
