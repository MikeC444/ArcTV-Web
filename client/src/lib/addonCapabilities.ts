/** What an addon's manifest says it offers, in the terms of what the apps do with it (see the backend's describeManifest). */
export interface AddonCapabilities {
  /** In a fixed order: catalog, meta, stream, subtitles. */
  offers: string[];
  catalogs: { shown: number; ignored: number; ignoredTypes: string[]; rows: number };
  /** Id prefixes that are not IMDb's ("kitsu:"): titles with those ids may not open or play. */
  otherIdPrefixes: string[];
}

/** The pills shown for an addon: what it gives the apps, e.g. ["Home rows ≈4", "Details", "Sources"], or ["Nothing used"] when it offers none of the four. */
export function offerChips(caps: AddonCapabilities): string[] {
  const chips: string[] = [];
  if (caps.offers.includes("catalog")) chips.push(caps.catalogs.shown > 0 ? `Home rows ≈${caps.catalogs.rows}` : "No Home rows");
  if (caps.offers.includes("meta")) chips.push("Details");
  if (caps.offers.includes("stream")) chips.push("Sources");
  if (caps.offers.includes("subtitles")) chips.push("Subtitles");
  return chips.length > 0 ? chips : ["Nothing used"];
}

/** An id prefix as a person reads it: "kitsu:" -> "kitsu", "bestcine_tv_" -> "bestcine_tv". */
const prefixName = (prefix: string): string => prefix.replace(/[:_]+$/, "");

/** How many prefixes the short note names before saying "+N more". */
const PREFIXES_SHOWN = 3;

/** One short note for something worth a second look, with the full explanation to show on hover. */
export interface AddonNote {
  text: string;
  title: string;
}

/** Things worth a second look for this addon, each one short; empty when nothing stands out. */
export function addonNotes(caps: AddonCapabilities): AddonNote[] {
  const notes: AddonNote[] = [];
  if (caps.catalogs.ignored > 0) {
    const n = caps.catalogs.ignored;
    const types = caps.catalogs.ignoredTypes.join(", ");
    notes.push({
      text: `${n} ${types} ${n === 1 ? "catalogue" : "catalogues"} not shown`,
      title: `The apps only show movie and series catalogues, so ${n === 1 ? "this one (type" : "these (type"} ${types}) will not make any Home rows.${caps.catalogs.ignoredTypes.includes("anime") ? " The web app shows anime catalogues on its Anime tab; the TV, phone and Mac apps do not yet." : ""}`,
    });
  }
  const prefixes = caps.otherIdPrefixes.map(prefixName);
  if (prefixes.length > 0) {
    const shown = prefixes.slice(0, PREFIXES_SHOWN).join(", ");
    notes.push({
      text: `Other ids: ${shown}${prefixes.length > PREFIXES_SHOWN ? ` +${prefixes.length - PREFIXES_SHOWN} more` : ""}`,
      title: `Titles with these id types (${prefixes.join(", ")}) may not open or play in the apps, which are built around IMDb ids.`,
    });
  }
  return notes;
}
