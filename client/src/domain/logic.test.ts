import { describe, expect, it } from "vitest";
import { applyRowOrder, dedupeRows, moveRow } from "./homeRows";
import { assessStream, engineFor } from "./playability";
import type { HomeSection } from "./types";
import { formatElapsed, formatWatched, formatReleaseDate, formatRuntime, formatTimestamp, interleave, distinctBy } from "../lib/format";
import { isoMs, monotonicIso, resetMonotonicClock } from "../lib/iso";
import { decideProgress, nextEpisodeAfter, nextHoldSeekDelta } from "../state/progress";
import { buildGenreList } from "./genreList";
import { validateCredentials } from "../state/auth";
import { sortContent } from "../ui/screens/Browse";
import { orderSources, sortStreams } from "../ui/screens/Sources";
import { recommendedStreamId } from "../state/sourcesData";
import { detectDeviceCaps } from "./deviceSupport";
import type { Content, Stream } from "./types";

const section = (id: string, title: string): HomeSection => ({ id, title, items: [], style: "STANDARD" });

describe("home row ordering (HomeRowPreferences.applyOrder)", () => {
  const rows = [section("a_Horror", "Horror"), section("a_base", "Popular"), section("a_Weird", "Zzz Custom"), section("a_Action", "Action"), section("a_Comedy", "Comedy")];

  it("puts the base row first, then well-known genres in priority order, unknown rows last", () => {
    expect(applyRowOrder(rows, { order: [], hiddenRowIds: [] }).map((r) => r.id)).toEqual(["a_base", "a_Action", "a_Comedy", "a_Horror", "a_Weird"]);
  });

  it("honours an explicit user order first and keeps the rest ranked", () => {
    const out = applyRowOrder(rows, { order: ["a_Weird", "a_Horror"], hiddenRowIds: [] }).map((r) => r.id);
    expect(out.slice(0, 2)).toEqual(["a_Weird", "a_Horror"]);
    expect(out.slice(2)).toEqual(["a_base", "a_Action", "a_Comedy"]);
  });

  it("ignores ids that no longer exist", () => {
    expect(applyRowOrder(rows, { order: ["gone", "a_Action"], hiddenRowIds: [] })[0]!.id).toBe("a_Action");
  });

  it("moves a row within bounds", () => {
    expect(moveRow(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveRow(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moveRow(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveRow(["a", "b", "c"], "zzz", 1)).toBeNull();
  });
});

describe("no title twice on Home (dedupeRows)", () => {
  const item = (id: string) => ({ id }) as Content;
  const row = (id: string, ids: string[]): HomeSection => ({ id, title: id, style: "STANDARD", items: ids.map(item) });

  it("keeps a title in the first row that has it and removes it from later rows", () => {
    const out = dedupeRows([row("popular", ["a", "b", "c"]), row("action", ["b", "d"]), row("comedy", ["a", "c", "e"])]);
    expect(out.map((r) => r.items.map((i) => i.id))).toEqual([["a", "b", "c"], ["d"], ["e"]]);
  });

  it("drops a row that would be left empty, keeps untouched rows as they are, and never mutates its input", () => {
    const input = [row("popular", ["a", "b"]), row("again", ["b", "a"]), row("other", ["z"])];
    const out = dedupeRows(input);
    expect(out.map((r) => r.id)).toEqual(["popular", "other"]);
    expect(out[0]).toBe(input[0]);
    expect(input[1]!.items).toHaveLength(2);
  });

  it("follows the order given, so the first row shown wins", () => {
    const rows = [row("action", ["x", "y"]), row("popular", ["x", "z"])];
    expect(dedupeRows(rows).map((r) => r.items.map((i) => i.id))).toEqual([["x", "y"], ["z"]]);
    expect(dedupeRows([...rows].reverse()).map((r) => r.items.map((i) => i.id))).toEqual([["x", "z"], ["y"]]);
  });
});

describe("browser playability", () => {
  const base = { url: null, infoHash: null, ytId: null, notWebReady: false, proxyHeaders: null };
  it("plain https streams are OK", () => expect(assessStream({ ...base, url: "https://cdn.example/v.mp4" }, "https:")).toEqual({ level: "ok" }));
  it("torrents and magnets are refused with an explanation", () => {
    expect(assessStream({ ...base, infoHash: "abc" }, "https:")).toMatchObject({ level: "no", kind: "torrent" });
    expect(assessStream({ ...base, url: "magnet:?xt=urn:btih:abc" }, "https:")).toMatchObject({ level: "no", kind: "torrent" });
  });
  it("youtube-only sources are refused but identified", () => expect(assessStream({ ...base, ytId: "x" }, "https:")).toMatchObject({ level: "no", kind: "youtube" }));
  it("http media on an https page can't be fetched by the browser, so it goes through the relay; on an http page it's direct", () => {
    expect(assessStream({ ...base, url: "http://cdn.example/v.mp4" }, "https:")).toEqual({ level: "ok", relay: true });
    expect(assessStream({ ...base, url: "http://cdn.example/v.mp4" }, "http:")).toEqual({ level: "ok" });
  });
  it("sources that need custom headers (proxyHeaders) go through the relay, like Stremio's proxy", () => {
    expect(assessStream({ ...base, url: "https://x/v.mp4", proxyHeaders: { Referer: "r" } }, "https:")).toEqual({ level: "ok", relay: true });
    expect(assessStream({ ...base, url: "https://x/v.mp4", proxyHeaders: {} }, "https:")).toEqual({ level: "ok" });
  });
  it("notWebReady and MKV are flagged as 'maybe'", () => {
    expect(assessStream({ ...base, url: "https://x/v.mp4", notWebReady: true }, "https:").level).toBe("maybe");
    expect(assessStream({ ...base, url: "https://x/v.mkv?token=1" }, "https:").level).toBe("maybe");
  });
  it("no url and nothing else → unknown", () => expect(assessStream(base, "https:")).toMatchObject({ level: "no", kind: "unknown" }));
  it("chooses the pipeline from the URL", () => {
    expect(engineFor("https://x/a/master.m3u8?sig=1")).toBe("hls");
    expect(engineFor("https://x/a/manifest.mpd")).toBe("dash");
    expect(engineFor("https://x/a/video.mp4")).toBe("native");
    expect(engineFor("https://x/a/stream")).toBe("native");
  });
});

describe("formatting", () => {
  it("formats timestamps like the player", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65_000)).toBe("1:05");
    expect(formatTimestamp(3_725_000)).toBe("1:02:05");
    expect(formatTimestamp(-5)).toBe("0:00");
  });
  it("formats runtime, elapsed and release dates", () => {
    expect(formatRuntime(142)).toBe("2h 22m");
    expect(formatElapsed(72 * 60_000)).toBe("1h 12m");
    expect(formatElapsed(20 * 60_000)).toBe("20m");
    // the developer panel shows seconds under a minute, minutes after
    expect(formatWatched(0)).toBe("0s");
    expect(formatWatched(45_900)).toBe("45s");
    expect(formatWatched(59_999)).toBe("59s");
    expect(formatWatched(60_000)).toBe("1m");
    expect(formatWatched(125_000)).toBe("2m");
    expect(formatWatched(72 * 60_000)).toBe("1h 12m");
    expect(formatWatched(-5)).toBe("0s");
    expect(formatReleaseDate("2024-03-05")).toBe("Mar 5, 2024");
    expect(formatReleaseDate("nope")).toBeNull();
  });
  it("interleaves lists and dedupes", () => {
    expect(interleave([[1, 3, 5], [2, 4]])).toEqual([1, 2, 3, 4, 5]);
    expect(interleave([[1, 2]])).toEqual([1, 2]);
    expect(distinctBy([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => x.id)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe("last-write-wins timestamps", () => {
  it("are strictly increasing per key even within one millisecond or if the clock steps back", () => {
    resetMonotonicClock();
    const t = 1_700_000_000_000;
    const a = isoMs(monotonicIso("k", t));
    const b = isoMs(monotonicIso("k", t));
    const c = isoMs(monotonicIso("k", t - 5000));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(isoMs(monotonicIso("other", t))).toBe(t);
  });
});

describe("playback progress rules (PlayerViewModel.reportProgress)", () => {
  it("ignores unknown durations and the first ten seconds", () => {
    expect(decideProgress("MOVIE", 500, 100_000, false).report).toBe(false); // not even a second
    expect(decideProgress("MOVIE", 5_000, 100_000, false).report).toBe(true); // any real watching is saved
    expect(decideProgress("MOVIE", 50_000, 0, false).report).toBe(false);
    expect(decideProgress("MOVIE", 10_000, 100_000, false).report).toBe(true);
  });
  it("always reports completion", () => expect(decideProgress("TV_SHOW", 1, 100_000, true).report).toBe(true));
  it("marks movies watched past 85 % — but not episodes", () => {
    expect(decideProgress("MOVIE", 86_000, 100_000, false).markWatched).toBe(true);
    expect(decideProgress("MOVIE", 85_000, 100_000, false).markWatched).toBe(false);
    expect(decideProgress("MOVIE", 100_000, 100_000, true).markWatched).toBe(true);
    expect(decideProgress("TV_SHOW", 99_000, 100_000, false).markWatched).toBe(false);
  });
  it("only remembers the source for in-progress reports", () => {
    expect(decideProgress("MOVIE", 50_000, 100_000, false).rememberSource).toBe(true);
    expect(decideProgress("MOVIE", 100_000, 100_000, true).rememberSource).toBe(false);
  });
  it("accelerates hold-to-seek 10 → 30 → 60 s and caps at two minutes", () => {
    let d = nextHoldSeekDelta(0, 1, true);
    expect(d).toBe(10_000);
    const seen = [d];
    for (let i = 0; i < 12; i++) seen.push((d = nextHoldSeekDelta(d, 1, false)));
    expect(seen.slice(0, 5)).toEqual([10_000, 20_000, 30_000, 60_000, 90_000]);
    expect(Math.max(...seen)).toBe(120_000);
    expect(nextHoldSeekDelta(0, -1, true)).toBe(-10_000);
  });
  it("finds the next episode, rolling into the next season", () => {
    const seasons = [
      { seasonNumber: 1, episodes: [{ episodeNumber: 1, title: "a" }, { episodeNumber: 2, title: "b" }] },
      { seasonNumber: 2, episodes: [{ episodeNumber: 1, title: "c" }] },
    ];
    expect(nextEpisodeAfter(seasons, 1, 1)).toEqual({ season: 1, episode: 2, title: "b" });
    expect(nextEpisodeAfter(seasons, 1, 2)).toEqual({ season: 2, episode: 1, title: "c" });
    expect(nextEpisodeAfter(seasons, 2, 1)).toBeNull();
    expect(nextEpisodeAfter(seasons, null, null)).toBeNull();
  });
});

describe("genres list (GenresViewModel)", () => {
  it("sorts names, then lists years newest-first extended back to 2016", () => {
    const out = buildGenreList(["Drama", "Action", "2024", "2023", "Action"]);
    expect(out.slice(0, 2)).toEqual(["Action", "Drama"]);
    expect(out.slice(2)).toEqual(["2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016"]);
  });
  it("has no years when the addon declares none", () => expect(buildGenreList(["B", "A"])).toEqual(["A", "B"]));
});

describe("sign-in validation (validateCredentials)", () => {
  it.each([
    ["", "x".repeat(8), "Enter your email address."],
    ["nope", "x".repeat(8), "Enter a valid email address."],
    ["a@b", "x".repeat(8), "Enter a valid email address."],
    ["a@b.co", "short", "Password must be at least 8 characters."],
    ["a@b.co", "longenough", null],
  ])("%s / %s", (email, pw, expected) => expect(validateCredentials(email, pw)).toBe(expected));
});

describe("catalog and source sorting", () => {
  const c = (id: string, rating: number | null, year: number | null): Content => ({ id, type: "MOVIE", title: id, description: "", posterUrl: null, backdropUrl: null, rating, year, genres: [], cast: [], seasons: [], watched: false });
  it("sorts by rating and by year, unknowns last", () => {
    const items = [c("a", 5, 2001), c("b", null, null), c("c", 9, 1999)];
    expect(sortContent(items, "HIGHEST_RATED").map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(sortContent(items, "NEWEST").map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(sortContent(items, "FEATURED").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  const s = (id: string, tier: Stream["resolutionTier"], seeders: number | null, sizeBytes: number | null, extra: Partial<Stream> = {}): Stream => ({ id, providerId: "p", providerLabel: "P", resolutionTier: tier, qualityBadge: tier, releaseTitle: id, seeders, sizeBytes, url: "https://x/v.mp4", ...extra });
  it("sorts sources by quality → seeders, seeders, size", () => {
    const list = [s("720", "HD_720P", 900, 1), s("4k-low", "UHD_4K", 5, 50), s("4k-hi", "UHD_4K", 500, 40)];
    const anyDevice = detectDeviceCaps({ canPlayType: () => "probably", hasMediaSource: true, userAgent: "Chrome/130 Safari/537.36" });
    expect(sortStreams(list, "QUALITY", anyDevice).map((x) => x.id)).toEqual(["4k-hi", "4k-low", "720"]);
    expect(sortStreams(list, "SEEDERS").map((x) => x.id)).toEqual(["720", "4k-hi", "4k-low"]);
    expect(sortStreams(list, "SIZE").map((x) => x.id)).toEqual(["4k-low", "4k-hi", "720"]);
  });

  it("puts the recommended source first whatever the filter and sort are", () => {
    const list = [s("720", "HD_720P", 900, 1), s("4k-low", "UHD_4K", 5, 50), s("best", "FHD_1080P", 500, 20)];
    const anyDevice = detectDeviceCaps({ canPlayType: () => "probably", hasMediaSource: true, userAgent: "Chrome/130 Safari/537.36" });
    for (const sort of ["QUALITY", "SEEDERS", "SIZE"] as const) {
      expect(orderSources(list, list, "best", sort, anyDevice).list[0]!.id, sort).toBe("best");
    }
    // sorted by size the rest follows biggest-first, with "best" lifted out of its own place
    expect(orderSources(list, list, "best", "SIZE", anyDevice).list.map((x) => x.id)).toEqual(["best", "4k-low", "720"]);
    // a filter that leaves it out doesn't remove it: it is still the first row, and "rest" is only what the filter kept
    const only720 = list.filter((x) => x.id === "720");
    const filtered = orderSources(list, only720, "best", "SIZE", anyDevice);
    expect(filtered.list.map((x) => x.id)).toEqual(["best", "720"]);
    expect(filtered.rest.map((x) => x.id)).toEqual(["720"]);
    // when it is among the filtered it appears once; with no recommendation nothing is pinned
    expect(orderSources(list, list, "720", "SIZE", anyDevice).list.map((x) => x.id)).toEqual(["720", "4k-low", "best"]);
    expect(orderSources(list, list, null, "SIZE", anyDevice).list.map((x) => x.id)).toEqual(["4k-low", "best", "720"]);
  });

  it("recommends the best source a BROWSER can play, not an unplayable torrent", () => {
    const torrent = s("torrent", "UHD_4K", 5000, 1, { url: null, infoHash: "abc" });
    const web = s("web", "FHD_1080P", 10, 1);
    const anyDevice = detectDeviceCaps({ canPlayType: () => "probably", hasMediaSource: true, userAgent: "Chrome/130 Safari/537.36" }); // jsdom has no media stack, so state what the "device" can do
    expect(recommendedStreamId([torrent, web], anyDevice)).toBe("web");
    expect(recommendedStreamId([torrent], anyDevice)).toBe("torrent"); // nothing playable → still recommend something
    expect(recommendedStreamId([], anyDevice)).toBeNull();
  });
});

import { uniqueStreamIds } from "./provider";
describe("duplicate stream links", () => {
  it("get unique, stable ids so lists and 'play this source' lookups stay correct", () => {
    const mk = (id: string) => ({ id, providerId: "p", providerLabel: "P", resolutionTier: "OTHER" as const, qualityBadge: "SD", releaseTitle: "t" });
    expect(uniqueStreamIds([mk("a"), mk("b"), mk("a"), mk("a")]).map((s) => s.id)).toEqual(["a", "b", "a#1", "a#2"]);
    expect(uniqueStreamIds([mk("x")]).map((s) => s.id)).toEqual(["x"]);
  });
});
