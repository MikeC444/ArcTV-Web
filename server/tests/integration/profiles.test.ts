import request from "supertest";
import { describe, expect, it } from "vitest";
import { BACKEND_URL, createWebApp, freshIp, integrationEnabled, nowIso, TvDevice, uniqueEmail } from "./helpers.js";

/**
 * Profiles through the web server against the real backend + real Postgres: the profile list, the Plus and PIN checks, the
 * profile the cookie carries reaching the backend as X-ArcTV-Profile, and each profile's library staying separate.
 * Needs a backend with /user/profiles (docs/PROFILES.md); older ones answer 404 and the suite skips itself.
 */
async function backendHasProfiles(): Promise<boolean> {
  if (!integrationEnabled) return false;
  const { accessToken } = await new TvDevice().register(uniqueEmail("probe"), "profiles-probe-password");
  return (await fetch(`${BACKEND_URL}/user/profiles`, { headers: { Authorization: `Bearer ${accessToken}` } })).status !== 404;
}
const supported = await backendHasProfiles();

describe.skipIf(!supported)("profiles (real backend)", () => {
  const app = createWebApp();

  async function signedIn(label: string) {
    const email = uniqueEmail(label);
    const password = "profiles-test-password";
    await new TvDevice().register(email, password);
    const ip = freshIp();
    const web = request.agent(app);
    expect((await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password })).status).toBe(200);
    const h = (r: request.Test) => r.set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    return { get: (p: string) => h(web.get(p)), post: (p: string) => h(web.post(p)), put: (p: string) => h(web.put(p)), del: (p: string) => h(web.delete(p)) };
  }
  const profile = (over: Record<string, unknown> = {}) => ({ name: "Sam", avatar: "ocean", kind: "adult", ...over });
  const movie = (id: string) => ({ providerId: "com.linvo.cinemeta", contentId: id, contentType: "MOVIE", title: id, updatedAt: nowIso(-60_000) });

  it("every account has its own profile, and Plus (early access) lets it add up to four more", async () => {
    const web = await signedIn("p-list");
    const first = await web.get("/api/profiles");
    expect(first.body).toMatchObject({ supported: true, plus: true, limit: 5, active: "main" });
    expect(first.body.profiles).toHaveLength(1);
    expect(first.body.profiles[0]).toMatchObject({ id: "main", isDefault: true, kind: "adult", hasPin: false });
    for (let i = 0; i < 4; i++) expect((await web.post("/api/profiles").send(profile({ name: `P${i}`, kind: i < 2 ? "kids" : "adult" }))).status).toBe(201);
    const over = await web.post("/api/profiles").send(profile({ name: "Sixth" }));
    expect(over.status).toBe(400);
    expect((await web.get("/api/profiles")).body.profiles).toHaveLength(5);
  });

  it("each profile has its own My List, through the cookie's profile", async () => {
    const web = await signedIn("p-library");
    const kid = (await web.post("/api/profiles").send(profile({ name: "Kid", kind: "kids" }))).body.profile.id as string;
    await web.post("/api/user/watchlist").send(movie("tt-main"));
    expect((await web.post("/api/profiles/select").send({ profileId: kid })).status).toBe(200);
    expect((await web.get("/api/user/watchlist")).body.items).toEqual([]); // the kids profile starts empty
    await web.post("/api/user/watchlist").send(movie("tt-kid"));
    expect((await web.get("/api/user/watchlist")).body.items.map((i: { contentId: string }) => i.contentId)).toEqual(["tt-kid"]);
    expect((await web.post("/api/profiles/select").send({ profileId: "main" })).status).toBe(200);
    expect((await web.get("/api/user/watchlist")).body.items.map((i: { contentId: string }) => i.contentId)).toEqual(["tt-main"]);
  });

  it("a locked profile needs its PIN to open, and guessing is stopped after five wrong tries", async () => {
    const web = await signedIn("p-pin");
    const id = (await web.post("/api/profiles").send(profile({ pin: "1234" }))).body.profile.id as string;
    expect((await web.post("/api/profiles/select").send({ profileId: id })).body.error.code).toBe("pin_required");
    for (let i = 0; i < 5; i++) expect((await web.post("/api/profiles/select").send({ profileId: id, pin: "0000" })).body.error.code).toBe("wrong_pin");
    const locked = await web.post("/api/profiles/select").send({ profileId: id, pin: "1234" });
    expect(locked.status).toBe(429);
    expect((await web.get("/api/profiles")).body.active).toBe("main");
  });

  it("changing or removing a locked profile needs its PIN; removing it deletes its library", async () => {
    const web = await signedIn("p-edit");
    const id = (await web.post("/api/profiles").send(profile({ pin: "1234" }))).body.profile.id as string;
    expect((await web.put(`/api/profiles/${id}`).send({ name: "New" })).body.error.code).toBe("pin_required");
    expect((await web.put(`/api/profiles/${id}`).set("X-ArcTV-Pin", "1234").send({ name: "New", pin: null })).body.profile).toMatchObject({ name: "New", hasPin: false });
    expect((await web.post("/api/profiles/select").send({ profileId: id })).status).toBe(200);
    await web.post("/api/user/watchlist").send(movie("tt-gone"));
    expect((await web.del(`/api/profiles/${id}`)).status).toBe(204);
    const after = await web.get("/api/profiles");
    expect(after.body.active).toBe("main");
    expect(after.body.profiles).toHaveLength(1);
    expect((await web.get("/api/user/watchlist")).body.items).toEqual([]);
  });

  it("the account's own profile can't be removed or made a kids profile, and another account's profile is invisible", async () => {
    const a = await signedIn("p-own-a");
    const b = await signedIn("p-own-b");
    expect((await a.del("/api/profiles/main")).status).toBe(400);
    expect((await a.put("/api/profiles/main").send({ kind: "kids" })).status).toBe(400);
    const aKid = (await a.post("/api/profiles").send(profile({ kind: "kids" }))).body.profile.id as string;
    expect((await b.post("/api/profiles/select").send({ profileId: aKid })).status).toBe(404);
    expect((await b.get("/api/profiles")).body.profiles).toHaveLength(1);
  });

  it("Likes follow the profile too (the header decides, not the profileId in the body)", async () => {
    const web = await signedIn("p-feedback");
    const kid = (await web.post("/api/profiles").send(profile({ kind: "kids" }))).body.profile.id as string;
    await web.post("/api/profiles/select").send({ profileId: kid });
    const body = { profileId: "main", providerId: "com.linvo.cinemeta", contentId: "tt0111161", contentType: "MOVIE", title: "X", feedback: "like", updatedAt: nowIso(-60_000) };
    const saved = await web.post("/api/user/feedback").send(body);
    expect(saved.status).toBe(200);
    expect(saved.body.profileId).toBe(kid);
    await web.post("/api/profiles/select").send({ profileId: "main" });
    expect((await web.get("/api/user/feedback?profileId=main")).body.items).toEqual([]);
  });
});
