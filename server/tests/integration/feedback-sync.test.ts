import request from "supertest";
import { describe, expect, it } from "vitest";
import { BACKEND_URL, createWebApp, freshIp, integrationEnabled, nowIso, TvDevice, uniqueEmail } from "./helpers.js";

/**
 * Movie feedback (Like / Not for me) syncing across devices, through the web server, against the real backend + real Postgres.
 * Needs a backend that has the /user/feedback endpoint (the pinned reference build predates it, so the suite skips itself there).
 */
async function backendHasFeedback(): Promise<boolean> {
  if (!integrationEnabled) return false;
  const tv = new TvDevice();
  const { accessToken } = await tv.register(uniqueEmail("probe"), "feedback-probe-password");
  const res = await fetch(`${BACKEND_URL}/user/feedback`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.status !== 404;
}
const supported = await backendHasFeedback();

describe.skipIf(!supported)("feedback sync across devices (real backend)", () => {
  const app = createWebApp();

  async function device(email: string, password: string) {
    const ip = freshIp();
    const web = request.agent(app);
    const res = await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });
    expect(res.status).toBe(200);
    const h = (r: request.Test) => r.set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    return { get: (p: string) => h(web.get(p)), post: (p: string) => h(web.post(p)), del: (p: string) => h(web.delete(p)) };
  }
  async function account(label: string) {
    const email = uniqueEmail(label);
    const password = "feedback-test-password";
    await new TvDevice().register(email, password);
    return { email, password };
  }
  const body = (over: Record<string, unknown> = {}) => ({ profileId: "main", providerId: "com.linvo.cinemeta", contentId: "tt0111161", contentType: "MOVIE", title: "The Shawshank Redemption", feedback: "like", updatedAt: nowIso(-60_000), ...over });
  const clearQuery = (updatedAt: string, profileId = "main") => new URLSearchParams({ profileId, providerId: "com.linvo.cinemeta", contentId: "tt0111161", contentType: "MOVIE", updatedAt }).toString();

  it("a Like given on one device shows up on another device of the same account", async () => {
    const { email, password } = await account("sync-a");
    const laptop = await device(email, password);
    const phone = await device(email, password);
    expect((await laptop.post("/api/user/feedback").send(body())).status).toBe(200);
    const seen = await phone.get("/api/user/feedback?profileId=main");
    expect(seen.status).toBe(200);
    expect(seen.body.items).toHaveLength(1);
    expect(seen.body.items[0]).toMatchObject({ contentId: "tt0111161", feedback: "like", profileId: "main" });
  });

  it("edits, stale writes and clears follow last-write-wins on every device", async () => {
    const { email, password } = await account("sync-b");
    const laptop = await device(email, password);
    const phone = await device(email, password);
    await laptop.post("/api/user/feedback").send(body({ feedback: "like", updatedAt: nowIso(-50_000) }));
    await phone.post("/api/user/feedback").send(body({ feedback: "dislike", updatedAt: nowIso(-40_000) }));
    expect((await laptop.get("/api/user/feedback?profileId=main")).body.items[0].feedback).toBe("dislike");
    // an older write arriving late (a device that was offline) does not undo the newer decision
    const stale = await laptop.post("/api/user/feedback").send(body({ feedback: "like", updatedAt: nowIso(-55_000) }));
    expect(stale.body.feedback).toBe("dislike");
    // clearing on one device clears it everywhere
    expect((await phone.del(`/api/user/feedback?${clearQuery(nowIso(-30_000))}`)).status).toBe(200);
    expect((await laptop.get("/api/user/feedback?profileId=main")).body.items).toEqual([]);
  });

  it("keeps profiles apart and never shows one account's feedback to another", async () => {
    const a = await account("sync-c");
    const b = await account("sync-d");
    const aDevice = await device(a.email, a.password);
    const bDevice = await device(b.email, b.password);
    await aDevice.post("/api/user/feedback").send(body({ profileId: "main", feedback: "like" }));
    await aDevice.post("/api/user/feedback").send(body({ profileId: "kids", feedback: "dislike" }));
    expect((await aDevice.get("/api/user/feedback?profileId=main")).body.items.map((i: { feedback: string }) => i.feedback)).toEqual(["like"]);
    expect((await aDevice.get("/api/user/feedback?profileId=kids")).body.items.map((i: { feedback: string }) => i.feedback)).toEqual(["dislike"]);
    expect((await bDevice.get("/api/user/feedback?profileId=main")).body.items).toEqual([]);
    // B clearing the same movie does not touch A's
    await bDevice.del(`/api/user/feedback?${clearQuery(nowIso(-10_000))}`);
    expect((await aDevice.get("/api/user/feedback?profileId=main")).body.items).toHaveLength(1);
  });
});
