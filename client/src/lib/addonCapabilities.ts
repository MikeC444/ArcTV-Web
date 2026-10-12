/** What an addon's manifest says it offers, in the terms of what the apps do with it (see the backend's describeManifest). */
export interface AddonCapabilities {
  /** In a fixed order: catalog, meta, stream, subtitles. */
  offers: string[];
  catalogs: { shown: number; ignored: number; ignoredTypes: string[]; rows: number };
  /** Id prefixes that are not IMDb's ("kitsu:"): titles with those ids may not open or play. */
  otherIdPrefixes: string[];
}

/** "Home rows (about 4) · Details · Sources", or "Nothing the apps use" when it offers none of the four. */
export function offerSummary(caps: AddonCapabilities): string {
  const parts: string[] = [];
  if (caps.offers.includes("catalog")) parts.push(caps.catalogs.shown > 0 ? `Home rows (about ${caps.catalogs.rows})` : "Catalogues, none the apps use");
  if (caps.offers.includes("meta")) parts.push("Details");
  if (caps.offers.includes("stream")) parts.push("Sources");
  if (caps.offers.includes("subtitles")) parts.push("Subtitles");
  return parts.length > 0 ? parts.join(" · ") : "Nothing the apps use";
}

/** Things worth a second look for this addon, each one short; empty when nothing stands out. */
export function addonWarnings(caps: AddonCapabilities): string[] {
  const out: string[] = [];
  if (caps.catalogs.ignored > 0) {
    const types = caps.catalogs.ignoredTypes.join(", ");
    out.push(`${caps.catalogs.ignored} ${caps.catalogs.ignored === 1 ? "catalogue" : "catalogues"} ignored (type ${types}): the apps only show movie and series catalogues`);
  }
  if (caps.otherIdPrefixes.length > 0) out.push(`Uses ${caps.otherIdPrefixes.join(", ")} ids: those titles may not open or play`);
  return out;
}
