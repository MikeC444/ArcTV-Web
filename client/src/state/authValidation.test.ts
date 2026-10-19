import { describe, expect, it } from "vitest";
import { validateCredentials, validateEmail, validateNewPassword } from "./auth";

describe("password and email checks", () => {
  it("checks an email on its own", () => {
    expect(validateEmail("")).toBe("Enter your email address.");
    expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
    expect(validateEmail(" sam@example.com ")).toBeNull();
  });

  it("wants a new password long enough and typed the same twice", () => {
    expect(validateNewPassword("short", "short")).toBe("Password must be at least 8 characters.");
    expect(validateNewPassword("long-enough-1", "long-enough-2")).toBe("The two passwords don't match.");
    expect(validateNewPassword("long-enough-1", "long-enough-1")).toBeNull();
  });

  it("keeps the sign-in check as it was", () => {
    expect(validateCredentials("", "password-1")).toBe("Enter your email address.");
    expect(validateCredentials("sam@example.com", "short")).toBe("Password must be at least 8 characters.");
    expect(validateCredentials("sam@example.com", "password-1")).toBeNull();
  });
});
