import { describe, expect, it, vi } from "vitest";
import { buildCompatUrl, buildRelayUrl, fetchCompatInfo, isRelayUrl, needsRelay, playbackUrl, relayRefusal } from "./relay";
import { canDecodeAudioCodec, detectDeviceCaps } from "./deviceSupport";

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

describe("audio compatibility mode (client side)", () => {
  const stream = { url: "https://cdn.example.com/m.mkv?sig=1", proxyHeaders: { Referer: "https://r.example/" }, proxyResponseHeaders: undefined };

  it("addresses the converted stream by the relay address of the source, with an optional start (seconds)", () => {
    const relay = buildRelayUrl(stream.url, stream.proxyHeaders);
    expect(buildCompatUrl(stream)).toBe(`/api/transcode?src=${encodeURIComponent(relay)}`);
    expect(buildCompatUrl(stream, 0)).not.toContain("start");
    expect(buildCompatUrl(stream, 754.3216)).toBe(`/api/transcode?src=${encodeURIComponent(relay)}&start=754.322`);
  });

  const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it("asks the server what is in the source, and tells apart 'this server can't' from 'it didn't work'", async () => {
    const info = { durationSeconds: 5400, video: "h264", audio: [{ codec: "eac3", language: "eng" }], output: "mp4" };
    const seen: string[] = [];
    const ok = (async (url: string) => (seen.push(url), json(200, info))) as unknown as typeof fetch;
    expect(await fetchCompatInfo(stream, { fetchImpl: ok })).toEqual({ kind: "ok", info });
    expect(seen[0]).toBe(`/api/transcode/info?src=${encodeURIComponent(buildRelayUrl(stream.url, stream.proxyHeaders))}`);

    expect(await fetchCompatInfo(stream, { fetchImpl: (async () => json(404, { error: { code: "transcode_disabled" } })) as unknown as typeof fetch })).toEqual({ kind: "unavailable" });
    expect(await fetchCompatInfo(stream, { fetchImpl: (async () => json(502, { error: { message: "The source couldn't be read as video." } })) as unknown as typeof fetch })).toEqual({ kind: "failed", message: "The source couldn't be read as video." });
    expect(await fetchCompatInfo(stream, { fetchImpl: (async () => json(503, null)) as unknown as typeof fetch })).toEqual({ kind: "failed", message: "The server answered 503." });
    expect((await fetchCompatInfo(stream, { fetchImpl: (async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch })).kind).toBe("failed");
  });

  it("knows which audio codecs a device can decode (and says nothing about ones it has no test for)", () => {
    const env = (supported: RegExp[]) => ({ canPlayType: (t: string) => (supported.some((r) => r.test(t)) ? ("probably" as const) : ("" as const)), hasMediaSource: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
    const chrome = detectDeviceCaps(env([/mp4a\.40\.2/, /opus/]));
    expect(canDecodeAudioCodec("aac", chrome)).toBe(true);
    expect(canDecodeAudioCodec("eac3", chrome)).toBe(false);
    expect(canDecodeAudioCodec("truehd", chrome)).toBe(false);
    expect(canDecodeAudioCodec("vorbis", chrome)).toBeNull();
  });
});
