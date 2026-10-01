import request from "supertest";
import { describe, expect, it } from "vitest";
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
