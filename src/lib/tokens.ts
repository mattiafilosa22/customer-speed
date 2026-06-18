import { createHash, randomBytes } from "node:crypto";

/**
 * One-time token helpers for email verification & password reset.
 *
 * Security model (docs/06 §6.1):
 *  - The RAW token is sent to the user via email (in a link).
 *  - Only the SHA-256 HASH of the token is stored at rest, so a DB leak does not
 *    expose usable tokens. SHA-256 (not Argon2) is appropriate here because the
 *    token is high-entropy random (256 bits) — not a low-entropy password — so a
 *    fast hash is fine and lookups stay O(1) by `tokenHash`.
 *  - Tokens are single-use (consumed) and time-limited (handled by callers).
 */

/** Cryptographically-strong, URL-safe random token (32 bytes → 256 bits). */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic SHA-256 hash of a raw token, hex-encoded, for DB storage/lookup. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Default time-to-live for email verification tokens: 24 hours. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Default time-to-live for password reset tokens: 1 hour. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
