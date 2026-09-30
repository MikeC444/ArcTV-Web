import { describe, expect, it, vi } from "vitest";
import { describeDiagnostics, probeSource, safeSourceLabel, type VideoSnapshot } from "./diagnostics";
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

describe("connection test", () => {
  const asFetch = (fn: unknown) => fn as typeof fetch;

  it("asks like a browser tab and like the video player, and reports how fast the server answered", async () => {
    let clock = 0;
    const fetchImpl = vi.fn(async () => {
      clock += 250;
      return {} as Response;
    });
    const streamed: string[] = [];
    const lines = await probeSource("https://cdn.example/secret/path.mkv?key=abc", { fetchImpl: asFetch(fetchImpl), now: () => clock, onLine: (l) => streamed.push(l) });
    expect(streamed).toEqual(lines); // each answer is reported as soon as it is known
    expect(lines).toEqual([
      "Plain GET (what opening the link in a tab does): the server answered after 250 ms",
      "Range GET bytes=0-1 (what the video player does): the server answered after 250 ms",
    ]);
    const [plain, ranged] = fetchImpl.mock.calls as unknown as [[string, RequestInit], [string, RequestInit]];
    expect(plain[1]).toMatchObject({ method: "GET", mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer", headers: {} });
    expect(ranged[1].headers).toEqual({ Range: "bytes=0-1" });
    expect(lines.join("\n")).not.toMatch(/secret|abc/); // timing only, never the link
  });

  it("says when a server never answers", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
      const pending = probeSource("https://slow.example/v.mkv", { fetchImpl: asFetch(fetchImpl), timeoutMs: 2000 });
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toEqual(["Plain GET (what opening the link in a tab does): no answer within 2 s", "Range GET bytes=0-1 (what the video player does): no answer within 2 s"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a network failure with its reason", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const lines = await probeSource("https://down.example/v.mkv", { fetchImpl: asFetch(fetchImpl) });
    expect(lines[0]).toMatch(/Plain GET .*: failed after \d+ ms \(Failed to fetch\)/);
  });
});
