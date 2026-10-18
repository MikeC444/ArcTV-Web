import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { LIVE_CHECK_MS } from "../src/context.js";
import { agentFor, appWith, setCookies } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

/**
 * The routes this server answers itself (relay, addon proxy, TV guide, cached TMDB lookups) must stop working once the session is signed
 * out at the backend, not keep going for as long as the cookie opens. The cached trailer lookup stands in for all of them here: it goes
 * through the same check, and needs no upstream server.
 */
const TRAILER = "/api/user/trailer?title=Heat&type=MOVIE";

async function signedIn() {
  const backend = createMockBackend();
  backend.addUser("a@example.com", "password-1234");
  const app = appWith(backend.fetch);
  const client = agentFor(app);
  const login = await client.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
  const cookie = setCookies(login).map((line) => line.split(";")[0]).join("; ");
  return { backend, app, client, cookie };
}

const meChecks = (backend: ReturnType<typeof createMockBackend>) => backend.calls.filter((c) => c.path === "/user/me").length;

afterEach(() => {
  vi.useRealTimers();
});

describe("a session signed out at the backend", () => {
  it("is refused at once when it hasn't been checked yet", async () => {
    const { backend, client } = await signedIn();
    backend.revokeAllSessions();
    const res = await client.get(TRAILER);
    expect(res.status).toBe(401);
    expect(setCookies(res).some((line) => line.startsWith("mtv_session=;"))).toBe(true);
  });

  it("is refused within a minute of being signed out elsewhere", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { backend, client } = await signedIn();
    expect((await client.get(TRAILER)).status).toBe(200);
    backend.revokeAllSessions();
    expect((await client.get(TRAILER)).status).toBe(200); // still inside the window
    vi.setSystemTime(Date.now() + LIVE_CHECK_MS + 1_000);
    expect((await client.get(TRAILER)).status).toBe(401);
  });

  it("is asked about at most once a minute", async () => {
    const { backend, client } = await signedIn();
    for (let i = 0; i < 5; i++) expect((await client.get(TRAILER)).status).toBe(200);
    expect(meChecks(backend)).toBe(1);
  });

  it("stops working for a copied cookie as soon as this browser signs out", async () => {
    const { backend, app, client, cookie } = await signedIn();
    expect((await request(app).get(TRAILER).set("Cookie", cookie)).status).toBe(200);
    expect((await client.post("/api/auth/logout")).status).toBe(204);
    backend.revokeAllSessions(); // what the real backend's /auth/logout does to this session
    expect((await request(app).get(TRAILER).set("Cookie", cookie)).status).toBe(401);
  });

  it("keeps working while the backend can't be reached", async () => {
    const { backend, client } = await signedIn();
    backend.state.down = true;
    const res = await client.post("/api/epg/guide").send({ source: "XX9", channels: [{ key: "a", name: "A" }] });
    expect(res.status).toBe(400); // past the session check, refused only for the made-up source
  });
});

describe("routes guarded by the live check", () => {
  it.each([
    ["the relay", (c: ReturnType<typeof agentFor>) => c.get("/api/relay/d=https%3A%2F%2Fexample.com/movie.mp4")],
    ["the addon proxy", (c: ReturnType<typeof agentFor>) => c.get(`/api/addon-proxy?url=${encodeURIComponent("https://example.com/manifest.json")}`)],
    ["the TV guide", (c: ReturnType<typeof agentFor>) => c.post("/api/epg/guide").send({ source: "UK1", channels: [{ key: "a", name: "A" }] })],
  ])("refuse %s for a revoked session", async (_name, call) => {
    const { backend, client } = await signedIn();
    backend.revokeAllSessions();
    expect((await call(client)).status).toBe(401);
  });
});
