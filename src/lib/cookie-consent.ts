import { z } from "zod";

import { COOKIE_POLICY_VERSION } from "@/server/consent/consent-types";

/**
 * Cookie-consent state stored in a first-party cookie (the "proof of consent"
 * client mirror — the authoritative record is the `Consent` model). Garante
 * requirements (docs/09 §9.3): record the choice + version + timestamp; do NOT
 * re-prompt unless the choice cannot be stored, conditions changed (version bump)
 * or > 180 days have elapsed.
 *
 * The cookie is technical/necessary itself (it stores a preference), so it does
 * not require consent. Necessary cookies are always on; analytics is the single
 * optional category for now.
 */

export const COOKIE_CONSENT_NAME = "cs_cookie_consent";

/** No re-prompt window: 180 days (docs/09 §9.3). */
export const CONSENT_MAX_AGE_DAYS = 180;
export const CONSENT_MAX_AGE_SECONDS = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;

export const cookieConsentSchema = z.object({
  /** Necessary cookies are always granted (kept explicit for the proof record). */
  necessary: z.literal(true),
  analytics: z.boolean(),
  /** Cookie policy version the choice was made against. */
  version: z.string().min(1),
  /** ISO timestamp of the decision. */
  decidedAt: z.string().min(1),
});

export type CookieConsentState = z.infer<typeof cookieConsentSchema>;

/** Parse a raw cookie value; returns null when absent or malformed. */
export function parseCookieConsent(raw: string | undefined): CookieConsentState | null {
  if (!raw) return null;
  try {
    const parsed = cookieConsentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Decide whether the banner must be shown: no stored choice, an outdated cookie
 * policy version, or a decision older than the re-prompt window.
 */
export function shouldShowBanner(
  state: CookieConsentState | null,
  now: Date = new Date(),
): boolean {
  if (!state) return true;
  if (state.version !== COOKIE_POLICY_VERSION) return true;
  const decided = new Date(state.decidedAt).getTime();
  if (Number.isNaN(decided)) return true;
  const ageMs = now.getTime() - decided;
  return ageMs > CONSENT_MAX_AGE_SECONDS * 1000;
}
