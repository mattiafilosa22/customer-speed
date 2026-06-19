import { describe, expect, it } from "vitest";

import {
  createTokenCipher,
  decodeEncryptionKey,
  EncryptionKeyError,
  TokenDecryptionError,
} from "@/lib/crypto";

// Deterministic 32-byte test key (base64 of 32 bytes).
const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const KEY_HEX = Buffer.alloc(32, 9).toString("hex");

describe("decodeEncryptionKey", () => {
  it("accepts a 32-byte base64 key", () => {
    expect(decodeEncryptionKey(KEY_B64).length).toBe(32);
  });

  it("accepts a 32-byte hex key", () => {
    expect(decodeEncryptionKey(KEY_HEX).length).toBe(32);
  });

  it("rejects a key that does not decode to 32 bytes", () => {
    expect(() => decodeEncryptionKey("too-short")).toThrowError(EncryptionKeyError);
    expect(() => decodeEncryptionKey(Buffer.alloc(16, 1).toString("base64"))).toThrowError(
      EncryptionKeyError,
    );
  });
});

describe("TokenCipher (AES-256-GCM)", () => {
  it("round-trips a plaintext token", () => {
    const cipher = createTokenCipher(KEY_B64);
    const secret = "ya29.a0AfH6SMC-super-secret-access-token";
    const encrypted = cipher.encrypt(secret);

    expect(encrypted).not.toContain(secret); // never stored in cleartext
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(cipher.decrypt(encrypted)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const cipher = createTokenCipher(KEY_B64);
    const a = cipher.encrypt("same-input");
    const b = cipher.encrypt("same-input");

    expect(a).not.toBe(b); // IV differs per record
    expect(cipher.decrypt(a)).toBe("same-input");
    expect(cipher.decrypt(b)).toBe("same-input");
  });

  it("round-trips empty and unicode strings", () => {
    const cipher = createTokenCipher(KEY_B64);
    expect(cipher.decrypt(cipher.encrypt(""))).toBe("");
    expect(cipher.decrypt(cipher.encrypt("rëfresh-tökèn-😀"))).toBe("rëfresh-tökèn-😀");
  });

  it("detects tampering with the ciphertext (auth tag fails)", () => {
    const cipher = createTokenCipher(KEY_B64);
    const encrypted = cipher.encrypt("authentic");
    const parts = encrypted.split(".");
    // Flip a byte in the ciphertext segment.
    const data = Buffer.from(parts[3] ?? "", "base64");
    data[0] = (data[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString("base64")].join(".");

    expect(() => cipher.decrypt(tampered)).toThrowError(TokenDecryptionError);
  });

  it("detects a tampered auth tag", () => {
    const cipher = createTokenCipher(KEY_B64);
    const encrypted = cipher.encrypt("authentic");
    const parts = encrypted.split(".");
    const tag = Buffer.from(parts[2] ?? "", "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    const tampered = [parts[0], parts[1], tag.toString("base64"), parts[3]].join(".");

    expect(() => cipher.decrypt(tampered)).toThrowError(TokenDecryptionError);
  });

  it("rejects ciphertext encrypted with a different key", () => {
    const a = createTokenCipher(KEY_B64);
    const b = createTokenCipher(Buffer.alloc(32, 42).toString("base64"));
    const encrypted = a.encrypt("cross-key");

    expect(() => b.decrypt(encrypted)).toThrowError(TokenDecryptionError);
  });

  it("rejects malformed payloads", () => {
    const cipher = createTokenCipher(KEY_B64);
    expect(() => cipher.decrypt("garbage")).toThrowError(TokenDecryptionError);
    expect(() => cipher.decrypt("v2.a.b.c")).toThrowError(TokenDecryptionError);
    expect(() => cipher.decrypt("v1.only.three")).toThrowError(TokenDecryptionError);
  });
});
