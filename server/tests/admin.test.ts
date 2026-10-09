import { describe, expect, it } from "vitest";
import request from "supertest";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("/api/admin (developer panel proxy)", () => {
  async function signedIn(email = "admin@example.com") {
    const backend = createMockBackend();
    backend.addUser(email, "password-1234");
    const client = agentFor(appWith(backend.fetch));
    await client.post("/api/auth/login").send({ email, password: "password-1234" });
    return { backend, client };
  }

  it("requires a session", async () => {
    const backend = createMockBackend();
    const res = await request(appWith(backend.fetch)).get("/api/admin/summary");
    expect(res.status).toBe(401);
    expect(backend.calls).toHaveLength(0);
  });

  it("forwards the three read-only views, with the search and paging", async () => {
    const { backend, client } = await signedIn();
    expect((await client.get("/api/admin/summary")).body).toMatchObject({ users: 3, versions: [{ version: "0.1.7" }], live: { online: { users: 3 }, watching: { users: 1 } } });
    const list = await client.get("/api/admin/users?q=sam&limit=20&offset=40");
    expect(list.body.total).toBe(1);
    const call = backend.calls.find((c) => c.path === "/admin/users")!;
    expect(call.query).toBe("q=sam&limit=20&offset=40");
    expect(call.bearer).toMatch(/^at_/);
    expect(call.profileId).toBeUndefined(); // account-level: never scoped to a profile
    const id = "0b9b3a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    expect((await client.get(`/api/admin/users/${id}`)).body.user.id).toBe(id);
  });

  it("exposes nothing else, and nothing that changes data", async () => {
    const { client } = await signedIn();
    for (const path of ["/api/admin", "/api/admin/other", "/api/admin/feature-intros/torrent_intro", "/api/admin/users/not-an-id", "/api/admin/users/../summary"]) {
      expect([404, 400]).toContain((await client.get(path)).status);
    }
    expect((await client.post("/api/admin/users").send({})).status).toBe(404);
    expect((await client.delete("/api/admin/users/0b9b3a6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).status).toBe(404);
  });

  it("tells the web app whether this account is an admin", async () => {
    const admin = await signedIn("admin@example.com");
    expect((await admin.client.get("/api/auth/session")).body.user.isAdmin).toBe(true);
    const other = await signedIn("sam@example.com");
    expect((await other.client.get("/api/auth/session")).body.user.isAdmin).toBe(false);
  });
});
