import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createWebApp, freshIp, integrationEnabled, nowIso, readSessionCookie, TvDevice, testDb, uniqueEmail } from "./helpers.js";

/**
 * "Existing users must be able to sign in on the web and see their existing data."
 * The Fire TV app is simulated exactly as it talks to the backend; then the SAME
 * account signs in through the web server.
 */
describe.skipIf(!integrationEnabled)("existing Fire TV account → web", () => {
  const app = createWebApp();
  const db = integrationEnabled ? testDb() : (null as never);
  afterAll(async () => db?.end());

  it("signs in with the existing email/password, keeps the same user id, and sees all synced data", async () => {
    const email = uniqueEmail("firetv-user");
    const password = "a-very-long-tv-password";
    const tv = new TvDevice();
    const tokens = await tv.register(email, password);
    const userId = tokens.user.id;

    // ── data the TV has already synced to the cloud ─────────────────────────────
    const t = nowIso(-60_000);
    expect((await tv.put("/user/settings", {
      homeRowOrder: ["cinemeta_genre_Action", "cinemeta_base"], hiddenRowIds: ["cinemeta_genre_Horror"],
      autoplayNextEpisode: false, skipIntroEnabled: true, subtitlesEnabled: true, defaultSubtitleLanguage: "es", updatedAt: t,
    })).status).toBe(200);
    expect((await tv.post("/user/watchlist", {
      providerId: "com.linvo.cinemeta", contentId: "tt0111161", contentType: "MOVIE", title: "The Shawshank Redemption",
      posterUrl: "https://img.example/p.jpg", backdropUrl: null, year: 1994, rating: 9.3, watched: true, updatedAt: t,
    })).status).toBe(200);
    expect((await tv.post("/user/addons", {
      manifestUrl: "https://v3-cinemeta.strem.io/manifest.json", addonId: "com.linvo.cinemeta", name: "Cinemeta",
      manifestJson: { id: "com.linvo.cinemeta", name: "Cinemeta", version: "3.0.14" }, enabled: true, sortOrder: 0, updatedAt: t,
    })).status).toBe(200);
    expect((await tv.post("/user/watch-progress", {
      providerId: "com.linvo.cinemeta", contentId: "tt0903747", contentType: "TV_SHOW", seasonNumber: 2, episodeNumber: 5,
      episodeTitle: "Breakage", title: "Breaking Bad", posterUrl: null, backdropUrl: "https://img.example/b.jpg",
      positionMs: 1_200_000, durationMs: 2_700_000, completed: false, watchedAt: t,
    })).status).toBe(200);

    // ── the same person opens the website ──────────────────────────────────────
    const web = request.agent(app);
    const ip = freshIp();
    const login = await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(userId); // SAME identity — no duplicate account, no re-registration
    expect(JSON.stringify(login.body)).not.toMatch(/accessToken|refreshToken/);

    const { rows: users } = await db.query("SELECT count(*)::int AS n FROM users WHERE email = $1", [email]);
    expect(users[0].n).toBe(1);

    const settings = await web.get("/api/user/settings").set("X-Forwarded-For", ip);
    expect(settings.body).toMatchObject({ homeRowOrder: ["cinemeta_genre_Action", "cinemeta_base"], hiddenRowIds: ["cinemeta_genre_Horror"], autoplayNextEpisode: false, defaultSubtitleLanguage: "es" });

    const list = await web.get("/api/user/watchlist").set("X-Forwarded-For", ip);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ contentId: "tt0111161", title: "The Shawshank Redemption", watched: true, year: 1994 });

    const addons = await web.get("/api/user/addons").set("X-Forwarded-For", ip);
    expect(addons.body.items.map((a: { manifestUrl: string }) => a.manifestUrl)).toEqual(["https://v3-cinemeta.strem.io/manifest.json"]);

    const cw = await web.get("/api/user/continue-watching").set("X-Forwarded-For", ip);
    expect(cw.body.items[0]).toMatchObject({ contentId: "tt0903747", seasonNumber: 2, episodeNumber: 5, positionMs: 1_200_000 });

    // The browser is now a second device on the SAME account (one row per browser).
    const { rows: devices } = await db.query("SELECT platform, device_name FROM devices WHERE user_id = $1 ORDER BY created_at", [userId]);
    expect(devices.map((d: { platform: string }) => d.platform)).toEqual(["fire_tv", "web"]);
  });

  it("changes made in the browser show up on the TV, and vice-versa (last-write-wins on updatedAt)", async () => {
    const email = uniqueEmail("sync");
    const password = "another-long-password";
    const tv = new TvDevice();
    await tv.register(email, password);
    const web = request.agent(app);
    const ip = freshIp();
    await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });

    const item = { providerId: "p", contentId: "tt1", contentType: "MOVIE", title: "Heat", watched: false };
    const added = await web.post("/api/user/watchlist").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ ...item, updatedAt: nowIso(-5000) });
    expect(added.status).toBe(200);
    expect(((await tv.get("/user/watchlist")).body as { items: unknown[] }).items).toHaveLength(1);

    // TV marks it watched LATER → wins; an OLDER web write must not overwrite it.
    await tv.post("/user/watchlist", { ...item, watched: true, updatedAt: nowIso(-1000) });
    const stale = await web.post("/api/user/watchlist").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ ...item, watched: false, updatedAt: nowIso(-3000) });
    expect(stale.body.watched).toBe(true); // server answers with the authoritative (newer) row

    // Removing from the web (newest) removes it for the TV too.
    const removed = await web.delete(`/api/user/watchlist?providerId=p&contentId=tt1&contentType=MOVIE&updatedAt=${encodeURIComponent(nowIso())}`).set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    expect([200, 204]).toContain(removed.status);
    expect(((await tv.get("/user/watchlist")).body as { items: unknown[] }).items).toHaveLength(0);
  });

  it("progress reported by the browser lands in Continue Watching, and completion clears it (movie ≥ 85%)", async () => {
    const email = uniqueEmail("progress");
    const password = "yet-another-password";
    await new TvDevice().register(email, password);
    const web = request.agent(app);
    const ip = freshIp();
    await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });
    const body = { providerId: "p", contentId: "tt9", contentType: "MOVIE", title: "Heat", positionMs: 600_000, durationMs: 10_000_000, completed: false, watchedAt: nowIso(-2000) };
    await web.post("/api/user/watch-progress").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send(body);
    expect((await web.get("/api/user/continue-watching").set("X-Forwarded-For", ip)).body.items).toHaveLength(1);
    await web.post("/api/user/watch-progress").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ ...body, positionMs: 9_000_000, watchedAt: nowIso() });
    expect((await web.get("/api/user/continue-watching").set("X-Forwarded-For", ip)).body.items).toHaveLength(0);
    const history = await web.get("/api/user/history").set("X-Forwarded-For", ip);
    expect(history.body.items[0]).toMatchObject({ contentId: "tt9", completed: true });
  });

  it("a wrong password is rejected by the real backend and creates no session", async () => {
    const email = uniqueEmail("wrongpw");
    await new TvDevice().register(email, "correct-password-1");
    const res = await request(app).post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", freshIp()).send({ email, password: "incorrect-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
    expect(readSessionCookie(res.headers["set-cookie"])).toBeNull();
  });
});
