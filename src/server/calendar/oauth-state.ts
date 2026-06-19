import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth `state` CSRF protection for the connect → callback redirect (docs/06
 * §6.4).
 *
 * The connect handler generates a random opaque token, sets it in an httpOnly,
 * SameSite=Lax, short-lived cookie, and passes the SAME value as the OAuth
 * `state`. The callback compares the `state` query param against the cookie in
 * constant time and clears the cookie. A mismatch/missing value → reject, so a
 * forged callback cannot bind another user's Google account to the session.
 */

export const OAUTH_STATE_COOKIE_PREFIX = "cs_oauth_state_";
/** State cookie lifetime: the consent round-trip is short. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time string comparison (timing-safe). Returns false on length mismatch. */
export function verifyOAuthState(
  fromQuery: string | null | undefined,
  fromCookie: string | null | undefined,
): boolean {
  if (!fromQuery || !fromCookie) return false;
  const a = Buffer.from(fromQuery);
  const b = Buffer.from(fromCookie);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Per-provider state cookie name so concurrent connects don't clash. */
export function stateCookieName(provider: string): string {
  return `${OAUTH_STATE_COOKIE_PREFIX}${provider.toLowerCase()}`;
}
