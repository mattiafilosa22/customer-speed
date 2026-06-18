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

/** Default tuning for auth flows: 5 attempts / 15 minutes. */
export const AUTH_RATE_LIMIT: RateLimitOptions = {
  limit: 5,
  windowMs: 15 * 60 * 1000,
};

/** Shared default limiter for auth flows (process-local). */
export const authRateLimiter: RateLimiter = new InMemoryRateLimiter(AUTH_RATE_LIMIT);
