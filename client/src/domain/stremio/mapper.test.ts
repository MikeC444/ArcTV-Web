import { describe, expect, it } from "vitest";
import { javaHashCode, metaToContent, parseRuntimeMinutes, parseYear, previewToContent, streamToStream, videosToSeasons } from "./mapper";
import { normalizeManifestUrl, resourceBase } from "./url";

describe("Stremio → Content mapping (port of StremioMapper.kt)", () => {
  it("maps a catalog preview", () => {
    const c = previewToContent({ id: "tt1", type: "series", name: "Show", poster: "p.jpg", releaseInfo: "2019–2023", imdbRating: "8.4", genres: ["Drama", "Sci-Fi"], runtime: "45 min" }, "addon");
    expect(c).toMatchObject({ id: "tt1", type: "TV_SHOW", title: "Show", year: 2019, rating: 8.4, runtimeMinutes: 45, providerId: "addon", posterUrl: "p.jpg", backdropUrl: "p.jpg" });
    expect(c.genres).toEqual([{ id: "drama", name: "Drama" }, { id: "sci-fi", name: "Sci-Fi" }]);
  });

  it("anything that is not 'series' is a movie, and background beats poster for the backdrop", () => {
    const c = previewToContent({ id: "x", type: "movie", name: "M", poster: "p", background: "b" }, "a");
    expect(c.type).toBe("MOVIE");
    expect(c.backdropUrl).toBe("b");
  });

  it("parses years only when they are four digits", () => {
    expect(parseYear("2021")).toBe(2021);
    expect(parseYear("2021–")).toBe(2021);
    expect(parseYear("21")).toBeNull();
    expect(parseYear("")).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });

  it("parses runtimes, including hour/minute forms the TV app gets wrong", () => {
    expect(parseRuntimeMinutes("142 min")).toBe(142);
    expect(parseRuntimeMinutes("2h 22min")).toBe(142);
    expect(parseRuntimeMinutes("1h")).toBe(60);
    expect(parseRuntimeMinutes("45")).toBe(45);
    expect(parseRuntimeMinutes(null)).toBeNull();
    expect(parseRuntimeMinutes("n/a")).toBeNull();
  });

  it("builds seasons from videos: no specials, sorted, missing titles get a default", () => {
    const seasons = videosToSeasons([
      { id: "a", season: 2, episode: 2, name: "Two" },
      { id: "b", season: 0, episode: 1, title: "Special" },
      { id: "c", season: 2, episode: 1, title: "One", overview: "o" },
      { id: "d", season: 1, episode: 1 },
      { id: "e", season: null, episode: 1 },
    ]);
    expect(seasons.map((s) => s.seasonNumber)).toEqual([1, 2]);
    expect(seasons[1]!.episodes.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(seasons[0]!.episodes[0]!.title).toBe("Episode 1");
    expect(seasons[1]!.episodes[1]!.title).toBe("Two");
    expect(seasons[1]!.name).toBe("Season 2");
  });

  it("maps a full meta with cast and director", () => {
    const c = metaToContent({ id: "tt", type: "movie", name: "M", cast: ["A", "B"], director: ["D1", "D2"] }, "p");
    expect(c.cast.map((x) => x.name)).toEqual(["A", "B"]);
    expect(c.director).toBe("D1, D2");
  });
});

describe("stream parsing", () => {
  it("extracts tier, codec, size, seeders and health from Torrentio-style free text", () => {
    const s = streamToStream({ name: "[RD+] Torrentio", title: "Movie.2024.2160p.BluRay.REMUX.x265.DDP5.1.Atmos-GRP\n👤 1200 💾 23.6 GB", url: "https://x/y.mkv" }, "prov", "Prov");
    expect(s).toMatchObject({ resolutionTier: "UHD_4K", qualityBadge: "4K", sourceTag: "BluRay", codec: "HEVC", sizeLabel: "23.6 GB", sizeBytes: 23_600_000_000, seeders: 1200, seedersLabel: "1.2K", sourceHealth: "VERY_HIGH", providerLabel: "Torrentio" });
    expect(s.audioTag).toMatch(/DDP5\.1/);
    expect(s.releaseTitle).toBe("Movie.2024.2160p.BluRay.REMUX.x265.DDP5.1.Atmos-GRP");
  });

  it("falls back gracefully when nothing can be parsed", () => {
    const s = streamToStream({ url: "https://x/y" }, "prov", "Prov Label");
    expect(s).toMatchObject({ resolutionTier: "OTHER", qualityBadge: "SD", releaseTitle: "Unknown Source", providerLabel: "Prov Label", seeders: null, sourceHealth: null });
  });

  it("health buckets follow the TV app's thresholds", () => {
    const at = (n: number) => streamToStream({ title: `x 👤 ${n}`, url: "u" }, "p", "P").sourceHealth;
    expect([at(500), at(499), at(100), at(99), at(20), at(19)]).toEqual(["VERY_HIGH", "HIGH", "HIGH", "GOOD", "GOOD", "LOW"]);
  });

  it("keeps stream ids compatible with Kotlin's String.hashCode", () => {
    expect(javaHashCode("hello")).toBe(99162322);
    expect(javaHashCode("")).toBe(0);
    expect(javaHashCode("Aa")).toBe(javaHashCode("BB")); // the classic Java collision — proves it's the 31-multiplier hash
    const s = streamToStream({ url: "hello" }, "prov", "P");
    expect(s.id).toBe("prov:99162322");
  });

  it("carries the addon's browser-readiness hints", () => {
    const s = streamToStream({ url: "https://x", behaviorHints: { notWebReady: true, proxyHeaders: { request: { Referer: "r" } } } }, "p", "P");
    expect(s.notWebReady).toBe(true);
    expect(s.proxyHeaders).toEqual({ Referer: "r" });
  });
});

describe("addon URLs", () => {
  it.each([
    ["stremio://addon.example/abc/manifest.json", "https://addon.example/abc/manifest.json"],
    ["addon.example/abc", "https://addon.example/abc/manifest.json"],
    ["https://addon.example/abc/", "https://addon.example/abc/manifest.json"],
    ["  http://localhost:7000/manifest.json  ", "http://localhost:7000/manifest.json"],
    ["https://addon.example/x/Manifest.JSON", "https://addon.example/x/Manifest.JSON"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeManifestUrl(input)).toBe(expected);
  });

  it("derives the resource base", () => {
    expect(resourceBase("https://a.example/x/manifest.json")).toBe("https://a.example/x");
  });
});
