import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { agentFor, appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

let upstream: http.Server;
let base: string;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    if (req.url === "/manifest.json") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ id: "test.addon", name: "Test", version: "1.0.0" }));
    } else if (req.url === "/redirect") {
      res.statusCode = 302;
      res.setHeader("Location", "/manifest.json");
      res.end();
    } else if (req.url === "/html") {
      res.setHeader("Content-Type", "text/html");
      res.end("<html>not json</html>");
    } else if (req.url === "/huge") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ blob: "x".repeat(3 * 1024 * 1024) }));
    } else {
      res.statusCode = 500;
      res.end("boom");
    }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => upstream.close(() => resolve())));

async function client(allowPrivate: boolean) {
  const backend = createMockBackend();
  backend.addUser("a@example.com", "password-1234");
  const c = agentFor(appWith(backend.fetch, { allowPrivateAddonHosts: allowPrivate }));
  await c.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
  return c;
}

describe("addon fetch fallback", () => {
  it("requires a signed-in session", async () => {
    const backend = createMockBackend();
    const res = await request(appWith(backend.fetch, { allowPrivateAddonHosts: true })).get(`/api/addon-proxy?url=${encodeURIComponent(base + "/manifest.json")}`);
    expect(res.status).toBe(401);
  });

  it("fetches JSON, follows redirects", async () => {
    const c = await client(true);
    const ok = await c.get(`/api/addon-proxy?url=${encodeURIComponent(base + "/manifest.json")}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: "test.addon", name: "Test", version: "1.0.0" });
    const redirected = await c.get(`/api/addon-proxy?url=${encodeURIComponent(base + "/redirect")}`);
    expect(redirected.body.id).toBe("test.addon");
  });

  it("refuses non-JSON, oversized, failing and malformed upstreams with clear errors", async () => {
    const c = await client(true);
    expect((await c.get(`/api/addon-proxy?url=${encodeURIComponent(base + "/html")}`)).status).toBe(502);
    expect((await c.get(`/api/addon-proxy?url=${encodeURIComponent(base + "/huge")}`)).status).toBe(502);
    expect((await c.get(`/api/addon-proxy?url=${encodeURIComponent(base + "/nope")}`)).status).toBe(502);
    expect((await c.get("/api/addon-proxy?url=not-a-url")).status).toBe(400);
    expect((await c.get("/api/addon-proxy")).status).toBe(400);
  });

  describe("SSRF protection (production settings)", () => {
    it.each([
      "http://127.0.0.1:8080/manifest.json",
      "http://localhost/manifest.json",
      "http://10.0.0.5/manifest.json",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/manifest.json",
      "http://[::ffff:127.0.0.1]/manifest.json",
      "file:///etc/passwd",
      "ftp://example.com/manifest.json",
      "http://user:pass@example.com/manifest.json",
    ])("blocks %s", async (target) => {
      const c = await client(false);
      const res = await c.get(`/api/addon-proxy?url=${encodeURIComponent(target)}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
      expect(JSON.stringify(res.body)).not.toContain("root:");
    });

    it("blocks a hostname that resolves to loopback (DNS is checked at connect time)", async () => {
      const c = await client(false);
      const res = await c.get(`/api/addon-proxy?url=${encodeURIComponent(base.replace("127.0.0.1", "localhost"))}%2Fmanifest.json`);
      expect(res.status).toBe(502);
      expect(res.body).not.toHaveProperty("id");
    });
  });
});
