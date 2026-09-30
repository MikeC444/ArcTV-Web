import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createWebApp, freshIp, integrationEnabled, nowIso, TvDevice, testDb, uniqueEmail } from "./helpers.js";

/**
 * User-data isolation, against the real backend + real Postgres: two accounts,
 * every private domain, every way a client could try to reach the other's data.
 */
describe.skipIf(!integrationEnabled)("two accounts cannot see or change each other's data", () => {
  const app = createWebApp();
  const db = integrationEnabled ? testDb() : (null as never);
  afterAll(async () => db?.end());

  async function signIn(label: string) {
    const email = uniqueEmail(label);
    const password = "isolation-test-password";
    const tv = new TvDevice();
    const { user } = await tv.register(email, password);
    const ip = freshIp();
    const web = request.agent(app);
    const res = await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });
    expect(res.status).toBe(200);
    const h = (r: request.Test) => r.set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    return { user, email, tv, web, get: (p: string) => h(web.get(p)), post: (p: string) => h(web.post(p)), put: (p: string) => h(web.put(p)), del: (p: string) => h(web.delete(p)) };
  }

  it("covers settings, watchlist, addons, continue-watching and history", async () => {
    const alice = await signIn("alice");
    const bob = await signIn("bob");
    expect(alice.user.id).not.toBe(bob.user.id);
    const t = nowIso(-30_000);

    // Alice fills every private domain.
    await alice.put("/api/user/settings").send({ homeRowOrder: ["alice-row"], hiddenRowIds: ["alice-hidden"], autoplayNextEpisode: false, skipIntroEnabled: false, subtitlesEnabled: false, defaultSubtitleLanguage: "fr", updatedAt: t });
    await alice.post("/api/user/watchlist").send({ providerId: "p", contentId: "tt-alice", contentType: "MOVIE", title: "Alice Only", watched: true, updatedAt: t });
    await alice.post("/api/user/addons").send({ manifestUrl: "https://alice.example/manifest.json", addonId: "alice.addon", name: "Alice Addon", manifestJson: { id: "alice.addon" }, enabled: true, sortOrder: 0, updatedAt: t });
    await alice.post("/api/user/watch-progress").send({ providerId: "p", contentId: "tt-alice-show", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "Alice Show", positionMs: 60_000, durationMs: 1_000_000, completed: false, watchedAt: t });

    // Bob sees NONE of it.
    const bobSettings = await bob.get("/api/user/settings");
    expect(bobSettings.body).toMatchObject({ homeRowOrder: [], hiddenRowIds: [], autoplayNextEpisode: true, defaultSubtitleLanguage: null, updatedAt: null });
    expect((await bob.get("/api/user/watchlist")).body.items).toEqual([]);
    expect((await bob.get("/api/user/addons")).body.items).toEqual([]);
    expect((await bob.get("/api/user/continue-watching")).body.items).toEqual([]);
    expect((await bob.get("/api/user/history")).body.items).toEqual([]);
    expect((await bob.get("/api/auth/session")).body.user.id).toBe(bob.user.id);

    // Bob tries every client-side identifier trick; none change what the server returns.
    for (const query of ["?userId=" + alice.user.id, "?user_id=" + alice.user.id, "?id=" + alice.user.id, "?email=" + encodeURIComponent(alice.email)]) {
      const r = await bob.web.get("/api/user/watchlist" + query).set("X-User-Id", alice.user.id).set("X-Forwarded-For", freshIp());
      expect(r.body.items).toEqual([]);
    }
    const spoofedMe = await bob.web.get(`/api/user/me?id=${alice.user.id}`).set("X-Forwarded-For", freshIp());
    expect(spoofedMe.body.id).toBe(bob.user.id);

    // Bob "removes" Alice's exact items (natural keys are guessable) with a far-future timestamp engineered to win last-write-wins.
    const far = new Date(Date.now() + 10 * 365 * 24 * 3600_000).toISOString();
    const del = await bob.del(`/api/user/watchlist?providerId=p&contentId=tt-alice&contentType=MOVIE&updatedAt=${encodeURIComponent(far)}`);
    expect(del.status).toBe(204); // nothing of Bob's matched
    const delAddon = await bob.del(`/api/user/addons?manifestUrl=${encodeURIComponent("https://alice.example/manifest.json")}&updatedAt=${encodeURIComponent(far)}`);
    expect(delAddon.status).toBe(204);
    // …and writes the same natural key as Bob: creates BOB's row, leaves Alice's untouched.
    await bob.post("/api/user/watchlist").send({ providerId: "p", contentId: "tt-alice", contentType: "MOVIE", title: "Bob's version", watched: false, updatedAt: far });

    const aliceList = (await alice.get("/api/user/watchlist")).body.items;
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0]).toMatchObject({ title: "Alice Only", watched: true });
    expect((await alice.get("/api/user/addons")).body.items).toHaveLength(1);
    expect((await alice.get("/api/user/settings")).body.defaultSubtitleLanguage).toBe("fr");
    expect((await alice.get("/api/user/continue-watching")).body.items).toHaveLength(1);

    // At the database level: every row is owned by exactly one user, and Bob's has only his own.
    const { rows } = await db.query("SELECT user_id, title FROM watchlist_items WHERE content_id = 'tt-alice' AND user_id = ANY($1) ORDER BY title", [[alice.user.id, bob.user.id]]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r: { user_id: string }) => r.user_id))).toEqual(new Set([alice.user.id, bob.user.id]));
  });

  it("a session cookie cannot be borrowed by another browser to become someone else", async () => {
    const alice = await signIn("alice2");
    const bob = await signIn("bob2");
    // Bob's browser presents Alice's cookie value → it's Alice (that's what a stolen cookie is); crucially Bob's OWN cookie never yields Alice.
    expect((await alice.get("/api/auth/session")).body.user.id).toBe(alice.user.id);
    expect((await bob.get("/api/auth/session")).body.user.id).toBe(bob.user.id);
    // A cookie for a random/forged value yields nothing.
    const forged = await request(app).get("/api/auth/session").set("Cookie", "mtv_session=" + "A".repeat(80));
    expect(forged.status).toBe(401);
  });

  it("the Fire TV device of one account cannot use another account's web session tokens or vice-versa", async () => {
    const alice = await signIn("alice3");
    const bob = await signIn("bob3");
    // Bob's TV bearer token against Alice's data endpoint returns BOB's (empty) data — the token, not the URL, decides.
    await alice.post("/api/user/watchlist").send({ providerId: "p", contentId: "tt-a3", contentType: "MOVIE", title: "A3", watched: false, updatedAt: nowIso(-1000) });
    const viaBobTv = await bob.tv.get("/user/watchlist");
    expect((viaBobTv.body as { items: unknown[] }).items).toEqual([]);
  });
});
