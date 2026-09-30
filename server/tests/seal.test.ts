import { describe, expect, it } from "vitest";
import { deriveKey, seal, unseal } from "../src/seal.js";

describe("cookie sealing", () => {
  const key = deriveKey("a-long-enough-test-secret");

  it("round-trips a payload", () => {
    const token = seal(key, { hello: "world", n: 1 }, "session");
    expect(unseal(key, token, "session")).toEqual({ hello: "world", n: 1 });
  });

  it("never contains the plaintext", () => {
    const token = seal(key, { refresh: "SUPER-SECRET-REFRESH-TOKEN" }, "session");
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("SUPER-SECRET");
  });

  it("rejects tampered ciphertext", () => {
    const token = seal(key, { a: 1 }, "session");
    const raw = Buffer.from(token, "base64url");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(unseal(key, raw.toString("base64url"), "session")).toBeNull();
  });

  it("rejects a different key", () => {
    const token = seal(key, { a: 1 }, "session");
    expect(unseal(deriveKey("another-long-test-secret"), token, "session")).toBeNull();
  });

  it("binds a cookie to its purpose (a device cookie cannot be replayed as a session)", () => {
    const token = seal(key, { id: "x" }, "device");
    expect(unseal(key, token, "session")).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(unseal(key, "", "session")).toBeNull();
    expect(unseal(key, "not-a-token", "session")).toBeNull();
  });
});
