import { describe, expect, it, vi } from "vitest";
import { describeAttempt, describeDiagnostics, probeSource, safeSourceLabel, type VideoSnapshot } from "./diagnostics";
import { detectDeviceCaps, deviceVerdict } from "../../domain/deviceSupport";
import type { Stream } from "../../domain/types";

const stream: Stream = {
  id: "s",
  providerId: "p",
  providerLabel: "P",
  resolutionTier: "FHD_1080P",
  qualityBadge: "1080p",
  releaseTitle: "Movie.2024.1080p.BluRay.x265.DDP5.1",
  descriptor: "Movie.2024.1080p.BluRay.x265.DDP5.1",
  url: "https://torrentio.example/resolve/realdebrid/SUPER-SECRET-KEY/abcdef/null/0/Movie.2024.1080p.mkv?token=ALSO-SECRET",
};
const caps = detectDeviceCaps({ canPlayType: (t) => (/avc1|video\/mp4$/.test(t) ? "probably" : ""), hasMediaSource: true, userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" });
const snapshot: VideoSnapshot = { networkState: 2, readyState: 0, error: null, duration: NaN, videoWidth: 0, videoHeight: 0, paused: true, buffered: [] };

describe("player diagnostics", () => {
  it("keeps only the host and file type of the link — never its path, query or any key in them", () => {
    expect(safeSourceLabel(stream.url)).toEqual({ host: "torrentio.example", ext: "mkv" });
    const text = describeDiagnostics({ stream, snapshot, engine: "native", trail: [{ at: 3, name: "loadstart" }, { at: 3100, name: "suspend" }], verdict: deviceVerdict(stream, caps, "https:"), browser: "Chrome", userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36" });
    expect(text).not.toMatch(/SECRET|realdebrid|abcdef|token/i);
    expect(text).toContain("server torrentio.example, file type .mkv, engine native");
    expect(text).toContain("network LOADING, ready HAVE_NOTHING");
    expect(text).toContain("+3ms loadstart, +3100ms suspend");
    expect(text).toContain("video hevc");
    expect(text).toContain("Can't play here");
  });

  it("says whether the debrid service had the file ready", () => {
    const base = { snapshot, engine: "native", trail: [], verdict: deviceVerdict(stream, caps, "https:"), browser: "Chrome", userAgent: "" };
    expect(describeDiagnostics({ ...base, stream: { ...stream, debrid: { service: "RD", cached: true } } })).toContain("Debrid: Real-Debrid, marked cached");
    expect(describeDiagnostics({ ...base, stream: { ...stream, debrid: { service: "RD", cached: false } } })).toContain("marked NOT cached (the service has to fetch it first)");
    expect(describeDiagnostics({ ...base, stream })).not.toContain("Debrid:");
  });

  it("says so plainly when the browser reported nothing at all", () => {
    const text = describeDiagnostics({ stream, snapshot: null, engine: "hls", trail: [], verdict: deviceVerdict(stream, caps, "https:"), browser: "Chrome", userAgent: "" });
    expect(text).toContain("none — the browser never reported anything for this source");
    expect(safeSourceLabel("not a url")).toEqual({ host: "unknown", ext: "none" });
  });

  it("includes the media error code and message when there is one", () => {
    const text = describeDiagnostics({ stream, snapshot: { ...snapshot, readyState: 1, error: { code: 4, message: "DEMUXER_ERROR_COULD_NOT_OPEN" } }, engine: "native", trail: [], verdict: deviceVerdict(stream, caps, "https:"), browser: "Chrome", userAgent: "" });
    expect(text).toContain("Media error: SRC_NOT_SUPPORTED — DEMUXER_ERROR_COULD_NOT_OPEN");
  });
});

describe("the direct attempt that the relay replaced", () => {
  it("is kept as one line, so the evidence from the first request isn't lost with its event trail", () => {
    const line = describeAttempt(snapshot, [{ at: 3, name: "loadstart" }, { at: 3200, name: "stalled" }]);
    expect(line).toBe("network LOADING, ready HAVE_NOTHING, nothing buffered, no media error; events: +3ms loadstart, +3200ms stalled");
    const text = describeDiagnostics({ stream, snapshot, engine: "native", trail: [{ at: 1, name: "emptied" }], verdict: deviceVerdict(stream, caps, "https:"), browser: "Chrome", userAgent: "", route: "direct, then relay", directAttempt: line });
    expect(text).toContain(`Direct attempt (replaced by the relay): ${line}`);
    expect(text).toContain("Events (relay attempt): +1ms emptied");
    expect(text).not.toMatch(/SECRET|realdebrid|abcdef|token/i);
    expect(describeAttempt(null, [])).toBe("no video element; events: none");
  });
});

describe("connection test", () => {
  const asFetch = (fn: unknown) => fn as typeof fetch;
  const readableAnswer = (headers: Record<string, string>, chunks: number[], status = 206) => {
    const queue = [...chunks];
    return {
      status,
      redirected: true,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      body: { getReader: () => ({ read: async () => (queue.length ? { done: false, value: new Uint8Array(queue.shift()!) } : { done: true, value: undefined }) }) },
    } as unknown as Response;
  };

  it("asks like a browser tab and like the video player, and reports how fast the server answered", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      clock += 250;
      if (init.mode === "cors") throw new TypeError("Failed to fetch"); // the usual: the host doesn't allow web pages to read its answer
      return {} as Response;
    });
    const streamed: string[] = [];
    const lines = await probeSource("https://cdn.example/secret/path.mkv?key=abc", { fetchImpl: asFetch(fetchImpl), now: () => clock, onLine: (l) => streamed.push(l) });
    expect(streamed).toEqual(lines); // each answer is reported as soon as it is known
    expect(lines[0]).toBe("Plain GET (what opening the link in a tab does): the server answered after 250 ms");
    expect(lines[1]).toBe("Range GET bytes=0-1 (what the video player does): the server answered after 250 ms");
    expect(lines[2]).toContain("not possible — the server doesn't let web pages read its answer");
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]![1]).toMatchObject({ method: "GET", mode: "no-cors", credentials: "omit", headers: {} });
    expect(calls[1]![1].headers).toEqual({ Range: "bytes=0-1" });
    expect(calls[2]![1]).toMatchObject({ mode: "cors", headers: { Range: "bytes=0-65535" } });
    expect(lines.join("\n")).not.toMatch(/secret|abc/); // timing and headers only, never the link
  });

  it("when the answer can be read, reports its status, type, ranges and whether bytes really flow", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) =>
      init.mode === "cors" ? readableAnswer({ "content-type": "video/x-matroska", "content-length": "65536", "accept-ranges": "bytes", "content-range": "bytes 0-65535/9000000", "content-disposition": "attachment; filename=secret.mkv" }, [40_000, 30_000]) : ({} as Response),
    );
    const lines = await probeSource("https://cdn.example/v.mkv", { fetchImpl: asFetch(fetchImpl) });
    const answer = lines[2]!;
    expect(answer).toContain("HTTP 206, type video/x-matroska, length 65536, ranges bytes, content-range bytes 0-65535/9000000, sent as attachment, redirected");
    expect(answer).toMatch(/headers after \d+ ms, then 70000 bytes in \d+ ms/);
    expect(answer).not.toContain("secret.mkv"); // only that a filename was sent, never the name
  });

  it("says when a server never answers", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
      const pending = probeSource("https://slow.example/v.mkv", { fetchImpl: asFetch(fetchImpl), timeoutMs: 2000 });
      for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(2000);
      const lines = await pending;
      expect(lines).toHaveLength(4);
      expect(lines.every((l) => l.endsWith("no answer within 2 s"))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a network failure with its reason", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.mode === "cors") throw new TypeError("Failed to fetch");
      throw new Error("net::ERR_CONNECTION_RESET");
    });
    const lines = await probeSource("https://down.example/v.mkv", { fetchImpl: asFetch(fetchImpl) });
    expect(lines[0]).toMatch(/Plain GET .*: failed after \d+ ms \(net::ERR_CONNECTION_RESET\)/);
  });
});
