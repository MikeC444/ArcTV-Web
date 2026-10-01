import { describe, expect, it, vi } from "vitest";
import { buildRelayUrl, isRelayUrl, needsRelay, playbackUrl, relayRefusal } from "./relay";

describe("relay addresses (adapted from stremio-video's buildProxyUrl)", () => {
  it("keeps Stremio's shape: d=<origin>&h=…&r=… first, then the stream's own path and query", () => {
    const url = buildRelayUrl("https://cdn.example.com:8443/a/b%20c/movie.mkv?sig=abc&x=1", { Referer: "https://r.example/", "X-Token": "t" }, { "Content-Type": "video/mp4" });
    expect(url).toBe("/api/relay/d=https%3A%2F%2Fcdn.example.com%3A8443&h=Referer%3Ahttps%3A%2F%2Fr.example%2F&h=X-Token%3At&r=Content-Type%3Avideo%2Fmp4/a/b%20c/movie.mkv?sig=abc&x=1");
    expect(isRelayUrl(url)).toBe(true);
  });

  it("works without headers, and keeps the path's extension so the engine is still picked correctly", () => {
    const url = buildRelayUrl("https://cdn.example.com/hls/master.m3u8");
    expect(url).toBe("/api/relay/d=https%3A%2F%2Fcdn.example.com/hls/master.m3u8");
    expect(url.endsWith(".m3u8")).toBe(true);
  });

  it("round-trips through URLSearchParams the way the server reads it", () => {
    const url = buildRelayUrl("https://cdn.example.com/p?q=1", { "X-A": "b:c" });
    const optionsSegment = url.slice("/api/relay/".length).split("/")[0]!;
    const params = new URLSearchParams(optionsSegment);
    expect(params.get("d")).toBe("https://cdn.example.com");
    expect(params.getAll("h")).toEqual(["X-A:b:c"]);
  });

  it("only streams the browser can't fetch itself need the relay: special headers, or plain http behind an https page", () => {
    expect(needsRelay({ url: "https://x/v.mp4", proxyHeaders: null }, "https:")).toBe(false);
    expect(needsRelay({ url: "https://x/v.mp4", proxyHeaders: {} }, "https:")).toBe(false);
    expect(needsRelay({ url: "https://x/v.mp4", proxyHeaders: { Referer: "r" } }, "https:")).toBe(true);
    expect(needsRelay({ url: "http://x/v.mp4" }, "https:")).toBe(true);
    expect(needsRelay({ url: "http://x/v.mp4" }, "http:")).toBe(false);
    expect(needsRelay({ url: null, proxyHeaders: { Referer: "r" } }, "https:")).toBe(false);
    expect(needsRelay({ url: "magnet:?xt=urn:btih:abc" }, "https:")).toBe(false);
  });

  it("chooses the address for a route, forwarding the addon's headers only through the relay", () => {
    const stream = { url: "https://cdn.example.com/v.mp4", proxyHeaders: { Referer: "r" }, proxyResponseHeaders: { "Content-Type": "video/mp4" } };
    expect(playbackUrl(stream, "direct")).toBe("https://cdn.example.com/v.mp4");
    expect(playbackUrl(stream, "relay")).toContain("h=Referer%3Ar");
    expect(playbackUrl(stream, "relay")).toContain("r=Content-Type%3Avideo%2Fmp4");
  });
});

describe("relayRefusal — the relay's own explanation, which a <video> can't read", () => {
  const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it("returns the server's message when the relay was refused", async () => {
    const fetchImpl = vi.fn(async () => json(502, { error: { code: "upstream_error", message: "The stream host answered HTTP 403 (from torrentio.strem.fun; server: cloudflare)." } }));
    expect(await relayRefusal("/api/relay/d=x/y", { fetchImpl: fetchImpl as unknown as typeof fetch })).toContain("HTTP 403 (from torrentio.strem.fun");
    expect(fetchImpl).toHaveBeenCalledWith("/api/relay/d=x/y", expect.objectContaining({ headers: { Range: "bytes=0-0" }, credentials: "same-origin" }));
  });

  it("returns null when the relay works (the failure was something else), when it can't be read, or when the message is junk", async () => {
    expect(await relayRefusal("/api/relay/d=x/y", { fetchImpl: (async () => json(206, {})) as unknown as typeof fetch })).toBeNull();
    expect(await relayRefusal("/api/relay/d=x/y", { fetchImpl: (async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch })).toBeNull();
    expect(await relayRefusal("/api/relay/d=x/y", { fetchImpl: (async () => json(502, { error: { message: "x".repeat(2000) } })) as unknown as typeof fetch })).toBeNull();
    expect(await relayRefusal("/api/relay/d=x/y", { fetchImpl: (async () => ({ ok: false, status: 502, json: async () => Promise.reject(new Error("not json")) }) as unknown as Response) as unknown as typeof fetch })).toBeNull();
  });
});
