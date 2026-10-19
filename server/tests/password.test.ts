import { describe, expect, it } from "vitest";
import { agentFor, appWith, setCookies } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

async function signedIn() {
  const backend = createMockBackend();
  backend.addUser("a@example.com", "password-1234");
  const client = agentFor(appWith(backend.fetch));
  await client.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
  return { backend, client };
}

describe("change password", () => {
  it("passes the change to the account with this session", async () => {
    const { backend, client } = await signedIn();
    const res = await client.post("/api/auth/password/change").send({ currentPassword: "password-1234", newPassword: "new-password-99" });
    expect(res.status).toBe(204);
    expect(backend.calls.find((c) => c.path === "/auth/password/change")?.bearer).toBeTruthy();
    expect([...backend.users.values()][0]!.password).toBe("new-password-99");
  });

  it("says when the current password is wrong, without signing this browser out", async () => {
    const { client } = await signedIn();
    const res = await client.post("/api/auth/password/change").send({ currentPassword: "nope-nope-nope", newPassword: "new-password-99" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Your current password isn't right");
    expect((await client.get("/api/auth/session")).status).toBe(200);
  });

  it("needs a session, the client header and a long enough password", async () => {
    const backend = createMockBackend();
    const client = agentFor(appWith(backend.fetch));
    expect((await client.post("/api/auth/password/change").send({ currentPassword: "x", newPassword: "new-password-99" })).status).toBe(401);
    expect((await client.agent.post("/api/auth/password/change").send({ currentPassword: "x", newPassword: "new-password-99" })).status).toBe(403);
    const { client: signed } = await signedIn();
    expect((await signed.post("/api/auth/password/change").send({ currentPassword: "password-1234", newPassword: "short" })).status).toBe(400);
  });
});

describe("forgot and reset password", () => {
  it("asks the account to email a link, and says when that isn't available yet", async () => {
    const backend = createMockBackend();
    const client = agentFor(appWith(backend.fetch));
    expect((await client.post("/api/auth/password/forgot").send({ email: "Someone@Example.com" })).status).toBe(204);
    expect(backend.calls.find((c) => c.path === "/auth/password/forgot")?.body).toEqual({ email: "someone@example.com" });
    backend.state.emailOff = true;
    const off = await client.post("/api/auth/password/forgot").send({ email: "someone@example.com" });
    expect(off.status).toBe(503);
    expect(off.body.error.message).toContain("isn't available yet");
    expect((await client.post("/api/auth/password/forgot").send({ email: "not-an-email" })).status).toBe(400);
  });

  it("sets the new password from the link and clears this browser's session", async () => {
    const { backend, client } = await signedIn();
    const res = await client.post("/api/auth/password/reset").send({ token: backend.state.resetToken, newPassword: "new-password-99" });
    expect(res.status).toBe(204);
    expect(setCookies(res).some((line) => line.startsWith("mtv_session=;"))).toBe(true);
    expect((await client.post("/api/auth/login").send({ email: "a@example.com", password: "new-password-99" })).status).toBe(200);
  });

  it("passes on the account's answer for a bad link", async () => {
    const { client } = await signedIn();
    const res = await client.post("/api/auth/password/reset").send({ token: "x".repeat(30), newPassword: "new-password-99" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("invalid or has expired");
  });
});
