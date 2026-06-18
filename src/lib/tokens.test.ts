import { describe, expect, it } from "vitest";

import { generateRawToken, hashToken } from "@/lib/tokens";

describe("tokens", () => {
  it("generates high-entropy, URL-safe tokens", () => {
    const t = generateRawToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet
  });

  it("generates a unique token each call", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("hashes deterministically (same input → same hash)", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produces a 64-char hex SHA-256 and never returns the raw token", () => {
    const raw = generateRawToken();
    const h = hashToken(raw);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(raw);
  });
});
