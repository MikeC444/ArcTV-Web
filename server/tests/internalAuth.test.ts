import { describe, expect, it } from "vitest";
import { INTERNAL_HEADER, InternalTokens } from "../src/internalAuth.js";

const req = (token: string | undefined, address: string) => ({ headers: token === undefined ? {} : { [INTERNAL_HEADER]: token }, socket: { remoteAddress: address } }) as never;

describe("internal tokens (ffmpeg → relay over loopback)", () => {
  it("name the person they were issued for, from loopback only", () => {
    const tokens = new InternalTokens();
    const token = tokens.issue("user-1");
    expect(tokens.userFor(req(token, "127.0.0.1"))).toBe("user-1");
    expect(tokens.userFor(req(token, "::1"))).toBe("user-1");
    expect(tokens.userFor(req(token, "::ffff:127.0.0.1"))).toBe("user-1");
    expect(tokens.userFor(req(token, "203.0.113.9"))).toBeNull(); // the token alone is useless from outside
    expect(tokens.userFor(req(token, "10.0.0.5"))).toBeNull();
  });

  it("refuse unknown, missing and revoked tokens", () => {
    const tokens = new InternalTokens();
    const token = tokens.issue("user-1");
    expect(tokens.userFor(req("made-up", "127.0.0.1"))).toBeNull();
    expect(tokens.userFor(req(undefined, "127.0.0.1"))).toBeNull();
    tokens.revoke(token);
    expect(tokens.userFor(req(token, "127.0.0.1"))).toBeNull();
  });

  it("are different every time", () => {
    const tokens = new InternalTokens();
    expect(tokens.issue("u")).not.toBe(tokens.issue("u"));
  });
});
