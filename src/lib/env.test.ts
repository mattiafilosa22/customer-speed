import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/customerspeed",
  NEXTAUTH_SECRET: "a-very-long-secret-value-of-at-least-32-chars",
  NEXTAUTH_URL: "http://localhost:3000",
} as const;

describe("parseEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const result = parseEnv(validEnv as unknown as NodeJS.ProcessEnv);

    expect(result.DATABASE_URL).toContain("postgresql://");
    expect(result.NODE_ENV).toBe("test");
    expect(result.RECAPTCHA_MIN_SCORE).toBe(0.5); // default
    expect(result.APP_URL).toBe("http://localhost:3000"); // default
  });

  it("rejects a missing DATABASE_URL", () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    expect(() => parseEnv(rest as unknown as NodeJS.ProcessEnv)).toThrowError(/DATABASE_URL/);
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: "not-a-url" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/DATABASE_URL/);
  });

  it("requires NEXTAUTH_SECRET (min 32 chars)", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXTAUTH_SECRET: "short" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/NEXTAUTH_SECRET/);
  });

  it("requires NEXTAUTH_URL to be a valid URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, NEXTAUTH_URL: "nope" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/NEXTAUTH_URL/);
  });

  it("coerces RECAPTCHA_MIN_SCORE and rejects out-of-range", () => {
    const ok = parseEnv({
      ...validEnv,
      RECAPTCHA_MIN_SCORE: "0.7",
    } as unknown as NodeJS.ProcessEnv);
    expect(ok.RECAPTCHA_MIN_SCORE).toBe(0.7);
    expect(() =>
      parseEnv({ ...validEnv, RECAPTCHA_MIN_SCORE: "2" } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/RECAPTCHA_MIN_SCORE/);
  });

  it("defaults the rate-limit backend to memory and the kill-switch to false", () => {
    const result = parseEnv(validEnv as unknown as NodeJS.ProcessEnv);
    expect(result.RATE_LIMIT_BACKEND).toBe("memory");
    expect(result.RATE_LIMIT_DISABLED).toBe(false);
  });

  it("parses the rate-limit kill-switch from a string flag", () => {
    const result = parseEnv({
      ...validEnv,
      RATE_LIMIT_DISABLED: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.RATE_LIMIT_DISABLED).toBe(true);
  });

  it("REJECTS disabling the rate limiter in production (fail-safe)", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NODE_ENV: "production",
        RATE_LIMIT_DISABLED: "true",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrowError(/RATE_LIMIT_DISABLED/);
  });

  it("allows the prod-build kill-switch ONLY with the explicit E2E signal", () => {
    const result = parseEnv({
      ...validEnv,
      NODE_ENV: "production",
      RATE_LIMIT_DISABLED: "true",
      E2E: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.RATE_LIMIT_DISABLED).toBe(true);
    expect(result.E2E).toBe(true);
  });

  it("treats SENTRY_DSN as optional (no DSN → observability off)", () => {
    const result = parseEnv(validEnv as unknown as NodeJS.ProcessEnv);
    expect(result.SENTRY_DSN).toBeUndefined();
    expect(result.SENTRY_TRACES_SAMPLE_RATE).toBe(0);
  });
});
