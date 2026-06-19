/**
 * Rate limiting for sensitive auth endpoints (login, register, forgot-password)
 * to contrast brute force / enumeration (`docs/06` §6.1).
 *
 * Dependency inversion: the use cases depend on the `RateLimiter` port, not on a
 * concrete store. The default `InMemoryRateLimiter` is process-local (fine for a
 * single instance / dev); in production swap in a Redis/Upstash-backed
 * implementation of the same port without touching call sites.
 *
 * Fixed-window counter: simple, predictable, good enough for auth throttling.
 */

import { env } from "@/lib/env";

export interface RateLimitResult {
  /** Whether the action is allowed under the limit. */
  readonly allowed: boolean;
  /** Remaining attempts in the current window. */
  readonly remaining: number;
  /** Seconds until the window resets (useful for `Retry-After`). */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  /**
   * Consume one attempt for `key` (e.g. `login:ip:1.2.3.4` or
   * `login:account:org/email`). Returns whether it is allowed.
   */
  consume(key: string): Promise<RateLimitResult>;
  /** Clear the counter for a key (e.g. on successful login). */
  reset(key: string): Promise<void>;
}

export interface RateLimitOptions {
  /** Max attempts allowed within the window. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Process-local fixed-window limiter. Not shared across instances — replace with
 * a distributed store in production.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: RateLimitOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
  }

  async consume(key: string): Promise<RateLimitResult> {
    const current = this.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= current) {
      const resetAt = current + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: this.limit - 1,
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.limit - existing.count,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

/**
 * No-op limiter: ALWAYS allows. Used only when the kill-switch
 * `RATE_LIMIT_DISABLED` is set (test/e2e), so the suite can drive the login
 * form repeatedly without tripping the per-IP limit. The env layer forbids the
 * switch in production (`parseEnv` refinement), so this can never weaken prod.
 */
export class NoopRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimitResult> {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
  }
  async reset(): Promise<void> {
    /* nothing to clear */
  }
}

/** Default tuning for auth flows: 5 attempts / 15 minutes. */
export const AUTH_RATE_LIMIT: RateLimitOptions = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

/** Backend selector — mirrors `RATE_LIMIT_BACKEND` in env. */
export type RateLimitBackend = "memory" | "redis";

export interface RateLimiterConfig {
  /** Hard kill-switch: when true, returns a {@link NoopRateLimiter}. */
  readonly disabled: boolean;
  /** Which concrete store to use when not disabled. */
  readonly backend: RateLimitBackend;
  /** Window/limit tuning for the limiter. */
  readonly options: RateLimitOptions;
  /**
   * Optional sink for diagnostics (e.g. "redis selected but not implemented").
   * Defaults to `console.warn`; injectable so tests can assert without noise.
   */
  readonly warn?: (message: string) => void;
}

/**
 * Build a {@link RateLimiter} from configuration (Dependency Inversion: call
 * sites depend on the `RateLimiter` port, this factory owns backend selection).
 *
 *  - `disabled` → {@link NoopRateLimiter} (test/e2e only; forbidden in prod by env).
 *  - `backend: "memory"` → {@link InMemoryRateLimiter} (default, process-local).
 *  - `backend: "redis"` → reserved for a distributed store. The adapter is NOT
 *    implemented yet, so this currently WARNS and falls back to in-memory rather
 *    than failing the boot — the swap is a drop-in once the adapter exists.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  if (config.disabled) {
    return new NoopRateLimiter();
  }
  if (config.backend === "redis") {
    const warn = config.warn ?? ((m: string) => console.warn(m));
    warn(
      "[rate-limit] RATE_LIMIT_BACKEND=redis selected but no Redis adapter is " +
        "wired yet; falling back to in-memory (NOT shared across instances). " +
        "Implement a RateLimiter over Upstash/Redis to enable distributed limits.",
    );
    return new InMemoryRateLimiter(config.options);
  }
  return new InMemoryRateLimiter(config.options);
}

/**
 * Shared default limiter for auth flows, configured from validated env.
 *
 * It reads `env` once at module load. Under `NODE_ENV=test` the env shape sets
 * `RATE_LIMIT_DISABLED=true`, so unit tests get a no-op limiter; e2e and
 * dev/prod read the real flag. Use cases receive THIS via `buildAuthDeps`, never
 * constructing a limiter themselves.
 */
export const authRateLimiter: RateLimiter = createRateLimiter({
  disabled: env.RATE_LIMIT_DISABLED,
  backend: env.RATE_LIMIT_BACKEND,
  options: AUTH_RATE_LIMIT,
});
