import { describe, expect, it } from "vitest";
import request from "supertest";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("/api/user allow-list proxy", () => {
  async function signedIn(email = "a@example.com") {
    const backend = createMockBackend();
    backend.addUser(email, "password-1234");
    const client = agentFor(appWith(backend.fetch));
    await client.post("/api/auth/login").send({ email, password: "password-1234" });
    return { backend, client };
  }

  it("requires a session", async () => {
    const backend = createMockBackend();
    const res = await request(appWith(backend.fetch)).get("/api/user/watchlist");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    expect(backend.calls).toHaveLength(0);
  });

  it("forwards only the cookie's bearer — a client-supplied Authorization header is ignored", async () => {
    const { backend, client } = await signedIn();
    const before = backend.calls.length;
    await client.agent.get("/api/user/watchlist").set("Authorization", "Bearer attacker-token").set("X-User-Id", "someone-else");
    const call = backend.calls.slice(before).find((c) => c.path === "/user/watchlist")!;
    expect(call.bearer).toMatch(/^at_/);
    expect(call.bearer).not.toBe("attacker-token");
  });

  it("does not expose any path outside the allow-list", async () => {
    const { client } = await signedIn();
    for (const path of ["/api/user/anything-else", "/api/user/../auth/sessions", "/api/user/me/extra"]) {
      const res = await client.get(path);
      expect([404, 400]).toContain(res.status);
    }
    expect((await client.delete("/api/user/me")).status).toBe(404); // method not allowed for that path
    expect((await client.get("/api/auth/sessions")).status).toBe(404);
  });

  it("forwards the feedback endpoints, and each account only sees its own", async () => {
    const backend = createMockBackend();
    backend.addUser("alice@example.com", "password-1234");
    backend.addUser("bob@example.com", "password-1234");
    const app = appWith(backend.fetch);
    const alice = agentFor(app);
    const bob = agentFor(app);
    await alice.post("/api/auth/login").send({ email: "alice@example.com", password: "password-1234" });
    await bob.post("/api/auth/login").send({ email: "bob@example.com", password: "password-1234" });
    const item = { profileId: "main", providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "Alice's pick", feedback: "like", updatedAt: new Date().toISOString() };
    expect((await alice.post("/api/user/feedback").send(item)).status).toBe(200);
    expect((await alice.get("/api/user/feedback")).body.items).toHaveLength(1);
    expect((await bob.get("/api/user/feedback")).body.items).toEqual([]);
    expect((await request(app).get("/api/user/feedback")).status).toBe(401);
  });

  it("only accepts JSON object bodies on mutations", async () => {
    const { client } = await signedIn();
    const res = await client.agent.post("/api/user/watchlist").set("X-MangoTV-Client", "web").set("Content-Type", "application/json").send("[1,2]");
    expect(res.status).toBe(400);
  });

  it("isolates two accounts: each sees only what its own cookie's token can see", async () => {
    const backend = createMockBackend();
    backend.addUser("alice@example.com", "password-1234");
    backend.addUser("bob@example.com", "password-1234");
    const app = appWith(backend.fetch);
    const alice = agentFor(app);
    const bob = agentFor(app);
    await alice.post("/api/auth/login").send({ email: "alice@example.com", password: "password-1234" });
    await bob.post("/api/auth/login").send({ email: "bob@example.com", password: "password-1234" });

    await alice.post("/api/user/watchlist").send({ providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "Alice's private pick", updatedAt: new Date().toISOString() });

    expect((await alice.get("/api/user/watchlist")).body.items).toHaveLength(1);
    expect((await bob.get("/api/user/watchlist")).body.items).toHaveLength(0);
    // Bob asks for Alice's data by naming her id in every place a client could: nothing changes.
    const spoof = await bob.agent.get("/api/user/watchlist?userId=anything&user_id=anything").set("X-User-Id", "alice");
    expect(spoof.body.items).toHaveLength(0);
  });

  it("caches non-user-specific TMDB lookups but still requires a session", async () => {
    const { backend, client } = await signedIn();
    const first = await client.get("/api/user/trailer?title=Heat&type=MOVIE");
    const second = await client.get("/api/user/trailer?title=Heat&type=MOVIE");
    expect(first.body).toEqual({ youtubeVideoId: "abc123" });
    expect(second.body).toEqual(first.body);
    expect(backend.calls.filter((c) => c.path === "/user/trailer")).toHaveLength(1);
    const anon = await request(appWith(backend.fetch)).get("/api/user/trailer?title=Heat&type=MOVIE");
    expect(anon.status).toBe(401);
  });
});
