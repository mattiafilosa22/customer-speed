import { describe, expect, it, vi } from "vitest";

import {
  AUTH_RATE_LIMIT,
  createRateLimiter,
  InMemoryRateLimiter,
  NoopRateLimiter,
} from "@/lib/rate-limit";

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit then blocks", async () => {
    const rl = new InMemoryRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(true);
    const blocked = await rl.consume("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates keys", async () => {
    const rl = new InMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect((await rl.consume("a")).allowed).toBe(true);
    expect((await rl.consume("a")).allowed).toBe(false);
    expect((await rl.consume("b")).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    let t = 0;
    const rl = new InMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(false);
    t = 1001;
    expect((await rl.consume("k")).allowed).toBe(true);
  });

  it("reset() clears a key immediately", async () => {
    const rl = new InMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    await rl.consume("k");
    expect((await rl.consume("k")).allowed).toBe(false);
    await rl.reset("k");
    expect((await rl.consume("k")).allowed).toBe(true);
  });
});

describe("NoopRateLimiter", () => {
  it("always allows, regardless of how many attempts", async () => {
    const rl = new NoopRateLimiter();
    for (let i = 0; i < 100; i += 1) {
      expect((await rl.consume()).allowed).toBe(true);
    }
    await expect(rl.reset()).resolves.toBeUndefined();
  });
});

describe("createRateLimiter", () => {
  it("returns a no-op limiter when disabled (test/e2e kill-switch)", async () => {
    const rl = createRateLimiter({
      disabled: true,
      backend: "memory",
      options: { limit: 1, windowMs: 1000 },
    });
    expect(rl).toBeInstanceOf(NoopRateLimiter);
    // Active-mode behaviour for contrast: a memory limiter WOULD block.
    expect((await rl.consume("x")).allowed).toBe(true);
    expect((await rl.consume("x")).allowed).toBe(true);
  });

  it("returns an active in-memory limiter by default (prod-mode)", async () => {
    const rl = createRateLimiter({
      disabled: false,
      backend: "memory",
      options: { limit: 1, windowMs: 1000, now: () => 0 },
    });
    expect(rl).toBeInstanceOf(InMemoryRateLimiter);
    expect((await rl.consume("x")).allowed).toBe(true);
    expect((await rl.consume("x")).allowed).toBe(false); // limit reached → blocked
  });

  it("warns and falls back to in-memory when redis backend is selected (not wired)", () => {
    const warn = vi.fn();
    const rl = createRateLimiter({
      disabled: false,
      backend: "redis",
      options: AUTH_RATE_LIMIT,
      warn,
    });
    expect(rl).toBeInstanceOf(InMemoryRateLimiter);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("redis");
  });
});
