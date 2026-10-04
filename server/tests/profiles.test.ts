import { describe, expect, it } from "vitest";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("/api/profiles", () => {
  async function signedIn(email = "a@example.com") {
    const backend = createMockBackend();
    backend.addUser(email, "password-1234", "Alex");
    const client = agentFor(appWith(backend.fetch));
    await client.post("/api/auth/login").send({ email, password: "password-1234" });
    return { backend, client };
  }
  const create = (client: Awaited<ReturnType<typeof signedIn>>["client"], body: Record<string, unknown> = {}) =>
    client.post("/api/profiles").send({ name: "Sam", avatar: "cat", kind: "adult", ...body });

  it("requires a session", async () => {
    const backend = createMockBackend();
    const res = await agentFor(appWith(backend.fetch)).get("/api/profiles");
    expect(res.status).toBe(401);
  });

  it("lists the account's own profile first and says Plus is on", async () => {
    const { client } = await signedIn();
    const res = await client.get("/api/profiles");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ supported: true, plus: true, limit: 5, active: "main" });
    expect(res.body.profiles).toEqual([{ id: "main", name: "Alex", avatar: "fox", kind: "adult", hasPin: false, isDefault: true }]);
  });

  it("reports an older backend (no profiles) as unsupported rather than failing", async () => {
    const { backend, client } = await signedIn();
    backend.state.profilesSupported = false;
    const res = await client.get("/api/profiles");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ supported: false, plus: false, active: "main" });
  });

  it("creates profiles up to the limit of 5, then refuses", async () => {
    const { client } = await signedIn();
    for (let i = 0; i < 4; i++) expect((await create(client, { name: `P${i}` })).status).toBe(201);
    const sixth = await create(client, { name: "Too many" });
    expect(sixth.status).toBe(400);
    expect(sixth.body.error.message).toMatch(/up to 5/);
    expect((await client.get("/api/profiles")).body.profiles).toHaveLength(5);
  });

  it("allows any mix of adult and kids profiles", async () => {
    const { client } = await signedIn();
    for (const kind of ["kids", "kids", "kids", "kids"]) expect((await create(client, { kind })).status).toBe(201);
    expect((await client.get("/api/profiles")).body.profiles.filter((p: { kind: string }) => p.kind === "kids")).toHaveLength(4);
  });

  it("validates the body: names, avatar, kind and a 4-digit PIN", async () => {
    const { client } = await signedIn();
    expect((await create(client, { name: "  " })).status).toBe(400);
    expect((await create(client, { name: "x".repeat(25) })).status).toBe(400);
    expect((await create(client, { avatar: "not-an-avatar" })).status).toBe(400);
    expect((await create(client, { kind: "teen" })).status).toBe(400);
    expect((await create(client, { pin: "12" })).status).toBe(400);
    expect((await create(client, { pin: "abcd" })).status).toBe(400);
    expect((await create(client, { extra: true })).status).toBe(400);
  });

  it("is Plus only: without Plus nothing can be created, opened or changed, and only the account's own profile is listed", async () => {
    const { backend, client } = await signedIn();
    const made = await create(client, { name: "Sam" });
    backend.state.plus = false;
    expect((await create(client, { name: "More" })).body.error.code).toBe("plus_required");
    expect((await client.post("/api/profiles/select").send({ profileId: made.body.profile.id })).body.error.code).toBe("plus_required");
    expect((await client.put(`/api/profiles/${made.body.profile.id}`).send({ name: "Renamed" })).body.error.code).toBe("plus_required");
    expect((await client.delete(`/api/profiles/${made.body.profile.id}`)).body.error.code).toBe("plus_required");
    const list = await client.get("/api/profiles");
    expect(list.body).toMatchObject({ plus: false });
    expect(list.body.profiles.map((p: { id: string }) => p.id)).toEqual(["main"]);
    // the account's own profile stays usable
    expect((await client.post("/api/profiles/select").send({ profileId: "main" })).status).toBe(200);
  });

  it("sends the chosen profile to the backend from the cookie, and ignores one named by the browser", async () => {
    const { backend, client } = await signedIn();
    const made = await create(client, { name: "Sam" });
    const id = made.body.profile.id as string;

    await client.get("/api/user/watchlist");
    expect(backend.calls.filter((c) => c.path === "/user/watchlist").at(-1)?.profileId).toBeUndefined();

    expect((await client.post("/api/profiles/select").send({ profileId: id })).status).toBe(200);
    await client.agent.get("/api/user/watchlist").set("X-ArcTV-Profile", "main");
    expect(backend.calls.filter((c) => c.path === "/user/watchlist").at(-1)?.profileId).toBe(id);
    expect((await client.get("/api/profiles")).body.active).toBe(id);

    // account-level calls never carry a profile
    await client.get("/api/profiles");
    expect(backend.calls.filter((c) => c.path === "/user/plus").at(-1)?.profileId).toBeUndefined();

    // choosing the account's own profile again clears it
    await client.post("/api/profiles/select").send({ profileId: "main" });
    await client.get("/api/user/watchlist");
    expect(backend.calls.filter((c) => c.path === "/user/watchlist").at(-1)?.profileId).toBeUndefined();
  });

  it("keeps each profile's library separate", async () => {
    const { client } = await signedIn();
    const sam = (await create(client)).body.profile.id as string;
    const item = { providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "Main's pick", updatedAt: new Date().toISOString() };
    await client.post("/api/user/watchlist").send(item);
    expect((await client.get("/api/user/watchlist")).body.items).toHaveLength(1);
    await client.post("/api/profiles/select").send({ profileId: sam });
    expect((await client.get("/api/user/watchlist")).body.items).toEqual([]);
    await client.post("/api/profiles/select").send({ profileId: "main" });
    expect((await client.get("/api/user/watchlist")).body.items).toHaveLength(1);
  });

  describe("PINs", () => {
    it("asks for the PIN to open a locked profile, and a wrong one is refused", async () => {
      const { client } = await signedIn();
      const id = (await create(client, { pin: "1234" })).body.profile.id as string;
      expect((await client.get("/api/profiles")).body.profiles.find((p: { id: string }) => p.id === id)).toMatchObject({ hasPin: true });
      expect((await client.get("/api/profiles")).body.profiles.some((p: Record<string, unknown>) => "pin" in p)).toBe(false); // the PIN itself is never returned

      const none = await client.post("/api/profiles/select").send({ profileId: id });
      expect(none.status).toBe(403);
      expect(none.body.error.code).toBe("pin_required");
      const wrong = await client.post("/api/profiles/select").send({ profileId: id, pin: "0000" });
      expect(wrong.status).toBe(403);
      expect(wrong.body.error.code).toBe("wrong_pin");
      expect((await client.get("/api/profiles")).body.active).toBe("main");

      expect((await client.post("/api/profiles/select").send({ profileId: id, pin: "1234" })).status).toBe(200);
      expect((await client.get("/api/profiles")).body.active).toBe(id);
    });

    it("needs the PIN to change or remove a locked profile", async () => {
      const { client } = await signedIn();
      const id = (await create(client, { pin: "1234" })).body.profile.id as string;
      expect((await client.put(`/api/profiles/${id}`).send({ name: "New" })).body.error.code).toBe("pin_required");
      expect((await client.put(`/api/profiles/${id}`).set("X-ArcTV-Pin", "9999").send({ name: "New" })).body.error.code).toBe("wrong_pin");
      expect((await client.put(`/api/profiles/${id}`).set("X-ArcTV-Pin", "1234").send({ name: "New", pin: null })).body.profile).toMatchObject({ name: "New", hasPin: false });
      // now unlocked: no PIN needed
      expect((await client.delete(`/api/profiles/${id}`)).status).toBe(204);
    });

    it("rejects a malformed PIN header", async () => {
      const { client } = await signedIn();
      const id = (await create(client, { pin: "1234" })).body.profile.id as string;
      expect((await client.delete(`/api/profiles/${id}`).set("X-ArcTV-Pin", "12ab")).status).toBe(400);
    });
  });

  it("never lets the account's own profile be removed or turned into a kids profile", async () => {
    const { client } = await signedIn();
    expect((await client.delete("/api/profiles/main")).status).toBe(400);
    expect((await client.put("/api/profiles/main").send({ kind: "kids" })).status).toBe(400);
    expect((await client.put("/api/profiles/main").send({ name: "Owner" })).body.profile.name).toBe("Owner");
  });

  it("goes back to the account's own profile when the active one is removed", async () => {
    const { client } = await signedIn();
    const id = (await create(client)).body.profile.id as string;
    await client.post("/api/profiles/select").send({ profileId: id });
    expect((await client.delete(`/api/profiles/${id}`)).status).toBe(204);
    expect((await client.get("/api/profiles")).body.active).toBe("main");
  });

  it("falls back to the account's own profile when Plus lapses on the active one", async () => {
    const { backend, client } = await signedIn();
    const id = (await create(client)).body.profile.id as string;
    await client.post("/api/profiles/select").send({ profileId: id });
    backend.state.plus = false;
    expect((await client.get("/api/profiles")).body.active).toBe("main");
    await client.get("/api/user/watchlist");
    expect(backend.calls.filter((c) => c.path === "/user/watchlist").at(-1)?.profileId).toBeUndefined();
  });

  it("keeps the chosen profile when the access token is rotated", async () => {
    const { backend, client } = await signedIn();
    const id = (await create(client)).body.profile.id as string;
    await client.post("/api/profiles/select").send({ profileId: id });
    backend.expireAccessTokens();
    await client.get("/api/user/watchlist");
    expect(backend.state.refreshCalls).toBeGreaterThan(0);
    await client.get("/api/user/watchlist");
    expect(backend.calls.filter((c) => c.path === "/user/watchlist").at(-1)?.profileId).toBe(id);
    expect((await client.get("/api/profiles")).body.active).toBe(id);
  });

  it("does not let one account see or open another account's profiles", async () => {
    const backend = createMockBackend();
    backend.addUser("alice@example.com", "password-1234", "Alice");
    backend.addUser("bob@example.com", "password-1234", "Bob");
    const app = appWith(backend.fetch);
    const alice = agentFor(app);
    const bob = agentFor(app);
    await alice.post("/api/auth/login").send({ email: "alice@example.com", password: "password-1234" });
    await bob.post("/api/auth/login").send({ email: "bob@example.com", password: "password-1234" });
    const aliceKid = (await alice.post("/api/profiles").send({ name: "Kid", avatar: "alien", kind: "kids" })).body.profile.id as string;
    expect((await bob.get("/api/profiles")).body.profiles).toHaveLength(1);
    expect((await bob.post("/api/profiles/select").send({ profileId: aliceKid })).status).toBe(404);
    expect((await bob.delete(`/api/profiles/${aliceKid}`)).status).toBe(404);
  });
});
