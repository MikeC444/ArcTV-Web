import { beforeEach, describe, expect, it, vi } from "vitest";
import { StremioAddonProvider } from "./provider";
import type { AddonManifest } from "./types";

const client = vi.hoisted(() => ({ fetchCatalog: vi.fn(), fetchMeta: vi.fn(), fetchStreams: vi.fn() }));
vi.mock("./stremio/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("./stremio/client")>()), ...client }));

const manifest = (over: Partial<AddonManifest>): AddonManifest => ({ id: "a", name: "Addon", version: "1", description: null, logo: null, background: null, types: [], resources: [], idPrefixes: [], catalogs: [], ...over });
const catalog = (id: string, type: string, name = id, extra: AddonManifest["catalogs"][number]["extra"] = []) => ({ type, id, name, extra });
const preview = (id: string, type = "movie") => ({ id, type, name: id });

beforeEach(() => {
  client.fetchCatalog.mockReset();
});

describe("streaming service catalogues", () => {
  it("finds the services an addon has catalogues for, from its manifest", () => {
    const provider = new StremioAddonProvider(
      "https://a/manifest.json",
      manifest({ catalogs: [catalog("nfx", "movie", "Netflix"), catalog("nfx", "series", "Netflix"), catalog("dnp", "movie", "Disney+"), catalog("top", "movie", "Popular")] }),
    );
    expect(provider.streamingServices()).toEqual(["netflix", "disney"]);
  });

  it("has none when no catalogue is a service, and ignores one that needs a search or other input", () => {
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("top", "movie", "Popular")] })).streamingServices()).toEqual([]);
    const needsSearch = catalog("nfx", "movie", "Netflix", [{ name: "search", isRequired: true, options: null, optionsLimit: null }]);
    expect(new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [needsSearch] })).streamingServices()).toEqual([]);
  });

  it("reads one service's movies and series together, and the following pages", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("nfx", "movie", "Netflix", [{ name: "skip", isRequired: false, options: null, optionsLimit: null }]), catalog("nfx", "series", "Netflix", [{ name: "skip", isRequired: false, options: null, optionsLimit: null }]), catalog("dnp", "movie", "Disney+")] }));
    client.fetchCatalog.mockImplementation(async (_url: string, type: string) => [preview(`${type}-1`, type)]);
    const items = await provider.getServiceItems("netflix");
    expect(items.map((c) => c.id).sort()).toEqual(["movie-1", "series-1"]);
    expect(client.fetchCatalog).toHaveBeenCalledTimes(2);
    expect(client.fetchCatalog).not.toHaveBeenCalledWith("https://a/manifest.json", "movie", "dnp", {});
    client.fetchCatalog.mockClear();
    await provider.getMoreServiceItems(2, "netflix");
    expect(client.fetchCatalog).toHaveBeenCalledWith("https://a/manifest.json", "movie", "nfx", { skip: "200" });
  });

  it("asks for no further pages from a catalogue that does not declare skip", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("nfx", "movie", "Netflix")] }));
    expect(await provider.getMoreServiceItems(2, "netflix")).toEqual([]);
    expect(client.fetchCatalog).not.toHaveBeenCalled();
  });

  it("returns nothing for a service the addon does not have", async () => {
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("nfx", "movie", "Netflix")] }));
    expect(await provider.getServiceItems("hulu")).toEqual([]);
    expect(await provider.getMoreServiceItems(2, "hulu")).toEqual([]);
    expect(client.fetchCatalog).not.toHaveBeenCalled();
  });

  it("keeps a streaming-catalogue addon's service catalogues out of the ordinary rows (they would merge into one row named after the first)", async () => {
    const provider = new StremioAddonProvider(
      "https://a/manifest.json",
      manifest({ catalogs: [catalog("nfx", "movie", "Netflix"), catalog("dnp", "movie", "Disney+"), catalog("hlu", "movie", "Hulu")] }),
    );
    const rows: unknown[] = [];
    for await (const batch of provider.getHomeSections()) rows.push(...batch);
    expect(rows).toEqual([]);
    expect(client.fetchCatalog).not.toHaveBeenCalled();
    expect(provider.streamingServices()).toEqual(["netflix", "disney", "hulu"]);
  });

  it("keeps an ordinary addon's one catalogue that merely mentions a service as a row", async () => {
    client.fetchCatalog.mockResolvedValue([preview("tt1")]);
    const provider = new StremioAddonProvider("https://a/manifest.json", manifest({ catalogs: [catalog("top", "movie", "Popular"), catalog("nfx", "movie", "Netflix Originals")] }));
    const rows: Array<{ items: unknown[] }> = [];
    for await (const batch of provider.getHomeSections()) rows.push(...batch);
    expect(rows).toHaveLength(1);
    expect(client.fetchCatalog).toHaveBeenCalledTimes(2);
  });
});
