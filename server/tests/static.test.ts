import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

describe("static SPA hosting", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "mtv-static-"));
    fs.mkdirSync(path.join(dir, "assets"));
    fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>MangoTV</title>");
    fs.writeFileSync(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = () => appWith(createMockBackend().fetch, { staticDir: dir });

  it("serves the app shell for client-side routes (deep links)", async () => {
    for (const route of ["/", "/movies", "/detail/x/MOVIE/tt1", "/player/a/b/c/-1/-1/s", "/movies/inception-tt1375666", "/tv-shows/prison-break-tt0455275", "/player/com.linvo.cinemeta/MOVIE/tt0068646/-1/-1/com.stremio.torrentio.addon%3A-945807928"]) {
      const res = await request(app()).get(route).set("Accept", "text/html");
      expect(res.status, route).toBe(200);
      expect(res.text).toContain("<title>MangoTV</title>");
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("serves hashed assets as immutable, and 404s a missing asset instead of returning HTML", async () => {
    const ok = await request(app()).get("/assets/app-abc123.js");
    expect(ok.status).toBe(200);
    expect(ok.headers["cache-control"]).toMatch(/immutable/);
    const missing = await request(app()).get("/assets/app-gone.js").set("Accept", "*/*");
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain("MangoTV"); // not the app shell
    expect((await request(app()).get("/favicon.ico").set("Accept", "*/*")).status).toBe(404);
  });

  it("never falls through to the SPA for /api paths", async () => {
    const res = await request(app()).get("/api/does-not-exist").set("Accept", "text/html");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("sets the security headers (CSP without inline scripts, no framing)", async () => {
    const res = await request(app()).get("/").set("Accept", "text/html");
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // media, image and addon requests to other sites must not reveal where the app is hosted
    expect(res.headers["referrer-policy"]).toBe("same-origin");
  });
});
