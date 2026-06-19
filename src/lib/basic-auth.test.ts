import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { basicAuthGate } from "@/lib/basic-auth";

/** Minimal NextRequest stand-in: the gate only reads the Authorization header. */
function req(authorization?: string): NextRequest {
  return {
    headers: new Headers(authorization ? { authorization } : {}),
  } as unknown as NextRequest;
}

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("basicAuthGate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled (returns null) when env vars are not both set", () => {
    vi.unstubAllEnvs();
    expect(basicAuthGate(req())).toBeNull();

    vi.stubEnv("BASIC_AUTH_USER", "fabio");
    // password missing → still disabled
    expect(basicAuthGate(req())).toBeNull();
  });

  it("challenges with 401 + WWW-Authenticate when enabled and no credentials", () => {
    vi.stubEnv("BASIC_AUTH_USER", "fabio");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "secret");
    const res = basicAuthGate(req());
    expect(res?.status).toBe(401);
    expect(res?.headers.get("WWW-Authenticate")).toContain("Basic");
    expect(res?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects wrong credentials with 401", () => {
    vi.stubEnv("BASIC_AUTH_USER", "fabio");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "secret");
    expect(basicAuthGate(req(basic("fabio", "nope")))?.status).toBe(401);
    expect(basicAuthGate(req(basic("other", "secret")))?.status).toBe(401);
    expect(basicAuthGate(req("Basic not-base64"))?.status).toBe(401);
    expect(basicAuthGate(req("Bearer token"))?.status).toBe(401);
  });

  it("allows (returns null) the correct credentials", () => {
    vi.stubEnv("BASIC_AUTH_USER", "fabio");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "secret");
    expect(basicAuthGate(req(basic("fabio", "secret")))).toBeNull();
  });

  it("handles a password containing ':' correctly", () => {
    vi.stubEnv("BASIC_AUTH_USER", "fabio");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "a:b:c");
    expect(basicAuthGate(req(basic("fabio", "a:b:c")))).toBeNull();
  });
});
