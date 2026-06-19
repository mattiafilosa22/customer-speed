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

  it("never allows 'unsafe-inline' on script-src (XSS-relevant directive)", () => {
    // Isolate the script-src directive and assert it carries no unsafe-inline.
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("never allows 'unsafe-eval' on script-src in production", () => {
    const prodCsp = buildCsp("N", false);
    const scriptSrc = prodCsp.split("; ").find((d) => d.startsWith("script-src "));
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("adds upgrade-insecure-requests in production but not in dev", () => {
    expect(buildCsp("N", false)).toContain("upgrade-insecure-requests");
    expect(buildCsp("N", true)).not.toContain("upgrade-insecure-requests");
  });

  it("keeps 'unsafe-inline' on style-src deliberately (documented residual)", () => {
    // Next injects runtime inline <style> with no nonce hook; style-only
    // injection cannot execute code. If Next exposes a style nonce, tighten this.
    const styleSrc = csp.split("; ").find((d) => d.startsWith("style-src "));
    expect(styleSrc).toContain("'unsafe-inline'");
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
