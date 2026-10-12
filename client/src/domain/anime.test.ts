import { beforeEach, describe, expect, it, vi } from "vitest";
import { navItems, routes } from "../lib/routes";
import { selectedNavIndex } from "../ui/components/TopNav";
import { StremioAddonProvider, streamRequestId } from "./provider";
import { previewToContent } from "./stremio/mapper";
import type { AddonManifest } from "./types";

const client = vi.hoisted(() => ({ fetchCatalog: vi.fn(), fetchMeta: vi.fn(), fetchStreams: vi.fn() }));
vi.mock("./stremio/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("./stremio/client")>()), ...client }));

const manifest = (over: Partial<AddonManifest>): AddonManifest => ({ id: "a", name: "Addon", version: "1", description: null, logo: null, background: null, types: [], resources: [], idPrefixes: [], catalogs: [], ...over });
const catalog = (id: string, type: string, extra: AddonManifest["catalogs"][number]["extra"] = []) => ({ type, id, name: id, extra });
const preview = (id: string, name = id) => ({ id, type: "anime", name });

beforeEach(() => {
  client.fetchCatalog.mockReset();
  client.fetchMeta.mockReset();
  client.fetchStreams.mockReset();
});

describe("anime catalogues", () => {
  it("an addon has anime only when it has a catalogue of type anime that asks for nothing but (at most) a genre", () => {
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("trending", "anime")] })).hasAnime).toBe(true);
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("top", "movie"), catalog("s", "series")] })).hasAnime).toBe(false);
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("find", "anime", [{ name: "search", isRequired: true, options: null, optionsLimit: null }])] })).hasAnime).toBe(false);
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("g", "anime", [{ name: "genre", isRequired: true, options: ["Isekai"], optionsLimit: null }])] })).hasAnime).toBe(true);
  });

  it("reads the ranked catalogues for the tab, and the genre ones when a genre is chosen", async () => {
    const provider = new StremioAddonProvider(
      "https://a/manifest.json",
      manifest({
        catalogs: [
          catalog("trending", "anime", [{ name: "genre", isRequired: false, options: ["Action", "Isekai"], optionsLimit: null }]),
          catalog("genres", "anime", [{ name: "genre", isRequired: true, options: ["Romance"], optionsLimit: null }]),
          catalog("top", "series"),
        ],
      }),
    );
    client.fetchCatalog.mockResolvedValue([preview("kitsu:1", "One")]);
    const items = await provider.getAnimeItems();
    expect(client.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "anime", "trending", {});
    expect(items.map((c) => [c.id, c.type, c.providerId])).toEqual([["kitsu:1", "TV_SHOW", "a"]]);
    expect(provider.animeGenres()).toEqual(["Action", "Isekai", "Romance"]);
    client.fetchCatalog.mockClear();
    await provider.getAnimeItems("Romance");
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "anime", "genres", { genre: "Romance" });
    client.fetchCatalog.mockClear();
    await provider.getMoreAnimeItems(2, "Action");
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "anime", "trending", { genre: "Action", skip: "200" });
  });

  it("shows an anime title as a show", () => {
    expect(previewToContent({ id: "kitsu:1", type: "anime", name: "One" }, "a").type).toBe("TV_SHOW");
    expect(previewToContent({ id: "tt1", type: "movie", name: "Film" }, "a").type).toBe("MOVIE");
  });
});

describe("asking an addon about a show", () => {
  it("asks an anime-only addon for the title as anime, and everyone else as series", async () => {
    const animeOnly = new StremioAddonProvider("https://k/manifest.json", manifest({ id: "k", types: ["anime"], resources: ["catalog", "meta"] }));
    const both = new StremioAddonProvider("https://t/manifest.json", manifest({ id: "t", types: ["movie", "series", "anime"], resources: ["catalog", "meta", "stream"] }));
    client.fetchMeta.mockResolvedValue({ id: "kitsu:1", type: "anime", name: "One" });
    await animeOnly.getDetails("TV_SHOW", "kitsu:1");
    await both.getDetails("TV_SHOW", "kitsu:1");
    expect(client.fetchMeta.mock.calls.map((c) => c[1])).toEqual(["anime", "series"]);
  });

  it("uses the resource's own types for streams", async () => {
    const stream = new StremioAddonProvider("https://s/manifest.json", manifest({ id: "s", types: ["movie", "series"], resources: [{ name: "stream", types: ["anime"], idPrefixes: ["kitsu:"] }] as never }));
    client.fetchStreams.mockResolvedValue([]);
    await stream.getStreamReport("TV_SHOW", "kitsu:1", 1, 2);
    expect(client.fetchStreams.mock.calls[0]![1]).toBe("anime");
  });

  it("asks for an episode by its own video id once the details were read, and by 'id:episode' for anime ids before that", async () => {
    expect(streamRequestId("tt1", 2, 3)).toBe("tt1:2:3");
    expect(streamRequestId("kitsu:77", 1, 5)).toBe("kitsu:77:5");
    expect(streamRequestId("other:77", 1, 5)).toBe("other:77:1:5");
    expect(streamRequestId("kitsu:77", null, null)).toBe("kitsu:77");
    const provider = new StremioAddonProvider("https://k/manifest.json", manifest({ id: "k", types: ["anime"] }));
    client.fetchMeta.mockResolvedValue({ id: "kitsu:88", type: "anime", name: "Two", videos: [{ id: "kitsu:88:1", season: 1, episode: 1 }, { id: "kitsu:88:s2e3", season: 2, episode: 3 }] });
    await provider.getDetails("TV_SHOW", "kitsu:88");
    expect(streamRequestId("kitsu:88", 2, 3)).toBe("kitsu:88:s2e3");
    expect(streamRequestId("kitsu:88", 1, 1)).toBe("kitsu:88:1");
  });
});

describe("the Anime tab in the nav", () => {
  it("is there only when an anime addon is, after TV Shows", () => {
    expect(navItems(false).map((i) => i.label)).toEqual(["Home", "Movies", "TV Shows", "Search", "My List", "Settings"]);
    expect(navItems(true).map((i) => i.label)).toEqual(["Home", "Movies", "TV Shows", "Anime", "Search", "My List", "Settings"]);
    expect(routes.anime).toBe("/anime");
  });

  it("selects it on its own page, and keeps the other tabs selected where they were", () => {
    const withAnime = navItems(true);
    expect(selectedNavIndex("/anime", withAnime)).toBe(3);
    expect(selectedNavIndex("/search", withAnime)).toBe(4);
    expect(selectedNavIndex("/settings/addons", withAnime)).toBe(6);
    expect(selectedNavIndex("/tv")).toBe(2);
  });
});
