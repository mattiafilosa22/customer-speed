import { describe, expect, it } from "vitest";

import { applySecurityHeaders, buildCsp, generateNonce } from "@/lib/security-headers";

describe("generateNonce", () => {
  it("produces unique base64 nonces", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("buildCsp", () => {
  const csp = buildCsp("NONCE123");

  it("embeds the request nonce in script-src", () => {
    expect(csp).toContain("'nonce-NONCE123'");
  });

  it("allows ONLY the needed third-party origins (Google reCAPTCHA)", () => {
    expect(csp).toContain("https://www.google.com");
    expect(csp).toContain("https://www.gstatic.com");
    // No unexpected wildcards in default-src.
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("default-src *");
  });

  it("forbids framing (clickjacking) and object embedding", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe("applySecurityHeaders", () => {
  it("sets the standard hardening headers + CSP on the response", () => {
    const res = { headers: new Headers() } as unknown as Parameters<
      typeof applySecurityHeaders
    >[0];
    applySecurityHeaders(res, "default-src 'self'");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
  });
});
