import { beforeEach, describe, expect, it, vi } from "vitest";
import { navItems, routes } from "../lib/routes";
import { findLiveChannel, neighbourChannel, resetLiveLineup, setLiveLineup } from "../state/liveLineup";
import { selectedNavIndex } from "../ui/components/TopNav";
import { liveEngineFor, playableLiveStreams, type LiveChannel } from "./live";
import { StremioAddonProvider } from "./provider";
import { previewToChannel } from "./stremio/mapper";
import type { AddonManifest, Stream } from "./types";

const client = vi.hoisted(() => ({ fetchCatalog: vi.fn(), fetchMeta: vi.fn(), fetchStreams: vi.fn() }));
vi.mock("./stremio/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("./stremio/client")>()), ...client }));

const manifest = (over: Partial<AddonManifest>): AddonManifest => ({ id: "tvaddon", name: "TV Addon", version: "1", description: null, logo: null, background: null, types: [], resources: [], idPrefixes: [], catalogs: [], ...over });
const extra = (name: string, isRequired = false, options: string[] | null = null) => ({ name, isRequired, options, optionsLimit: null });
const catalog = (id: string, type: string, ex: AddonManifest["catalogs"][number]["extra"] = []) => ({ type, id, name: id, extra: ex });
const stream = (url: string | null, over: Partial<Stream> = {}): Stream => ({ id: url ?? "x", providerId: "p", providerLabel: "P", resolutionTier: "OTHER", qualityBadge: "", releaseTitle: "", url, ...over }) as Stream;

beforeEach(() => {
  client.fetchCatalog.mockReset();
  client.fetchMeta.mockReset();
  client.fetchStreams.mockReset();
});

describe("live catalogues", () => {
  it("an addon has live TV only when it has a channel or event catalogue that asks for nothing but (at most) a category", () => {
    const has = (m: Partial<AddonManifest>) => new StremioAddonProvider("https://a/manifest.json", manifest(m)).hasLiveTv;
    expect(has({ catalogs: [catalog("all", "tv")] })).toBe(true);
    expect(has({ catalogs: [catalog("live", "events")] })).toBe(true);
    expect(has({ catalogs: [catalog("top", "movie"), catalog("s", "series"), catalog("lib", "other")] })).toBe(false);
    expect(has({ catalogs: [catalog("g", "tv", [extra("genre", true, ["News"])])] })).toBe(true);
    expect(has({ catalogs: [catalog("find", "tv", [extra("search", true)])] })).toBe(true); // search only: still a live addon
    expect(has({ catalogs: [catalog("x", "tv", [extra("something", true)])] })).toBe(false);
  });

  it("reads channels, tags their type and addon, and uses the logo", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("all", "tv", [extra("genre", false, ["News", "Sports"])]), catalog("live", "events")] }));
    client.fetchCatalog.mockImplementation(async (_url: string, type: string) =>
      type === "tv" ? [{ id: "ch:1", type: "tv", name: "News One", logo: "https://x/l.png", posterShape: "square", genres: ["News"] }] : [{ id: "ev:1", type: "events", name: "Final", poster: "https://x/p.png" }],
    );
    const all = await provider.getLiveChannels();
    expect(all.map((c) => [c.id, c.type, c.providerId, c.providerName, c.logoUrl, c.shape])).toEqual([
      ["ch:1", "tv", "tvaddon", "TV Addon", "https://x/l.png", "square"],
      ["ev:1", "events", "tvaddon", "TV Addon", "https://x/p.png", "square"],
    ]);
    expect(provider.liveTypes().sort()).toEqual(["events", "tv"]);
    expect(provider.liveGenres()).toEqual(["News", "Sports"]);
    client.fetchCatalog.mockClear();
    await provider.getLiveChannels({ type: "events" });
    expect(client.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "events", "live", {});
  });

  it("asks for a category and for later pages only where the catalogue can do it", async () => {
    const provider = new StremioAddonProvider(
      "https://a/manifest.json",
      manifest({ catalogs: [catalog("all", "tv", [extra("genre", false, ["News"]), extra("skip")]), catalog("fixed", "tv", [extra("genre", false, ["News"])]), catalog("sports", "tv", [extra("genre", true, ["Sports"])])] }),
    );
    client.fetchCatalog.mockResolvedValue([{ id: "a", type: "tv", name: "A" }]);
    await provider.getLiveChannels({ genre: "Sports" });
    expect(client.fetchCatalog).toHaveBeenCalledTimes(1);
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "tv", "sports", { genre: "Sports" });
    client.fetchCatalog.mockClear();
    await provider.getLiveChannels({ genre: "News", page: 2 });
    expect(client.fetchCatalog).toHaveBeenCalledTimes(1); // "fixed" cannot page, so it is not asked again
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "tv", "all", { genre: "News", skip: "200" });
  });

  it("a catalogue that fails shows nothing instead of breaking the rest", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("a", "tv"), catalog("b", "events")] }));
    client.fetchCatalog.mockImplementation(async (_u: string, type: string) => {
      if (type === "tv") throw new Error("down");
      return [{ id: "e", type: "events", name: "E" }];
    });
    expect((await provider.getLiveChannels()).map((c) => c.id)).toEqual(["e"]);
  });

  it("searches with the catalogue's own search, and falls back to matching names in the lists", async () => {
    const searchable = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("all", "tv"), catalog("find", "tv", [extra("search", true)])] }));
    client.fetchCatalog.mockResolvedValue([{ id: "a", type: "tv", name: "Alpha" }]);
    expect((await searchable.searchLiveChannels("alp")).map((c) => c.id)).toEqual(["a"]);
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "tv", "find", { search: "alp" });
    client.fetchCatalog.mockClear();
    const plain = new StremioAddonProvider("https://b/manifest.json", manifest({ catalogs: [catalog("all", "tv")] }));
    client.fetchCatalog.mockResolvedValue([{ id: "a", type: "tv", name: "Alpha Sport" }, { id: "b", type: "tv", name: "Beta" }]);
    expect((await plain.searchLiveChannels("sport")).map((c) => c.id)).toEqual(["a"]);
    expect(await plain.searchLiveChannels("  ")).toEqual([]);
  });

  it("asks the addon for a channel's streams by the addon's own type", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ resources: ["catalog", "stream"], catalogs: [catalog("all", "tv")] }));
    client.fetchStreams.mockResolvedValue([{ url: "https://h/live.m3u8", name: "HD" }]);
    const report = await provider.getLiveStreamReport({ id: "ch:1", type: "tv" });
    expect(client.fetchStreams).toHaveBeenCalledWith("https://a/manifest.json", "tv", "ch:1");
    expect(report.lookup).toEqual({ kind: "ok", count: 1 });
    client.fetchStreams.mockRejectedValue(new Error("boom"));
    expect((await provider.getLiveStreamReport({ id: "ch:2", type: "events" })).lookup.kind).toBe("failed");
  });
});

describe("one channel's details", () => {
  it("reads a channel's name and logo from the addon, and says nothing when it does not know it", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("all", "tv")] }));
    client.fetchMeta.mockResolvedValue({ id: "ch:1", type: "tv", name: "News One", logo: "https://x/l.png" });
    expect(await provider.getLiveChannel({ id: "ch:1", type: "tv" })).toMatchObject({ name: "News One", logoUrl: "https://x/l.png", providerId: "tvaddon" });
    expect(client.fetchMeta).toHaveBeenCalledWith("https://a/manifest.json", "tv", "ch:1");
    client.fetchMeta.mockResolvedValue(null);
    expect(await provider.getLiveChannel({ id: "ch:2", type: "tv" })).toBeNull();
    client.fetchMeta.mockRejectedValue(new Error("x"));
    expect(await provider.getLiveChannel({ id: "ch:3", type: "tv" })).toBeNull();
  });
});

describe("live tab address and navigation", () => {
  it("shows after Anime (or TV Shows) only when an addon has live catalogues", () => {
    expect(navItems(false, false).map((i) => i.label)).toEqual(["Home", "Movies", "TV Shows", "Search", "My List", "Settings"]);
    expect(navItems(false, true).map((i) => i.label)).toEqual(["Home", "Movies", "TV Shows", "Live TV", "Search", "My List", "Settings"]);
    expect(navItems(true, true).map((i) => i.label)).toEqual(["Home", "Movies", "TV Shows", "Anime", "Live TV", "Search", "My List", "Settings"]);
    const items = navItems(true, true);
    expect(selectedNavIndex("/live", items)).toBe(4);
    expect(selectedNavIndex("/live/watch/a/tv/b", items)).toBe(4);
  });
  it("addresses a channel with its id safely encoded", () => {
    expect(routes.live).toBe("/live");
    expect(routes.liveChannel("com.addon", "tv", "pp-live:abc/1")).toBe("/live/watch/com.addon/tv/pp-live%3Aabc%2F1");
  });
});

describe("what the live player may try", () => {
  it("starts with hls.js for anything that is not plainly a video file", () => {
    expect(liveEngineFor("https://h/live/stream.m3u8")).toBe("hls");
    expect(liveEngineFor("https://h/live/abc123?token=1")).toBe("hls");
    expect(liveEngineFor("https://h/manifest.mpd")).toBe("dash");
    expect(liveEngineFor("https://h/clip.mp4")).toBe("native");
  });
  it("drops links a browser cannot play and puts adaptive, plain-https ones first", () => {
    const ordered = playableLiveStreams([stream("magnet:?xt=1"), stream("https://h/a.mp4"), stream("https://h/b.m3u8"), stream(null, { ytId: "abc" })]);
    expect(ordered.map((s) => s.url)).toEqual(["https://h/b.m3u8", "https://h/a.mp4"]);
  });
});

describe("the channels being browsed", () => {
  const ch = (id: string): LiveChannel => previewToChannel({ id, type: "tv", name: id }, "tv", "p", "P");
  beforeEach(resetLiveLineup);
  it("lets the player go to the next and previous channel, wrapping round", () => {
    setLiveLineup([ch("a"), ch("b"), ch("c")]);
    expect(neighbourChannel(ch("a"), 1)?.id).toBe("b");
    expect(neighbourChannel(ch("a"), -1)?.id).toBe("c");
    expect(neighbourChannel(ch("c"), 1)?.id).toBe("a");
    expect(findLiveChannel("p", "tv", "b")?.name).toBe("b");
  });
  it("has no neighbour when the channel is alone or not in the list", () => {
    setLiveLineup([ch("a")]);
    expect(neighbourChannel(ch("a"), 1)).toBeNull();
    setLiveLineup([ch("a"), ch("b")]);
    expect(neighbourChannel(ch("zzz"), 1)).toBeNull();
  });
});
