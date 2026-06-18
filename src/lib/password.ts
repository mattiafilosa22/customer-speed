import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id variant id as defined by `@node-rs/argon2`'s `Algorithm` enum
 * (`Argon2d=0`, `Argon2i=1`, `Argon2id=2`). We reference the numeric value
 * directly because `Algorithm` is a const enum and `verbatimModuleSyntax`
 * forbids importing const enums as values.
 */
const ARGON2ID = 2;

/**
 * Password hashing — Argon2id.
 *
 * Library: `@node-rs/argon2` (napi-rs). Chosen over the `argon2` (node-gyp)
 * package because it ships **prebuilt native binaries** for the major platforms,
 * so it installs and builds reliably under pnpm + Next 16 without a local C++
 * toolchain / node-gyp compile step. The API exposes Argon2id directly.
 *
 * Layering: infrastructure (`lib/`). The auth use cases depend on the
 * `PasswordHasher` port below, not on this module directly, so the algorithm can
 * be swapped (Dependency Inversion) and faked in tests for speed.
 *
 * Parameters follow OWASP guidance for Argon2id (memory-hard). `docs/06` requires
 * Argon2id (preferred) and forbids plaintext/reversible storage.
 */

/** OWASP-aligned Argon2id parameters. Tunable centrally. */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  // ~19 MiB memory, 2 iterations, 1 lane. Encoded params are stored in the hash
  // string, so verification stays correct even if these change later.
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Port (abstraction) for password hashing. Use cases depend on this, not on
 * `@node-rs/argon2`. Keeps domain logic free of the concrete crypto library.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plainCandidate: string, storedHash: string): Promise<boolean>;
}

/** Concrete Argon2id implementation of {@link PasswordHasher}. */
export const argon2PasswordHasher: PasswordHasher = {
  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  },
  async verify(plainCandidate: string, storedHash: string): Promise<boolean> {
    // `verify` throws on malformed hash strings; treat any failure as "no match"
    // rather than leaking which case failed.
    try {
      return await verify(storedHash, plainCandidate);
    } catch {
      return false;
    }
  },
};
