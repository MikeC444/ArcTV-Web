import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("health checks (what an uptime monitor pings)", () => {
  it("answers for this server alone, without touching the backend", async () => {
    const backend = createMockBackend();
    const res = await request(appWith(backend.fetch)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(backend.calls).toHaveLength(0);
  });

  it("?deep=1 also asks the backend, so one monitor keeps both awake — and says how the backend is", async () => {
    const backend = createMockBackend();
    const res = await request(appWith(backend.fetch)).get("/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", backend: "up" });
    expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /health"]);
    expect(backend.calls[0]!.timeoutMs).toBeGreaterThanOrEqual(20_000); // long enough for a sleeping backend to wake
  });

  it("still answers 200 (this server is up) when the backend is down, and says so", async () => {
    const backend = createMockBackend();
    backend.state.down = true;
    const res = await request(appWith(backend.fetch)).get("/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", backend: "down" });
  });

  it("asks the backend at most once a minute, however often it is pinged", async () => {
    const backend = createMockBackend();
    const app = appWith(backend.fetch);
    for (let i = 0; i < 5; i++) expect((await request(app).get("/api/health?deep=1")).body.backend).toBe("up");
    expect(backend.calls).toHaveLength(1);
  });
});

describe("telling visitors apart behind proxies (TRUST_PROXY)", () => {
  /** Ten sign-in attempts a minute are allowed per visitor address; this is the 11th, from the given X-Forwarded-For. */
  async function eleventh(trustProxy: number, forwardedFor: (n: number) => string) {
    const app = appWith(createMockBackend().fetch, { trustProxy });
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request(app).post("/api/auth/login").set("X-MangoTV-Client", "web").set("X-Forwarded-For", forwardedFor(i)).send({})).status;
    return last;
  }

  it("with one proxy trusted, a platform that adds a CDN's address makes every visitor look like the CDN (shared limit)", async () => {
    // visitors "10.0.0.<n>" all arrive through the same CDN address 198.51.100.7
    expect(await eleventh(1, (n) => `10.0.0.${n}, 198.51.100.7`)).toBe(429);
  });

  it("with the right number of proxies trusted, each visitor has their own allowance", async () => {
    expect(await eleventh(2, (n) => `10.0.0.${n}, 198.51.100.7`)).not.toBe(429);
    expect(await eleventh(1, (n) => `10.0.0.${n}`)).not.toBe(429); // one proxy, one address: also fine
  });

  it("says once, in the log, when TRUST_PROXY doesn't match the addresses a proxy sends — and when it does", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const wrong = appWith(createMockBackend().fetch, { trustProxy: 1 });
      await request(wrong).get("/api/health").set("X-Forwarded-For", "10.0.0.1, 198.51.100.7");
      await request(wrong).get("/api/health").set("X-Forwarded-For", "10.0.0.2, 198.51.100.7");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("set TRUST_PROXY=2");

      const right = appWith(createMockBackend().fetch, { trustProxy: 2 });
      await request(right).get("/api/health").set("X-Forwarded-For", "10.0.0.1, 198.51.100.7");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls.at(-1)![0])).toContain("read correctly");

      const direct = appWith(createMockBackend().fetch); // no proxy header at all: nothing to say
      await request(direct).get("/api/health");
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      log.mockRestore();
    }
  });
});

describe("sign-in 429s say in the log where they came from", () => {
  it("tells this server's own limit apart from the MangoTV service's, one line each per 30 s, with no address or account in it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 10 * 60_000); // past anything an earlier test noted
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const limited = (async (req: { path: string }) => (req.path === "/auth/login" ? { status: 429, json: { error: "Too many requests" }, retryAfter: "25" } : { status: 404, json: undefined, retryAfter: null })) as never;
      const app = appWith(limited);
      for (let i = 0; i < 3; i++) {
        const res = await request(app).post("/api/auth/login").set("X-MangoTV-Client", "web").send({ email: "secret.person@example.com", password: "password-1234" });
        expect(res.status).toBe(429);
      }
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]![0]);
      expect(line).toContain("MangoTV service refused a sign-in with HTTP 429");
      expect(line).toContain("Retry-After: 25");
      expect(line).not.toContain("secret.person");

      warn.mockClear();
      const plain = appWith(createMockBackend().fetch);
      for (let i = 0; i < 12; i++) await request(plain).post("/api/auth/login").set("X-MangoTV-Client", "web").send({});
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("This server's own limit was reached");

      warn.mockClear();
      vi.setSystemTime(Date.now() + 31_000); // a new 30 s window: it speaks again
      await request(app).post("/api/auth/login").set("X-MangoTV-Client", "web").send({ email: "a@example.com", password: "password-1234" });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });
});
