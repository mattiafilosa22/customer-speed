import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter } from "@/lib/rate-limit";

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
