import { describe, expect, it } from "vitest";

import { argon2PasswordHasher } from "@/lib/password";

describe("argon2PasswordHasher", () => {
  it("produces an Argon2id hash distinct from the plaintext", async () => {
    const hash = await argon2PasswordHasher.hash("CorrectHorse123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("CorrectHorse123");
  });

  it("verifies a correct password", async () => {
    const hash = await argon2PasswordHasher.hash("CorrectHorse123");
    expect(await argon2PasswordHasher.verify("CorrectHorse123", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await argon2PasswordHasher.hash("CorrectHorse123");
    expect(await argon2PasswordHasher.verify("wrong", hash)).toBe(false);
  });

  it("returns false (does not throw) for a malformed stored hash", async () => {
    expect(await argon2PasswordHasher.verify("anything", "not-a-hash")).toBe(false);
  });

  it("uses a random salt (two hashes of same password differ)", async () => {
    const a = await argon2PasswordHasher.hash("samePassword1");
    const b = await argon2PasswordHasher.hash("samePassword1");
    expect(a).not.toBe(b);
  });
});
