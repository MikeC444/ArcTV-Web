import { describe, expect, it } from "vitest";
import { addonWarnings, offerSummary, type AddonCapabilities } from "./addonCapabilities";

const caps = (over: Partial<AddonCapabilities> = {}): AddonCapabilities => ({ offers: [], catalogs: { shown: 0, ignored: 0, ignoredTypes: [], rows: 0 }, otherIdPrefixes: [], ...over });

describe("addon capabilities", () => {
  it("sums up what an addon gives the apps", () => {
    expect(offerSummary(caps({ offers: ["catalog", "meta"], catalogs: { shown: 2, ignored: 0, ignoredTypes: [], rows: 5 } }))).toBe("Home rows (about 5) · Details");
    expect(offerSummary(caps({ offers: ["stream"] }))).toBe("Sources");
    expect(offerSummary(caps({ offers: ["subtitles"] }))).toBe("Subtitles");
    expect(offerSummary(caps())).toBe("Nothing the apps use");
  });

  it("says when catalogues exist but none are a type the apps show", () => {
    expect(offerSummary(caps({ offers: ["catalog"], catalogs: { shown: 0, ignored: 2, ignoredTypes: ["anime"], rows: 0 } }))).toBe("Catalogues, none the apps use");
  });

  it("flags ignored catalogue types and non-IMDb ids, and nothing else", () => {
    expect(addonWarnings(caps())).toEqual([]);
    expect(addonWarnings(caps({ catalogs: { shown: 1, ignored: 2, ignoredTypes: ["anime", "other"], rows: 1 }, otherIdPrefixes: ["kitsu:"] }))).toEqual([
      "2 catalogues ignored (type anime, other): the apps only show movie and series catalogues",
      "Uses kitsu: ids: those titles may not open or play",
    ]);
  });
});
