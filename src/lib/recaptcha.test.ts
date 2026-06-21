import { describe, expect, it, vi } from "vitest";

import { isRecaptchaAccepted, verifyRecaptcha, verifyRecaptchaV2 } from "@/lib/recaptcha";

const silentLogger = { warn: vi.fn(), error: vi.fn() };

function fakeFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("verifyRecaptcha", () => {
  it("skips (no-op) when no secret key is configured", async () => {
    const result = await verifyRecaptcha("token", { secretKey: undefined, logger: silentLogger });
    expect(result.outcome).toBe("skipped");
  });

  it("fails when a token is missing but a key is configured", async () => {
    const result = await verifyRecaptcha(undefined, { secretKey: "sk", logger: silentLogger });
    expect(result.outcome).toBe("failed");
  });

  it("returns ok for a successful high-score response", async () => {
    const result = await verifyRecaptcha("token", {
      secretKey: "sk",
      minScore: 0.5,
      fetchImpl: fakeFetch({ success: true, score: 0.9 }),
      logger: silentLogger,
    });
    expect(result.outcome).toBe("ok");
    expect(result.score).toBe(0.9);
  });

  it("returns low-score below the threshold (fallback v2)", async () => {
    const result = await verifyRecaptcha("token", {
      secretKey: "sk",
      minScore: 0.5,
      fetchImpl: fakeFetch({ success: true, score: 0.2 }),
      logger: silentLogger,
    });
    expect(result.outcome).toBe("low-score");
    expect(result.score).toBe(0.2);
  });

  it("returns failed when Google reports failure", async () => {
    const result = await verifyRecaptcha("token", {
      secretKey: "sk",
      fetchImpl: fakeFetch({ success: false, "error-codes": ["invalid-input-response"] }),
      logger: silentLogger,
    });
    expect(result.outcome).toBe("failed");
  });

  it("returns failed when the request throws", async () => {
    const throwingFetch = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const result = await verifyRecaptcha("token", {
      secretKey: "sk",
      fetchImpl: throwingFetch,
      logger: silentLogger,
    });
    expect(result.outcome).toBe("failed");
  });
});

describe("verifyRecaptchaV2", () => {
  it("skips (no-op) when no v2 secret key is configured", async () => {
    const result = await verifyRecaptchaV2("token", {
      secretKey: undefined,
      logger: silentLogger,
    });
    expect(result.outcome).toBe("skipped");
  });

  it("fails when the token is missing but a v2 key is configured", async () => {
    const result = await verifyRecaptchaV2(undefined, { secretKey: "sk2", logger: silentLogger });
    expect(result.outcome).toBe("failed");
  });

  it("returns ok for a successful v2 response (no score)", async () => {
    const result = await verifyRecaptchaV2("token", {
      secretKey: "sk2",
      fetchImpl: fakeFetch({ success: true }),
      logger: silentLogger,
    });
    expect(result.outcome).toBe("ok");
  });

  it("returns failed when Google reports success:false", async () => {
    const result = await verifyRecaptchaV2("token", {
      secretKey: "sk2",
      fetchImpl: fakeFetch({ success: false, "error-codes": ["invalid-input-response"] }),
      logger: silentLogger,
    });
    expect(result.outcome).toBe("failed");
  });

  it("returns failed when the request throws (network error)", async () => {
    const throwingFetch = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const result = await verifyRecaptchaV2("token", {
      secretKey: "sk2",
      fetchImpl: throwingFetch,
      logger: silentLogger,
    });
    expect(result.outcome).toBe("failed");
  });
});

describe("isRecaptchaAccepted", () => {
  it("accepts only ok and skipped; rejects failed and low-score", () => {
    expect(isRecaptchaAccepted("ok")).toBe(true);
    expect(isRecaptchaAccepted("skipped")).toBe(true);
    expect(isRecaptchaAccepted("failed")).toBe(false);
    expect(isRecaptchaAccepted("low-score")).toBe(false);
  });
});
