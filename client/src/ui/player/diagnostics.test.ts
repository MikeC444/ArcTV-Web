import { describe, expect, it } from "vitest";
import { describeDiagnostics, safeSourceLabel, type VideoSnapshot } from "./diagnostics";
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
