import { afterEach, describe, expect, it, vi } from "vitest";
import { GENRE_OPTIONS } from "./genreOptions";
import { StremioAddonProvider } from "./provider";
import { normalizeManifest } from "./stremio/client";

describe("genres of the Movies / TV Shows drop-down", () => {
  it("are Cinemeta's own genres — no years — with three extra for TV shows", () => {
    expect(GENRE_OPTIONS.MOVIE).toHaveLength(19);
    expect(GENRE_OPTIONS.MOVIE.slice(0, 3)).toEqual(["Action", "Adventure", "Animation"]);
    expect(GENRE_OPTIONS.MOVIE).toEqual(expect.arrayContaining(["Biography", "Sci-Fi", "Sport", "Western"]));
    expect(GENRE_OPTIONS.TV_SHOW).toEqual([...GENRE_OPTIONS.MOVIE, "Reality-TV", "Talk-Show", "Game-Show"]);
    for (const genre of [...GENRE_OPTIONS.MOVIE, ...GENRE_OPTIONS.TV_SHOW]) expect(genre).not.toMatch(/^\d+$/);
  });
});

describe("a provider's titles of one type and genre", () => {
  afterEach(() => vi.unstubAllGlobals());
  const manifest = normalizeManifest({
    id: "t.addon",
    name: "T",
    version: "1",
    resources: ["catalog"],
    types: ["movie", "series"],
    catalogs: [
      { type: "movie", id: "top", name: "Popular", extra: [{ name: "genre", options: ["Action", "Comedy"] }, { name: "skip" }] },
      { type: "series", id: "top", name: "Popular", extra: [{ name: "genre", options: ["Action", "Reality-TV"] }, { name: "skip" }] },
    ],
  });
  const metas = (type: string, n: number) => ({ metas: Array.from({ length: n }, (_, i) => ({ id: `${type}${i}`, type, name: `${type} ${i}`, poster: "p.jpg" })) });

  it("asks only the catalogues of that type, with the genre — and pages with the same genre", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(metas(url.includes("/movie/") ? "movie" : "series", 3)), { status: 200 });
    }));
    const provider = new StremioAddonProvider("https://t.example/manifest.json", manifest);
    const sections = await provider.getSectionsByType("MOVIE", "Action");
    expect(sections).toHaveLength(1);
    expect(sections[0]!.items.map((c) => c.type)).toEqual(["MOVIE", "MOVIE", "MOVIE"]); // no series mixed in
    expect(urls).toEqual(["https://t.example/catalog/movie/top/genre=Action.json"]);

    urls.length = 0;
    await provider.getMoreItemsByType("TV_SHOW", 1, "Action");
    expect(urls).toEqual(["https://t.example/catalog/series/top/genre=Action&skip=100.json"]);
  });

  it("gives nothing for a genre that type's catalogue doesn't list, instead of asking", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = new StremioAddonProvider("https://t.example/manifest.json", manifest);
    expect(await provider.getSectionsByType("MOVIE", "Reality-TV")).toEqual([]); // only series lists it
    expect(await provider.getMoreItemsByType("MOVIE", 1, "Reality-TV")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
