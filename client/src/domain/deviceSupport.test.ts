import { describe, expect, it } from "vitest";
import { detectDeviceCaps, deviceVerdict, hasSoundHere, isWebFormat, parseStreamFacts, type CapsEnvironment } from "./deviceSupport";
import type { Stream } from "./types";
import { recommendedStreamId } from "../state/sourcesData";
import { sortStreams } from "../ui/screens/Sources";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";

/** A stand-in for HTMLMediaElement.canPlayType: "probably" when any pattern matches the mime string. */
const env = (patterns: RegExp[], userAgent: string, hasMediaSource = true): CapsEnvironment => ({
  canPlayType: (type) => (patterns.some((p) => p.test(type)) ? "probably" : ""),
  hasMediaSource,
  userAgent,
});
const COMMON = [/avc1/, /^video\/mp4$/, /mp4a\.40\.2/, /^audio\/mpeg$/];
const chrome = detectDeviceCaps(env([...COMMON, /^video\/webm$/, /vp9|vp09/, /av01/, /opus/, /^audio\/flac$/], CHROME)); // no HEVC, no Dolby
const firefox = detectDeviceCaps(env([...COMMON, /^video\/webm$/, /vp9|vp09/, /av01/, /opus/, /^audio\/flac$/], FIREFOX));
const safari = detectDeviceCaps(env([...COMMON, /hvc1|hev1/, /ac-3/, /ec-3/, /vnd\.apple\.mpegurl/, /^audio\/flac$/], SAFARI, true));

const mk = (releaseTitle: string, url: string | null = `https://cdn.example/${releaseTitle}.mkv`, extra: Partial<Stream> = {}): Stream => ({
  id: releaseTitle,
  providerId: "p",
  providerLabel: "P",
  resolutionTier: "FHD_1080P",
  qualityBadge: "1080p",
  releaseTitle,
  descriptor: releaseTitle,
  url,
  ...extra,
});

describe("what the browser can do", () => {
  it("reads codecs from the browser itself", () => {
    expect(chrome.video).toMatchObject({ h264: true, hevc: false, av1: true, vp9: true });
    expect(chrome.audio).toMatchObject({ aac: true, ac3: false, eac3: false, dts: false, opus: true });
    expect(safari.video.hevc).toBe(true);
    expect(safari.audio).toMatchObject({ ac3: true, eac3: true });
  });

  it("knows Chromium plays MKV and Firefox / Safari / iOS browsers don't", () => {
    expect(chrome.containers.mkv).toBe(true);
    expect(firefox.containers.mkv).toBe(false);
    expect(safari.containers.mkv).toBe(false);
    expect(detectDeviceCaps(env([], CHROME_IOS)).containers.mkv).toBe(false); // Chrome on iOS is WebKit
    expect([chrome.browser, firefox.browser, safari.browser]).toEqual(["Chrome", "Firefox", "Safari"]);
  });

  it("HLS needs native support or MediaSource (hls.js)", () => {
    expect(detectDeviceCaps(env([], CHROME, false)).containers.hls).toBe(false);
    expect(detectDeviceCaps(env([], CHROME, true)).containers.hls).toBe(true);
    expect(safari.containers.hls).toBe(true);
  });
});

describe("what a source contains", () => {
  it("reads container, video and audio from a release name", () => {
    expect(parseStreamFacts(mk("Movie.2024.2160p.BluRay.x265.10bit.DDP5.1.Atmos-GRP"))).toEqual({ container: "mkv", video: "hevc", tenBit: true, audio: ["eac3"] });
    expect(parseStreamFacts(mk("Movie.2024.1080p.WEB-DL.DD5.1.H264-GRP", "https://cdn.example/a.mp4"))).toMatchObject({ container: "mp4", video: "h264", audio: ["ac3"] });
    expect(parseStreamFacts(mk("Movie.720p.HDTV.AAC2.0.x264", null))).toMatchObject({ container: null, video: "h264", audio: ["aac"] });
    expect(parseStreamFacts(mk("Movie.BluRay.DTS-HD.MA.7.1.TrueHD.Atmos", null)).audio).toEqual(["truehd", "dts"]);
  });

  it("doesn't mistake ordinary words for codecs", () => {
    expect(parseStreamFacts(mk("Odd.Thomas.2013.1080p.BluRay", null)).audio).toEqual([]);
    expect(parseStreamFacts(mk("Addams.Family.Values.1993.1080p", null)).audio).toEqual([]);
    expect(parseStreamFacts(mk("Sonic.Hi-Res.1080p.WEB-DL", null)).video).toBeNull();
  });

  it("takes the container from the link's extension, or HLS / DASH manifests", () => {
    expect(parseStreamFacts(mk("x", "https://cdn.example/path/movie.mp4?token=abc")).container).toBe("mp4");
    expect(parseStreamFacts(mk("x", "https://cdn.example/master.m3u8")).container).toBe("hls");
    expect(parseStreamFacts(mk("x", "https://cdn.example/manifest.mpd")).container).toBe("dash");
    expect(parseStreamFacts(mk("x", "https://cdn.example/resolve/abc")).container).toBeNull();
  });
});

describe("the verdict for this device", () => {
  it("H.264 + AAC in MKV should play in Chrome, but not in Firefox or Safari (no MKV)", () => {
    const s = mk("Movie.2024.1080p.WEB-DL.AAC2.0.H.264-GRP");
    expect(deviceVerdict(s, chrome, "https:").level).toBe("yes");
    expect(deviceVerdict(s, firefox, "https:")).toMatchObject({ level: "no", detail: "MKV not supported" });
    expect(deviceVerdict(s, safari, "https:").level).toBe("no");
  });

  it("an MKV whose codecs aren't confirmed is 'might not play' — browsers only open some MKVs — while a confirmed H.264 + AAC one still should", () => {
    expect(deviceVerdict(mk("Movie.2024.1080p.WEB-DL"), chrome, "https:")).toMatchObject({ level: "unknown", label: "Might not play", detail: "MKV — only some play in browsers" });
    expect(deviceVerdict(mk("Movie.2024.1080p.WEB-DL.H264"), chrome, "https:").level).toBe("unknown"); // video known, audio not: still unconfirmed
    expect(deviceVerdict(mk("Movie.2024.1080p.WEB-DL.AAC2.0.H264"), chrome, "https:").level).toBe("yes");
    expect(deviceVerdict(mk("Movie.2024.1080p.WEB-DL", "https://cdn.example/a.mp4"), chrome, "https:").level).toBe("yes"); // an MP4 is something every browser opens
    expect(deviceVerdict(mk("Movie.2024.1080p.WEB-DL", "http://cdn.example/a.mkv"), chrome, "https:").detail).toBe("MKV — only some play in browsers, via this site's relay");
  });

  it("HEVC / x265 can't play where the browser has no HEVC decoder", () => {
    const s = mk("Movie.2160p.BluRay.x265-GRP", "https://cdn.example/a.mp4");
    expect(deviceVerdict(s, chrome, "https:")).toMatchObject({ level: "no", detail: "HEVC (x265) video not supported" });
    expect(deviceVerdict(s, safari, "https:").level).toBe("yes");
  });

  it("Dolby / DTS audio means the picture plays but there is probably no sound", () => {
    const s = mk("Movie.1080p.WEB-DL.DDP5.1.H.264-GRP");
    expect(deviceVerdict(s, chrome, "https:")).toMatchObject({ level: "audio", label: "No sound here", detail: "Dolby Digital Plus audio not supported" });
    expect(deviceVerdict(mk("Movie.1080p.H.264.DDP5.1", "https://cdn.example/a.mp4"), safari, "https:").level).toBe("yes");
    // a release carrying AAC alongside Dolby is fine: the AAC track can be used
    expect(deviceVerdict(mk("Movie.1080p.H.264.AAC.DDP5.1"), chrome, "https:").level).toBe("yes");
  });

  it("10-bit H.264 is refused everywhere", () => {
    expect(deviceVerdict(mk("Anime.1080p.BluRay.Hi10P.x264.AAC"), chrome, "https:")).toMatchObject({ level: "no", detail: "10-bit H.264 not supported" });
  });

  it("torrents and YouTube-only sources are 'no' with their own reason", () => {
    expect(deviceVerdict(mk("t", null, { infoHash: "abc" }), chrome, "https:")).toMatchObject({ level: "no", detail: "Torrent source" });
    expect(deviceVerdict(mk("y", null, { ytId: "abc" }), chrome, "https:")).toMatchObject({ level: "no", detail: "YouTube-only source" });
  });

  it("header-locked and plain-http sources are playable through the site's relay, and say so", () => {
    expect(deviceVerdict(mk("Movie.1080p.H264.AAC", "https://x/v.mp4", { proxyHeaders: { Referer: "r" } }), chrome, "https:")).toMatchObject({ level: "yes", detail: "via this site's relay" });
    expect(deviceVerdict(mk("Movie.1080p.H264.AAC", "http://x/v.mp4"), chrome, "https:")).toMatchObject({ level: "yes", detail: "via this site's relay" });
    expect(deviceVerdict(mk("Movie.1080p.H264.AAC", "http://x/v.mp4"), chrome, "http:").detail).toBe(""); // an http page can fetch http directly
    expect(deviceVerdict(mk("Some Movie", "https://x/stream", { proxyHeaders: { Referer: "r" } }), chrome, "https:")).toMatchObject({ level: "unknown", detail: "May play, via this site's relay" });
    // the relay can't fix a format the device can't decode
    expect(deviceVerdict(mk("Movie.2160p.x265", "http://x/v.mp4"), chrome, "https:").level).toBe("no");
  });

  it("says 'unknown' when the source doesn't reveal its format, and flags addon-declared not-web-ready", () => {
    expect(deviceVerdict(mk("Some Movie", "https://cdn.example/stream/abc"), chrome, "https:").level).toBe("unknown");
    expect(deviceVerdict(mk("Movie.mp4", "https://cdn.example/a.mp4", { notWebReady: true }), chrome, "https:")).toMatchObject({ level: "unknown", detail: "Addon says not web-ready" });
  });

  it("HLS plays where MediaSource or native HLS exists, and not where neither does", () => {
    const hls = mk("Movie", "https://cdn.example/master.m3u8");
    expect(deviceVerdict(hls, chrome, "https:").level).toBe("yes");
    expect(deviceVerdict(hls, detectDeviceCaps(env([], CHROME, false)), "https:").level).toBe("no");
  });
});

describe("ranking follows the device", () => {
  const torrent4k = mk("Movie.2160p.BluRay.x265", null, { infoHash: "abc", resolutionTier: "UHD_4K", qualityBadge: "4K", seeders: 5000 });
  const hevc4k = mk("Movie.2160p.WEB-DL.x265.mkv", "https://cdn.example/a.mkv", { resolutionTier: "UHD_4K", qualityBadge: "4K", seeders: 900, id: "hevc4k" });
  const dolby1080 = mk("Movie.1080p.WEB-DL.DDP5.1.H264", "https://cdn.example/b.mkv", { id: "dolby1080", seeders: 700 });
  const good1080 = mk("Movie.1080p.WEB-DL.AAC2.0.H264", "https://cdn.example/c.mp4", { id: "good1080", seeders: 40 });
  const all = [torrent4k, hevc4k, dolby1080, good1080];

  it("recommends the best source this device can actually play", () => {
    expect(recommendedStreamId(all, chrome)).toBe("good1080"); // not the 4K torrent, not 4K HEVC, not the silent Dolby one
    const hevcMp4 = mk("Movie.2160p.WEB-DL.x265", "https://cdn.example/d.mp4", { id: "hevcMp4", resolutionTier: "UHD_4K", qualityBadge: "4K", seeders: 300 });
    expect(recommendedStreamId([torrent4k, hevcMp4, good1080], chrome)).toBe("good1080"); // Chrome here has no HEVC
    expect(recommendedStreamId([torrent4k, hevcMp4, good1080], safari)).toBe("hevcMp4"); // Safari does, so the 4K file wins
  });

  it("within the same level a plain file beats an MKV, even when the MKV is sharper (an MP4 started where MKVs did not)", () => {
    const mkv1080 = mk("Movie.1080p.WEB-DL.AAC2.0.H264", "https://cdn.example/e.mkv", { id: "mkv1080", seeders: 900 });
    const mp4720 = mk("Movie.720p.WEB-DL.AAC2.0.H264", "https://cdn.example/f.mp4", { id: "mp4720", resolutionTier: "HD_720P", qualityBadge: "720p", seeders: 5 });
    expect(deviceVerdict(mkv1080, chrome, "https:").level).toBe("yes");
    expect(recommendedStreamId([mkv1080, mp4720], chrome)).toBe("mp4720");
    expect(sortStreams([mkv1080, mp4720], "QUALITY", chrome).map((s) => s.id)).toEqual(["mp4720", "mkv1080"]);
    expect(sortStreams([mkv1080, mp4720], "SEEDERS", chrome).map((s) => s.id)).toEqual(["mkv1080", "mp4720"]); // explicit sorts are untouched
  });

  it("'Quality' sort lists playable sources first, then picture-only, then the rest", () => {
    expect(sortStreams(all, "QUALITY", chrome).map((s) => s.id)).toEqual(["good1080", "dolby1080", torrent4k.id, "hevc4k"]); // then the rest by resolution / seeders
    expect(sortStreams(all, "SEEDERS", chrome).map((s) => s.id)).toEqual([torrent4k.id, "hevc4k", "dolby1080", "good1080"]); // explicit sorts are untouched
  });
});

describe("debrid cache ranking", () => {
  const cached720 = mk("Movie.720p.WEB-DL.AAC2.0.H264", "https://cdn.example/a.mp4", { id: "cached720", debrid: { service: "RD", cached: true }, resolutionTier: "HD_720P", qualityBadge: "720p", seeders: 10 });
  const uncached4k = mk("Movie.2160p.WEB-DL.AAC2.0.H264", "https://cdn.example/b.mp4", { id: "uncached4k", debrid: { service: "RD", cached: false }, resolutionTier: "UHD_4K", qualityBadge: "4K", seeders: 900 });
  const plain1080 = mk("Movie.1080p.WEB-DL.AAC2.0.H264", "https://cdn.example/c.mp4", { id: "plain1080", resolutionTier: "FHD_1080P", seeders: 100 });

  it("a source that starts at once beats a higher-quality one the debrid service still has to fetch", () => {
    expect(recommendedStreamId([uncached4k, cached720], chrome)).toBe("cached720");
    expect(sortStreams([uncached4k, cached720, plain1080], "QUALITY", chrome).map((s) => s.id)).toEqual(["plain1080", "cached720", "uncached4k"]);
  });

  it("only demotes within the same device level — a source the device can't play never outranks one it can", () => {
    const cachedButHevc = mk("Movie.2160p.x265", "https://cdn.example/d.mp4", { id: "cachedButHevc", debrid: { service: "RD", cached: true }, resolutionTier: "UHD_4K" });
    expect(recommendedStreamId([cachedButHevc, uncached4k], chrome)).toBe("uncached4k");
  });
});

describe("the MP4 & web formats filter", () => {
  it("drops sources that say they are MKV, AVI and the like, and keeps MP4, WebM, HLS, DASH and unlabelled ones", () => {
    expect(isWebFormat(mk("Movie.1080p.WEB-DL.x264", "https://cdn.example/a.mp4"))).toBe(true);
    expect(isWebFormat(mk("Movie", "https://cdn.example/a.webm"))).toBe(true);
    expect(isWebFormat(mk("Movie", "https://cdn.example/master.m3u8"))).toBe(true);
    expect(isWebFormat(mk("Movie", "https://cdn.example/a.mpd"))).toBe(true);
    expect(isWebFormat(mk("Movie.720p.HDTV.x264", null))).toBe(true); // doesn't say what it is: keep it, it may well play
    expect(isWebFormat(mk("Movie.2024.2160p.x265"))).toBe(false); // .mkv link
    expect(isWebFormat(mk("Movie", "https://cdn.example/a.avi"))).toBe(false);
    expect(isWebFormat(mk("Movie.1080p.x264.mkv", null))).toBe(false); // MKV named only in the release text
  });

  it("drops sources whose only audio this browser can't decode, and asks the browser itself", () => {
    const dolby = mk("Movie.1080p.WEB-DL.DDP5.1.H264", "https://cdn.example/a.mp4");
    const aac = mk("Movie.1080p.WEB-DL.AAC2.0.H264", "https://cdn.example/a.mp4");
    const both = mk("Movie.1080p.WEB-DL.DDP5.1.AAC.H264", "https://cdn.example/a.mp4");
    const unnamed = mk("Movie.1080p.H264", "https://cdn.example/a.mp4");
    expect(hasSoundHere(dolby, chrome)).toBe(false);
    expect(hasSoundHere(aac, chrome)).toBe(true);
    expect(hasSoundHere(both, chrome)).toBe(true);
    expect(hasSoundHere(unnamed, chrome)).toBe(true);
    expect(hasSoundHere(dolby, safari)).toBe(true); // Safari decodes Dolby Digital Plus
  });
});
