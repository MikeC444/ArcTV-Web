import { describe, expect, it } from "vitest";
import { addonNotes, offerChips, type AddonCapabilities } from "./addonCapabilities";

const caps = (over: Partial<AddonCapabilities> = {}): AddonCapabilities => ({ offers: [], catalogs: { shown: 0, ignored: 0, ignoredTypes: [], rows: 0 }, otherIdPrefixes: [], ...over });

describe("addon capabilities", () => {
  it("lists what an addon gives the apps as short pills", () => {
    expect(offerChips(caps({ offers: ["catalog", "meta"], catalogs: { shown: 2, ignored: 0, ignoredTypes: [], rows: 5 } }))).toEqual(["Home rows ≈5", "Details"]);
    expect(offerChips(caps({ offers: ["stream"] }))).toEqual(["Sources"]);
    expect(offerChips(caps({ offers: ["subtitles"] }))).toEqual(["Subtitles"]);
    expect(offerChips(caps())).toEqual(["Nothing used"]);
  });

  it("says no Home rows when catalogues exist but none are a type the apps show", () => {
    expect(offerChips(caps({ offers: ["catalog"], catalogs: { shown: 0, ignored: 2, ignoredTypes: ["anime"], rows: 0 } }))).toEqual(["No Home rows"]);
  });

  it("writes one short note for ignored catalogues and one for other id types, and nothing else", () => {
    expect(addonNotes(caps())).toEqual([]);
    const notes = addonNotes(caps({ catalogs: { shown: 1, ignored: 2, ignoredTypes: ["anime", "other"], rows: 1 }, otherIdPrefixes: ["kitsu:"] }));
    expect(notes.map((n) => n.text)).toEqual(["2 anime, other catalogues not shown", "Other ids: kitsu"]);
    expect(notes[0]!.title).toContain("only show movie and series");
  });

  it("names the first few id types and counts the rest", () => {
    const [note] = addonNotes(caps({ otherIdPrefixes: ["123av:", "asiangirl:", "epr:", "erome:", "hub:"] }));
    expect(note!.text).toBe("Other ids: 123av, asiangirl, epr +2 more");
    expect(note!.title).toContain("hub");
  });

  it("reads a single ignored catalogue in the singular", () => {
    expect(addonNotes(caps({ catalogs: { shown: 0, ignored: 1, ignoredTypes: ["tv"], rows: 0 } }))[0]!.text).toBe("1 tv catalogue not shown");
  });
});
