import type { AddonCatalogDef, Content } from "./types";

/**
 * The streaming services Home can offer as tiles (Netflix, Disney+ and so on). A tile only exists while an installed addon has a catalogue for the
 * service, found by the catalogue's own id or name, so nothing is shown for a service no addon provides, and an addon the person installs themselves
 * works the same as any other.
 */
export interface StreamingService {
  id: string;
  name: string;
  /** Words (the id or name split on anything that is not a letter or number, lower case) that mean this service. Includes the short ids some addons use. */
  words: string[];
}

/** In the order the tiles appear: the best known first, then the rest A to Z. */
export const STREAMING_SERVICES: readonly StreamingService[] = [
  { id: "netflix", name: "Netflix", words: ["netflix", "nfx"] },
  { id: "disney", name: "Disney+", words: ["disney", "disneyplus", "dnp"] },
  { id: "prime", name: "Prime Video", words: ["prime", "primevideo", "amazon", "amp"] },
  { id: "max", name: "HBO Max", words: ["hbo", "hbomax", "hbm", "max"] },
  { id: "apple", name: "Apple TV+", words: ["apple", "appletv", "atp"] },
  { id: "paramount", name: "Paramount+", words: ["paramount", "paramountplus", "pmp"] },
  { id: "hulu", name: "Hulu", words: ["hulu", "hlu"] },
  { id: "peacock", name: "Peacock", words: ["peacock"] },
  { id: "crunchyroll", name: "Crunchyroll", words: ["crunchyroll"] },
  { id: "skyshowtime", name: "SkyShowtime", words: ["skyshowtime"] },
  { id: "britbox", name: "BritBox", words: ["britbox"] },
  { id: "itvx", name: "ITVX", words: ["itvx"] },
  { id: "acorn", name: "Acorn TV", words: ["acorn", "acorntv"] },
  { id: "iplayer", name: "BBC iPlayer", words: ["iplayer", "bbciplayer"] },
  { id: "canal", name: "Canal+", words: ["canal", "canalplus"] },
  { id: "channel4", name: "Channel 4", words: ["channel4", "all4"] },
  { id: "claro", name: "Claro video", words: ["claro", "clarovideo"] },
  { id: "criterion", name: "Criterion Channel", words: ["criterion"] },
  { id: "globoplay", name: "Globoplay", words: ["globoplay"] },
  { id: "hayu", name: "Hayu", words: ["hayu"] },
  { id: "iqiyi", name: "iQIYI", words: ["iqiyi"] },
  { id: "movistar", name: "Movistar+", words: ["movistar"] },
  { id: "mubi", name: "MUBI", words: ["mubi"] },
  { id: "netflixkids", name: "Netflix Kids", words: ["netflixkids"] },
  { id: "sky", name: "Sky", words: ["sky"] },
  { id: "sonyliv", name: "Sony LIV", words: ["sonyliv"] },
  { id: "starz", name: "Starz", words: ["starz"] },
  { id: "videoland", name: "Videoland", words: ["videoland"] },
  { id: "viki", name: "Viki", words: ["viki"] },
  { id: "zee5", name: "ZEE5", words: ["zee5", "z5"] },
];

const BY_ID = new Map(STREAMING_SERVICES.map((s) => [s.id, s]));
export const streamingServiceById = (id: string): StreamingService | undefined => BY_ID.get(id);

const tokens = (text: string | null | undefined): string[] => (text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Words of eight letters or more also count when they sit inside the whole name run together ("Netflix Kids" is "netflixkids", "Sky Showtime" is "skyshowtime"). */
const LONG_WORD = 8;

/**
 * Which service a catalogue is for (by its name first, then its id), or null when it is not one of them. When more than one service fits ("Netflix Kids"
 * is both Netflix Kids and Netflix, "Sky Showtime" both SkyShowtime and Sky) the longest matching word wins.
 */
export function serviceOfCatalog(catalog: Pick<AddonCatalogDef, "id" | "name">): string | null {
  for (const source of [catalog.name, catalog.id]) {
    const found = tokens(source);
    if (found.length === 0) continue;
    const compact = found.join("");
    let best: { id: string; length: number } | null = null;
    for (const service of STREAMING_SERVICES) {
      for (const word of service.words) {
        const hit = found.includes(word) || (word.length >= LONG_WORD && compact.includes(word));
        if (hit && (!best || word.length > best.length)) best = { id: service.id, length: word.length };
      }
    }
    if (best) return best.id;
  }
  return null;
}

/** Service ids in tile order, each once. Ids that are not known are dropped. */
export function orderServices(ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return STREAMING_SERVICES.filter((s) => wanted.has(s.id)).map((s) => s.id);
}

/** The id Home Rows keeps in its hidden list for a service's tile (the same list that hides ordinary rows, so it is saved and synced with them). */
export const serviceRowId = (service: string): string => `streaming:${service}`;

/** Which of these services the person has not hidden. */
export const visibleServices = (services: string[], hiddenRowIds: readonly string[]): string[] => services.filter((s) => !hiddenRowIds.includes(serviceRowId(s)));

/**
 * A streaming-catalogue addon only lists titles: its own details for one (when it has any) are thin or wrong (a show with hundreds of episodes named after
 * files, a film with no year). A title with an IMDb id is the same title in the metadata addon (Cinemeta), so while that addon is installed such a title is
 * opened from it, exactly as if it had been found in Cinemeta's own lists. Titles without an IMDb id, or with no metadata addon, keep their own addon.
 */
export function withMetaOwner(items: Content[], installedProviderIds: readonly string[], metaProviderId: string): Content[] {
  if (!installedProviderIds.includes(metaProviderId)) return items;
  return items.map((c) => (/^tt\d+$/.test(c.id) && c.providerId !== metaProviderId ? { ...c, providerId: metaProviderId } : c));
}
