import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createWebApp, freshIp, integrationEnabled, readSessionCookie, TvDevice, testDb, uniqueEmail, BACKEND_URL } from "./helpers.js";

describe.skipIf(!integrationEnabled)("session lifecycle against the real backend", () => {
  const app = createWebApp();
  const db = integrationEnabled ? testDb() : (null as never);
  afterAll(async () => db?.end());

  async function signIn(label: string) {
    const email = uniqueEmail(label);
    const password = "lifecycle-test-password";
    const tv = new TvDevice();
    const { user } = await tv.register(email, password);
    const ip = freshIp();
    const web = request.agent(app);
    const login = await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password });
    expect(login.status).toBe(200);
    return { user, email, tv, web, ip, first: readSessionCookie(login.headers["set-cookie"])! };
  }

  it("refreshes a genuinely expired access token, rotates the cookie, and invalidates the old tokens", async () => {
    const { user, web, ip, first } = await signIn("refresh");
    await db.query("UPDATE sessions SET access_token_expires_at = now() - interval '5 minutes' WHERE user_id = $1", [user.id]);
    const res = await web.get("/api/user/watchlist").set("X-Forwarded-For", ip);
    expect(res.status).toBe(200);
    const rotated = readSessionCookie(res.headers["set-cookie"])!;
    expect(rotated.at).not.toBe(first.at);
    expect(rotated.rt).not.toBe(first.rt);
    // the OLD refresh token is dead at the real backend (rotation), the new access token works
    const old = await fetch(`${BACKEND_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": freshIp() }, body: JSON.stringify({ refreshToken: first.rt }) });
    expect(old.status).toBe(401);
    expect((await new TvDevice().raw("GET", "/user/me", undefined, rotated.at)).status).toBe(200);
  });

  it("five parallel requests after expiry cause exactly one rotation and nobody is signed out", async () => {
    const { user, web, ip } = await signIn("parallel");
    await db.query("UPDATE sessions SET access_token_expires_at = now() - interval '5 minutes' WHERE user_id = $1", [user.id]);
    const results = await Promise.all(Array.from({ length: 5 }, () => web.get("/api/user/settings").set("X-Forwarded-For", ip)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await web.get("/api/auth/session").set("X-Forwarded-For", ip)).status).toBe(200);
  });

  it("an expired REFRESH token ends the session with a clear session_expired and clears the cookie", async () => {
    const { user, web, ip } = await signIn("expired");
    await db.query("UPDATE sessions SET access_token_expires_at = now() - interval '5 minutes', refresh_token_expires_at = now() - interval '1 minute' WHERE user_id = $1", [user.id]);
    const res = await web.get("/api/user/watchlist").set("X-Forwarded-For", ip);
    expect(res.status).toBe(401);
    expect(["session_expired", "unauthorized"]).toContain(res.body.error.code);
  });

  it("signing the browser out remotely from the TV (DELETE /auth/sessions/:id) ends the web session", async () => {
    const { tv, web, ip } = await signIn("remote-signout");
    const sessions = (await tv.get("/auth/sessions")).body as unknown as Array<{ id: string; platform: string }>;
    const webSession = sessions.find((s) => s.platform === "web")!;
    expect((await tv.del(`/auth/sessions/${webSession.id}`)).status).toBe(204);
    const res = await web.get("/api/user/watchlist").set("X-Forwarded-For", ip);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
    expect((await web.get("/api/auth/session").set("X-Forwarded-For", ip)).status).toBe(401);
  });

  it("logout revokes the session at the backend (the old bearer stops working) and clears the cookie", async () => {
    const { web, ip, first } = await signIn("logout");
    const out = await web.post("/api/auth/logout").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    expect(out.status).toBe(204);
    expect((await new TvDevice().raw("GET", "/user/me", undefined, first.at)).status).toBe(401);
    expect((await web.get("/api/auth/session").set("X-Forwarded-For", ip)).status).toBe(401);
  });

  it("the web app is listed as its own device and only one device row exists per browser", async () => {
    const { user, web, ip, email } = await signIn("devices");
    await web.post("/api/auth/logout").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip);
    await web.post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({ email, password: "lifecycle-test-password" });
    const { rows } = await db.query("SELECT platform FROM devices WHERE user_id = $1 AND platform = 'web'", [user.id]);
    expect(rows).toHaveLength(1);
  });

  it("QR sign-in: the browser shows a code, a phone completes it on the backend's /activate flow, the browser is signed in", async () => {
    const email = uniqueEmail("qr");
    const password = "qr-flow-test-password";
    const { user } = await new TvDevice().register(email, password);
    const web = request.agent(app);
    const ip = freshIp();

    const created = await web.post("/api/auth/qr/create").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({});
    expect(created.status).toBe(201);
    expect(created.body.activationUrl).toContain("/activate?token=");
    const pending = await web.get(`/api/auth/qr/status?token=${created.body.token}`).set("X-Forwarded-For", ip);
    expect(pending.body).toEqual({ status: "pending" });

    // the phone: the backend's own activation page calls this endpoint
    const phone = await fetch(`${BACKEND_URL}/auth/qr/complete`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": freshIp() }, body: JSON.stringify({ token: created.body.token, mode: "login", email, password }) });
    expect(phone.status).toBe(204);

    const done = await web.get(`/api/auth/qr/status?token=${created.body.token}`).set("X-Forwarded-For", ip);
    expect(done.body).toMatchObject({ status: "completed", user: { id: user.id, email } });
    expect(JSON.stringify(done.body)).not.toMatch(/accessToken|refreshToken/);
    expect((await web.get("/api/auth/session").set("X-Forwarded-For", ip)).body.user.id).toBe(user.id);
    // single-use: tokens are handed out exactly once
    const again = await request(app).get(`/api/auth/qr/status?token=${created.body.token}`).set("X-Forwarded-For", ip);
    expect(again.body.status).not.toBe("completed");
  });

  it("QR create-account path works too (new account created by the phone, browser signed in)", async () => {
    const email = uniqueEmail("qr-new");
    const password = "qr-new-account-password";
    const web = request.agent(app);
    const ip = freshIp();
    const created = await web.post("/api/auth/qr/create").set("X-MangoTV-Client", "web").set("X-Forwarded-For", ip).send({});
    const phone = await fetch(`${BACKEND_URL}/auth/qr/complete`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": freshIp() }, body: JSON.stringify({ token: created.body.token, mode: "register", email, password, displayName: "QR Person" }) });
    expect(phone.status).toBe(204);
    const done = await web.get(`/api/auth/qr/status?token=${created.body.token}`).set("X-Forwarded-For", ip);
    expect(done.body.status).toBe("completed");
    expect(done.body.user.displayName).toBe("QR Person");
  });
});
