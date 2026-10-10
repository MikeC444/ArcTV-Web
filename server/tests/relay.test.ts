import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { parseRelayPath, validateUrl } from "../src/streamRelay.js";
import { agentFor, appWith, setCookies } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

/** Builds the same URL shape as the client (and Stremio's /proxy/): /api/relay/d=<origin>&h=…&r=…/<path>?<query>. */
function relayUrl(target: string, headers: Record<string, string> = {}, responseHeaders: Record<string, string> = {}): string {
  const url = new URL(target);
  const options = new URLSearchParams();
  options.set("d", url.origin);
  for (const [name, value] of Object.entries(headers)) options.append("h", `${name}:${value}`);
  for (const [name, value] of Object.entries(responseHeaders)) options.append("r", `${name}:${value}`);
  return `/api/relay/${options.toString()}${url.pathname}${url.search}`;
}

const MOVIE = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
let upstream: http.Server;
let other: http.Server; // a second origin, to prove headers aren't passed across a redirect
let base: string;
let otherBase: string;
const seen: Record<string, http.IncomingHttpHeaders> = {};
let hangingClosed = 0;
const hanging: http.ServerResponse[] = [];

const listen = (server: http.Server) => new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));

beforeAll(async () => {
  other = http.createServer((req, res) => {
    seen.other = req.headers;
    if (req.url === "/refuse") {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end('{"error":"ip_not_allowed","help":"https://secret.example/key=abc"}');
    }
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": MOVIE.length });
    res.end(MOVIE);
  });
  otherBase = await listen(other);
  upstream = http.createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    seen[path ?? ""] = req.headers;
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    switch (path) {
      case "/movie.mp4":
        if (range) {
          const start = Number(range[1] || 0);
          const end = Math.min(Number(range[2] || MOVIE.length - 1), MOVIE.length - 1);
          res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${MOVIE.length}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes", "Set-Cookie": "tracker=1", "Content-Disposition": 'attachment; filename="x.mp4"' });
          return res.end(MOVIE.subarray(start, end + 1));
        }
        res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": MOVIE.length, "Accept-Ranges": "bytes", "Set-Cookie": "tracker=1", "Content-Disposition": 'attachment; filename="x.mp4"' });
        return res.end(MOVIE);
      case "/untyped":
        res.writeHead(200); // no content type at all
        return res.end(MOVIE);
      case "/show.mkv":
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        return res.end(MOVIE);
      case "/hop":
        res.writeHead(302, { Location: `${otherBase}/final.mp4` });
        return res.end();
      case "/local-hop":
        res.writeHead(302, { Location: "/movie.mp4" });
        return res.end();
      case "/to-private":
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
        return res.end();
      case "/page.html":
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<script>alert(1)</script>");
      case "/data.json":
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end("{}");
      case "/refused":
        res.writeHead(403, { "Content-Type": "text/html", Server: "cloudflare", "cf-mitigated": "challenge" });
        return res.end("<html><title>Attention Required!</title>Sorry, you have been blocked. See https://secret.example/key=abc\u2014 Cloudflare</html>");
      case "/blocked-page": // like a CDN's block page: a long head, cut off mid-tag by the relay's 400-byte peek
        res.writeHead(403, { "Content-Type": "text/html; charset=UTF-8", Server: "cloudflare" });
        return res.end(`<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title>${"<!-- filler -->".repeat(30)}<meta name="viewport" content="width=device-width"></head></html>`);
      case "/hop-refused":
        res.writeHead(302, { Location: `${otherBase}/refuse` });
        return res.end();
      case "/missing":
        res.writeHead(404);
        return res.end("nope");
      case "/bad-range":
        res.writeHead(416, { "Content-Range": `bytes */${MOVIE.length}` });
        return res.end();
      case "/hang":
        res.writeHead(200, { "Content-Type": "video/mp4" });
        res.write(MOVIE.subarray(0, 100));
        hanging.push(res);
        res.on("close", () => hangingClosed++);
        return; // never finishes
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  base = await listen(upstream);
});

afterAll(async () => {
  hanging.forEach((r) => r.destroy());
  await Promise.all([upstream, other].map((s) => new Promise((resolve) => s.close(resolve))));
});

async function signedIn(overrides = {}) {
  const backend = createMockBackend();
  backend.addUser("a@example.com", "password-1234");
  const app = appWith(backend.fetch, { allowPrivateAddonHosts: true, ...overrides });
  const client = agentFor(app);
  const login = await client.post("/api/auth/login").send({ email: "a@example.com", password: "password-1234" });
  return { app, client, login };
}

describe("stream relay", () => {
  it("needs a signed-in session", async () => {
    const { app } = await signedIn();
    const res = await request(app).get(relayUrl(`${base}/movie.mp4`));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("only answers requests that come from this site (a link on another site can't make the server download for a signed-in visitor)", async () => {
    const { client } = await signedIn();
    for (const site of ["cross-site", "same-site", "none"]) {
      const res = await client.get(relayUrl(`${base}/movie.mp4`)).set("Sec-Fetch-Site", site);
      expect(res.status, site).toBe(403);
    }
    expect((await client.get(relayUrl(`${base}/movie.mp4`)).set("Sec-Fetch-Site", "same-origin")).status).toBe(200);
  });

  it("passes the video bytes through and keeps the response safe (no cookies, no download prompt, nosniff + sandbox)", async () => {
    const { client } = await signedIn();
    const res = await client.get(relayUrl(`${base}/movie.mp4`)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(Number(res.headers["content-length"])).toBe(MOVIE.length);
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect((res.body as Buffer).equals(MOVIE)).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined(); // the upstream's cookies never reach the browser
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("honours Range so seeking works, and asks the upstream like a native player (no Referer / Origin, identity encoding)", async () => {
    const { client } = await signedIn();
    const res = await client.get(relayUrl(`${base}/movie.mp4`)).set("Range", "bytes=10-19").set("Referer", "https://app.example/").set("Origin", "https://app.example").buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe(`bytes 10-19/${MOVIE.length}`);
    expect((res.body as Buffer).equals(MOVIE.subarray(10, 20))).toBe(true);
    const sent = seen["/movie.mp4"]!;
    expect(sent.range).toBe("bytes=10-19");
    expect(sent.referer).toBeUndefined();
    expect(sent.origin).toBeUndefined();
    expect(sent.cookie).toBeUndefined(); // our session cookie is never passed on
    expect(sent["accept-encoding"]).toBe("identity");
    expect(String(sent["user-agent"])).toContain("ArcTV-Web");
  });

  it("sends the addon's proxyHeaders to the stream host, and lets it override the content type", async () => {
    const { client } = await signedIn();
    const res = await client.get(relayUrl(`${base}/show.mkv`, { Referer: "https://cdn.example/", "X-Token": "let-me-in" }, { "Content-Type": "video/x-matroska" }));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("video/x-matroska");
    expect(seen["/show.mkv"]!.referer).toBe("https://cdn.example/");
    expect(seen["/show.mkv"]!["x-token"]).toBe("let-me-in");
  });

  it("follows redirects but never hands the addon's headers to a different site", async () => {
    const { client } = await signedIn();
    const res = await client.get(relayUrl(`${base}/hop`, { "X-Token": "secret" }));
    expect(res.status).toBe(200);
    expect(seen["/hop"]!["x-token"]).toBe("secret"); // first origin gets them
    expect(seen.other!["x-token"]).toBeUndefined(); // the redirect target does not
    const same = await client.get(relayUrl(`${base}/local-hop`, { "X-Token": "secret" }));
    expect(same.status).toBe(200);
  });

  it("checks the destination at connect time too, so a hostname that resolves to a private address is refused", async () => {
    const { client } = await signedIn({ allowPrivateAddonHosts: false });
    // "localhost" is a hostname (not an IP literal), so only the connect-time check can catch it
    delete seen["/movie.mp4"];
    const res = await client.get(relayUrl(`http://localhost:${new URL(base).port}/movie.mp4`));
    expect(res.status).toBe(502);
    expect(seen["/movie.mp4"]).toBeUndefined(); // the upstream was never contacted
  });

  it("uses one validator for the first request and every redirect hop (private / metadata / loopback / self / credentials)", () => {
    for (const bad of ["http://169.254.169.254/latest", "http://127.0.0.1/x", "http://10.1.2.3/x", "http://[::1]/x", "http://[::ffff:127.0.0.1]/x", "ftp://example.com/x", "https://user:pw@example.com/x"]) {
      expect(() => validateUrl(new URL(bad), false, undefined), bad).toThrow();
    }
    expect(() => validateUrl(new URL("https://cdn.example.com/x"), false, "cdn.example.com")).toThrow(); // itself
    expect(() => validateUrl(new URL("https://cdn.example.com/x"), false, "app.example.com")).not.toThrow();
  });

  it("refuses private addresses unless the test-only flag is on, credentials in the URL, this server itself, and forbidden headers", async () => {
    const { client } = await signedIn({ allowPrivateAddonHosts: false });
    expect((await client.get(relayUrl("http://127.0.0.1:9/movie.mp4"))).status).toBe(400);
    expect((await client.get(relayUrl("http://10.0.0.5/movie.mp4"))).status).toBe(400);
    expect((await client.get(relayUrl("http://[::1]/movie.mp4"))).status).toBe(400);
    expect((await client.get(relayUrl("http://169.254.169.254/latest/meta-data"))).status).toBe(400);

    const { client: permissive } = await signedIn();
    const withCreds = await permissive.get(`/api/relay/d=${encodeURIComponent(`http://user:pw@127.0.0.1:${new URL(base).port}`)}/movie.mp4`);
    expect(withCreds.status).toBe(400);
    for (const header of ["Host", "Content-Length", "Transfer-Encoding", "Range", "Connection", "Proxy-Authorization", "X-Forwarded-For", "Sec-Fetch-Mode"]) {
      const res = await permissive.get(relayUrl(`${base}/movie.mp4`, { [header]: "x" }));
      expect(res.status, header).toBe(400);
    }
    const self = await permissive.get(relayUrl(`${base}/movie.mp4`)).set("Host", new URL(base).host);
    expect(self.status).toBe(400); // pointing the relay at the host that serves it
    expect((await permissive.get(relayUrl(`${base}/movie.mp4`, {}, { "Set-Cookie": "a=b" }))).status).toBe(400); // only content-type may be overridden
  });

  it("only relays media — HTML and JSON from a hostile host are refused, and an untyped file is served as video by its extension", async () => {
    const { client } = await signedIn();
    const html = await client.get(relayUrl(`${base}/page.html`));
    expect(html.status).toBe(502);
    expect(html.body.error.message).toContain("isn't video");
    expect((await client.get(relayUrl(`${base}/data.json`))).status).toBe(502);
    const untyped = await client.get(relayUrl(`${base}/untyped`));
    expect(untyped.status).toBe(200);
    expect(untyped.headers["content-type"]).toBe("application/octet-stream");
  });

  it("turns upstream failures into a clear 502, and passes 416 through", async () => {
    const { client } = await signedIn();
    const missing = await client.get(relayUrl(`${base}/missing`));
    expect(missing.status).toBe(502);
    expect(missing.body.error.message).toContain("HTTP 404");
    const badRange = await client.get(relayUrl(`${base}/bad-range`)).set("Range", "bytes=99999-");
    expect(badRange.status).toBe(416);
    const down = await client.get(relayUrl("http://127.0.0.1:1/x.mp4"));
    expect(down.status).toBe(502);
  });

  it("says who refused and how when the stream host answers 403 — host, redirects, a few headers, the first words of its answer; never the path or a link", async () => {
    const { client } = await signedIn();
    const direct = await client.get(relayUrl(`${base}/refused`));
    expect(direct.status).toBe(502);
    const message = direct.body.error.message as string;
    expect(message).toContain(`HTTP 403 (from ${new URL(base).host}`);
    expect(message).toContain("server: cloudflare");
    expect(message).toContain("a bot check was demanded");
    expect(message).toContain("Attention Required!");
    expect(message).not.toMatch(/secret\.example|key=abc|\/refused/);

    const page = await client.get(relayUrl(`${base}/blocked-page`));
    expect(page.body.error.message).toContain('it said: "Attention Required! | Cloudflare")'); // the page's title, not a torn-off tag
    expect(page.body.error.message).not.toContain("<");

    const viaRedirect = await client.get(relayUrl(`${base}/hop-refused`));
    expect(viaRedirect.status).toBe(502);
    expect(viaRedirect.body.error.message).toContain(`from ${new URL(otherBase).host} after 1 redirect`);
    expect(viaRedirect.body.error.message).toContain("ip_not_allowed");
    expect(viaRedirect.body.error.message).toContain("<link>"); // a link in the host's answer can carry a key, so it is never passed on
    expect(viaRedirect.body.error.message).not.toMatch(/secret\.example|key=abc/);
  });

  it("rejects unsupported Range headers (multi-range) and malformed relay addresses", async () => {
    const { client } = await signedIn();
    expect((await client.get(relayUrl(`${base}/movie.mp4`)).set("Range", "bytes=0-1,5-9")).status).toBe(416);
    expect((await client.get("/api/relay/nonsense")).status).toBe(400);
    expect((await client.get("/api/relay/d=not-a-url/x.mp4")).status).toBe(400);
    expect((await client.get(`/api/relay/d=${encodeURIComponent("ftp://example.com")}/x.mp4`)).status).toBe(400);
  });

  it("can be switched off entirely (STREAM_RELAY=0)", async () => {
    const { client } = await signedIn({ streamRelay: false });
    const res = await client.get(relayUrl(`${base}/movie.mp4`));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("relay_disabled");
  });

  it("stops downloading when the player goes away, and caps concurrent streams per account", async () => {
    const { app, login } = await signedIn();
    const cookie = setCookies(login).map((c) => c.split(";")[0]).join("; ");
    const server = http.createServer(app);
    const origin = await listen(server);
    const open = () =>
      new Promise<http.ClientRequest>((resolve) => {
        const req = http.get(`${origin}${relayUrl(`${base}/hang`)}`, { headers: { cookie } }, (res) => {
          res.once("data", () => resolve(req)); // wait for the first bytes so the slot is definitely held
        });
        req.on("error", () => undefined);
      });
    const streams: http.ClientRequest[] = [];
    for (let i = 0; i < 6; i++) streams.push(await open());
    const seventh = await new Promise<number>((resolve) => http.get(`${origin}${relayUrl(`${base}/hang`)}`, { headers: { cookie } }, (res) => resolve(res.statusCode ?? 0)).on("error", () => resolve(0)));
    expect(seventh).toBe(429);

    const before = hangingClosed;
    streams.forEach((s) => s.destroy()); // the viewer closes the tab
    await new Promise((r) => setTimeout(r, 400));
    expect(hangingClosed).toBeGreaterThan(before); // the upstream connections were dropped, not left downloading
    const again = await new Promise<number>((resolve) => http.get(`${origin}${relayUrl(`${base}/movie.mp4`)}`, { headers: { cookie } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); }).on("error", () => resolve(0)));
    expect(again).toBe(200); // slots were released
    await new Promise((r) => server.close(r));
  });
});

describe("relay address parsing", () => {
  const opts = { allowPrivateHosts: false };
  it("round-trips the Stremio-style scheme", () => {
    const parsed = parseRelayPath(relayUrl("https://cdn.example.com/a/b%20c/movie.mkv?sig=abc&x=1", { Referer: "https://r.example/" }, { "Content-Type": "video/mp4" }), opts);
    expect(parsed.url.toString()).toBe("https://cdn.example.com/a/b%20c/movie.mkv?sig=abc&x=1");
    expect(parsed.requestHeaders).toEqual([["referer", "https://r.example/"]]);
    expect(parsed.responseHeaders).toEqual([["content-type", "video/mp4"]]);
  });

  it("a path that starts with // can never change the host", () => {
    const parsed = parseRelayPath("/api/relay/d=https%3A%2F%2Fcdn.example.com//evil.example/x.mp4", opts);
    expect(parsed.url.host).toBe("cdn.example.com");
    expect(parsed.url.pathname).toBe("//evil.example/x.mp4");
  });

  it("refuses anything that isn't a relay address or is oversized", () => {
    expect(() => parseRelayPath("/api/other/d=x", opts)).toThrow();
    expect(() => parseRelayPath(`/api/relay/d=https%3A%2F%2Fa.example/${"x".repeat(5000)}`, opts)).toThrow();
    expect(() => parseRelayPath("/api/relay/d=https%3A%2F%2Fa.example%2Fpath/x", opts)).toThrow(); // the origin part must be an origin
  });
});
