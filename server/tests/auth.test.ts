import { describe, expect, it } from "vitest";
import request from "supertest";
import { agentFor, appWith, setCookies } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("sign-in through the web server", () => {
  it("logs an existing user in, sets an httpOnly cookie and NEVER returns tokens to the browser", async () => {
    const backend = createMockBackend();
    const existing = backend.addUser("old.user@example.com", "correct horse battery", "Old User");
    const { post } = agentFor(appWith(backend.fetch));

    const res = await post("/api/auth/login").send({ email: "Old.User@Example.com", password: "correct horse battery" });

    expect(res.status).toBe(200);
    // The SAME user id the Fire TV app has — no duplicate account is created.
    expect(res.body).toEqual({ user: { id: existing.id, email: "old.user@example.com", displayName: "Old User" } });
    expect(JSON.stringify(res.body)).not.toMatch(/at_|rt_|token/i);
    const cookies = setCookies(res);
    const session = cookies.find((c) => c.startsWith("mtv_session="))!;
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).not.toMatch(/at_|rt_/); // sealed, not readable
    // The backend was called with a per-browser device id, web platform, and no DB anything.
    const call = backend.calls.find((c) => c.path === "/auth/login")!;
    expect(call.body).toMatchObject({ email: "old.user@example.com", platform: "web" });
    expect((call.body as { deviceId: string }).deviceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("uses the same device id for the same browser (one device row per browser, not one per login)", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const { post } = agentFor(appWith(backend.fetch));
    await post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    await post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    const ids = backend.calls.filter((c) => c.path === "/auth/login").map((c) => (c.body as { deviceId: string }).deviceId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("surfaces backend rejection of bad credentials without setting a session", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const { post } = agentFor(appWith(backend.fetch));
    const res = await post("/api/auth/login").send({ email: "a@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: "invalid_credentials", message: "Invalid email or password" });
    expect(setCookies(res).some((c) => c.startsWith("mtv_session=") && !/Max-Age=0/.test(c))).toBe(false);
  });

  it("registers a new account and reports duplicates as 409", async () => {
    const backend = createMockBackend();
    const { post } = agentFor(appWith(backend.fetch));
    const created = await post("/api/auth/register").send({ email: "new@example.com", password: "password-1234", displayName: "New" });
    expect(created.status).toBe(201);
    expect(created.body.user.displayName).toBe("New");
    const dup = await post("/api/auth/register").send({ email: "new@example.com", password: "password-1234" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("email_taken");
  });

  it("validates input before it ever reaches the backend", async () => {
    const backend = createMockBackend();
    const { post } = agentFor(appWith(backend.fetch));
    expect((await post("/api/auth/login").send({ email: "nope", password: "x" })).status).toBe(400);
    expect((await post("/api/auth/register").send({ email: "a@b.co", password: "short" })).status).toBe(400);
    expect((await post("/api/auth/login").send({ email: "a@b.co", password: "x", isAdmin: true })).status).toBe(400); // strict schema
    expect(backend.calls).toHaveLength(0);
  });

  it("GET /api/auth/session returns the user for a valid cookie and 401 without one", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const app = appWith(backend.fetch);
    expect((await request(app).get("/api/auth/session")).status).toBe(401);
    const { post, get } = agentFor(app);
    await post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    const res = await get("/api/auth/session");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("a@example.com");
  });

  it("logout revokes upstream and clears the cookie — even if the backend is down", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const { post, get } = agentFor(appWith(backend.fetch));
    await post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    backend.state.down = true;
    const out = await post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect(setCookies(out).some((c) => c.startsWith("mtv_session=;") || /mtv_session=; .*Max-Age=0/.test(c))).toBe(true);
    backend.state.down = false;
    expect((await get("/api/auth/session")).status).toBe(401);
  });

  it("rejects a forged / tampered session cookie", async () => {
    const backend = createMockBackend();
    const app = appWith(backend.fetch);
    const forged = await request(app).get("/api/auth/session").set("Cookie", "mtv_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect(forged.status).toBe(401);
    expect(backend.calls).toHaveLength(0);
  });
});

describe("CSRF protection", () => {
  it("refuses mutating requests without the client header", async () => {
    const backend = createMockBackend();
    backend.addUser("a@example.com", "password-1234");
    const app = appWith(backend.fetch);
    const res = await request(app).post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
    expect(res.status).toBe(403);
    expect(backend.calls).toHaveLength(0);
  });

  it("refuses cross-site requests even with the header", async () => {
    const backend = createMockBackend();
    const app = appWith(backend.fetch);
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-MangoTV-Client", "web")
      .set("Origin", "https://evil.example")
      .set("Host", "mangotv.example")
      .send({ email: "a@example.com", password: "password-1234" });
    expect(res.status).toBe(403);
    const site = await request(app).post("/api/auth/login").set("X-MangoTV-Client", "web").set("Sec-Fetch-Site", "cross-site").send({});
    expect(site.status).toBe(403);
  });
});

describe("session lifetime", () => {
  async function loggedIn(accessTtlMs?: number) {
    const backend = createMockBackend({ accessTtlMs });
    const user = backend.addUser("a@example.com", "password-1234");
    const app = appWith(backend.fetch);
    const client = agentFor(app);
    await client.post("/api/auth/login").send({ email: user.email, password: user.password });
    return { backend, client, user };
  }

  it("transparently refreshes an expired access token and rotates the cookie", async () => {
    const { backend, client } = await loggedIn();
    backend.expireAccessTokens();
    const res = await client.get("/api/user/watchlist");
    expect(res.status).toBe(200);
    expect(backend.state.refreshCalls).toBe(1);
    expect(setCookies(res).some((c) => c.startsWith("mtv_session=") && /HttpOnly/i.test(c))).toBe(true);
    expect((await client.get("/api/user/watchlist")).status).toBe(200); // uses the rotated tokens
    expect(backend.state.refreshCalls).toBe(1);
  });

  it("shares ONE rotation between parallel requests carrying the same old refresh token", async () => {
    const { backend, client } = await loggedIn();
    backend.expireAccessTokens();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => client.get("/api/user/watchlist")));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(backend.state.refreshCalls).toBe(1); // otherwise refresh-token rotation would sign the user out
  });

  it("signs out on a CONFIRMED rejection (session revoked remotely) with a clear session_expired error", async () => {
    const { backend, client } = await loggedIn();
    backend.revokeAllSessions();
    const res = await client.get("/api/user/watchlist");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
    expect(setCookies(res).some((c) => /mtv_session=;|Max-Age=0/.test(c))).toBe(true);
    // and the browser really is signed out afterwards
    expect((await client.get("/api/auth/session")).status).toBe(401);
  });

  it("a backend outage never signs the user out", async () => {
    const { backend, client } = await loggedIn(30_000); // access token already inside the refresh skew
    backend.state.down = true;
    const during = await client.get("/api/user/watchlist");
    expect(during.status).toBeGreaterThanOrEqual(502);
    expect(during.body.error.code).toBe("backend_unavailable");
    backend.state.down = false;
    const after = await client.get("/api/user/watchlist"); // cookie survived the outage
    expect(after.status).toBe(200);
  });
});
