import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Authenticated at-rest encryption for third-party secrets (docs/06 §6.4).
 *
 * Used to protect `CalendarConnection.accessToken/refreshToken` so a DB dump
 * never leaks usable OAuth credentials. Algorithm: **AES-256-GCM** — confidential
 * AND tamper-evident (the GCM auth tag is verified on decrypt, so a flipped byte
 * fails loudly instead of yielding garbage).
 *
 * Design (SOLID/DIP): the cipher is exposed behind the small {@link TokenCipher}
 * port so use cases depend on the interface, not on `node:crypto`. The default
 * factory `getTokenCipher()` reads the key from validated `env`. Tests inject a
 * cipher built from a fixed key via {@link createTokenCipher}.
 *
 * Wire format (single self-describing string, safe to store in a `Text` column):
 *   v1.<iv_b64>.<authTag_b64>.<ciphertext_b64>
 * The version prefix lets us rotate algorithm/key derivation later without
 * ambiguity. IV is random PER record (never reused with the same key).
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const AUTH_TAG_BYTES = 16;
const VERSION = "v1";

export interface TokenCipher {
  /** Encrypt a UTF-8 plaintext into the self-describing wire format. */
  encrypt(plaintext: string): string;
  /** Decrypt a wire-format string; throws on tamper / wrong key / bad format. */
  decrypt(payload: string): string;
}

/** Thrown when a ciphertext is malformed, truncated, or fails authentication. */
export class TokenDecryptionError extends Error {
  constructor(message = "Failed to decrypt token") {
    super(message);
    this.name = "TokenDecryptionError";
  }
}

/** Thrown at startup/first use when `ENCRYPTION_KEY` is missing or wrong-sized. */
export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

/**
 * Decode the configured key (base64 preferred, hex accepted) and assert it is
 * exactly 32 bytes. Fail-fast with a readable error — a short/garbage key must
 * never silently weaken the cipher.
 */
export function decodeEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();

  // Try hex first only when it looks like clean hex of the right length, else
  // base64. This avoids base64 accidentally decoding a hex string.
  const looksHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2;
  const key = looksHex
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");

  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }
  return key;
}

/**
 * Build a {@link TokenCipher} from a raw key string. Pure factory (no env
 * access) so tests can pin a deterministic key.
 */
export function createTokenCipher(rawKey: string): TokenCipher {
  const key = decodeEncryptionKey(rawKey);

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [
        VERSION,
        iv.toString("base64"),
        authTag.toString("base64"),
        ciphertext.toString("base64"),
      ].join(".");
    },

    decrypt(payload: string): string {
      const parts = payload.split(".");
      if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new TokenDecryptionError("Unrecognized ciphertext format");
      }
      // `parts.length === 4` is asserted above; the `?? ""` keeps TS happy under
      // `noUncheckedIndexedAccess` (an empty segment fails the length checks below).
      const iv = Buffer.from(parts[1] ?? "", "base64");
      const authTag = Buffer.from(parts[2] ?? "", "base64");
      const ciphertext = Buffer.from(parts[3] ?? "", "base64");

      if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
        throw new TokenDecryptionError("Malformed IV or auth tag");
      }

      try {
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString("utf8");
      } catch {
        // GCM auth failure (tamper / wrong key) → final() throws. Never leak the
        // underlying error detail.
        throw new TokenDecryptionError();
      }
    },
  };
}

/**
 * Process-wide cipher built from `env.ENCRYPTION_KEY`. Memoized so the key is
 * decoded/validated once. Throws {@link EncryptionKeyError} when the key is
 * absent — call sites that reach here are already gated by the feature flag, so
 * a missing key means "integration enabled but not configured" and must fail
 * explicitly rather than store plaintext.
 */
let cached: TokenCipher | null = null;

export function getTokenCipher(): TokenCipher {
  if (cached) return cached;
  if (!env.ENCRYPTION_KEY) {
    throw new EncryptionKeyError(
      "ENCRYPTION_KEY is not configured. Calendar integrations require it to " +
        "encrypt third-party tokens at rest (docs/06 §6.4).",
    );
  }
  cached = createTokenCipher(env.ENCRYPTION_KEY);
  return cached;
}

/** True when an encryption key is configured (used to gate the UI gracefully). */
export function isEncryptionConfigured(): boolean {
  return Boolean(env.ENCRYPTION_KEY);
}
