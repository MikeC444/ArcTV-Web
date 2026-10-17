import { describe, expect, it } from "vitest";
import { StremioAddonProvider } from "./provider";
import { normalizeManifest } from "./stremio/client";
import { orderServices } from "./streamingServices";

/** The real "Streaming Catalogs" addon's manifest (a catalogue-only addon: resources are just "catalog", its catalogues take no extras). */
const STREAMING_CATALOGS = {
  id: "pw.ers.netflix-catalog",
  version: "1.1.1",
  name: "Streaming Catalogs",
  description: "Your favourite streaming services!",
  catalogs: [
    ["nfx", "Netflix"], ["dnp", "Disney+"], ["amp", "Prime Video"], ["atp", "Apple TV+"], ["hbm", "HBO Max"], ["pmp", "Paramount+"], ["pcp", "Peacock"], ["hlu", "Hulu"],
    ["sst", "SkyShowtime"], ["sgo", "Sky Go"], ["bbo", "BritBox"], ["shd", "Shudder"], ["al4", "Channel 4"], ["itv", "ITVX"], ["bbc", "BBC iPlayer"], ["cru", "Crunchyroll"],
  ].flatMap(([id, name]) => [{ id, type: "movie", name }, { id, type: "series", name }]).concat([{ id: "dpe", type: "series", name: "Discovery+" }]),
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  behaviorHints: { configurable: true },
};

describe("the real Streaming Catalogs manifest", () => {
  const provider = new StremioAddonProvider("https://example.test/manifest.json", normalizeManifest(STREAMING_CATALOGS as unknown as Record<string, unknown>));

  it("gives a tile for every service it lists, in tile order", () => {
    expect(orderServices(provider.streamingServices())).toEqual([
      "netflix", "prime", "apple", "max", "disney", "paramount", "hulu", "peacock", "iplayer", "shudder", "crunchyroll", "skyshowtime", "britbox", "itvx", "channel4", "discovery", "sky",
    ]);
    expect(provider.streamingServices()).toHaveLength(17);
  });

  it("is a catalogue-only addon: it offers no details or streams of its own", () => {
    expect(STREAMING_CATALOGS.resources).toEqual(["catalog"]);
  });
});
