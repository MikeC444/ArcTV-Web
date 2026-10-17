import type { AddonCatalogDef } from "./types";

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
  /** Switched off until the person turns it on (a service that is not listed first is more likely clutter than wanted). */
  off?: boolean;
}

/**
 * In the order the tiles appear until the person puts them in their own: the best known first, Shudder further back, then the rest. `off` marks a
 * service that is switched off until the person turns it on (see `isServiceVisible`), so a Home with many services stays tidy.
 */
export const STREAMING_SERVICES: readonly StreamingService[] = [
  { id: "netflix", name: "Netflix", words: ["netflix", "nfx"] },
  { id: "prime", name: "Prime Video", words: ["prime", "primevideo", "amazon", "amp"] },
  { id: "apple", name: "Apple TV+", words: ["apple", "appletv", "atp"] },
  { id: "max", name: "HBO Max", words: ["hbo", "hbomax", "hbm", "max"] },
  { id: "disney", name: "Disney+", words: ["disney", "disneyplus", "dnp"] },
  { id: "paramount", name: "Paramount+", words: ["paramount", "paramountplus", "pmp"] },
  { id: "hulu", name: "Hulu", words: ["hulu", "hlu"] },
  { id: "peacock", name: "Peacock", words: ["peacock", "pcp"] },
  { id: "iplayer", name: "BBC iPlayer", words: ["iplayer", "bbciplayer"] },
  { id: "shudder", name: "Shudder", words: ["shudder", "shd"] },
  { id: "crunchyroll", name: "Crunchyroll", words: ["crunchyroll", "cru"], off: true },
  { id: "skyshowtime", name: "SkyShowtime", words: ["skyshowtime", "sst"], off: true },
  { id: "britbox", name: "BritBox", words: ["britbox", "bbo"], off: true },
  { id: "itvx", name: "ITVX", words: ["itvx", "itv"], off: true },
  { id: "channel4", name: "Channel 4", words: ["channel4", "all4", "al4"], off: true },
  { id: "discovery", name: "Discovery+", words: ["discovery", "discoveryplus", "dpe"], off: true },
  { id: "sky", name: "Sky", words: ["sky", "sgo"], off: true },
  { id: "acorn", name: "Acorn TV", words: ["acorn", "acorntv", "act"], off: true },
  { id: "canal", name: "Canal+", words: ["canal", "canalplus", "cpd"], off: true },
  { id: "claro", name: "Claro video", words: ["claro", "clarovideo", "clv"], off: true },
  { id: "criterion", name: "Criterion Channel", words: ["criterion", "crc"], off: true },
  { id: "curiosity", name: "Curiosity Stream", words: ["curiosity", "curiositystream", "cts"], off: true },
  { id: "globoplay", name: "Globoplay", words: ["globoplay", "gop"], off: true },
  { id: "hayu", name: "Hayu", words: ["hayu", "hay"], off: true },
  { id: "iqiyi", name: "iQIYI", words: ["iqiyi", "iqi"], off: true },
  { id: "jiohotstar", name: "JioHotstar", words: ["jiohotstar", "hotstar", "jhs"], off: true },
  { id: "magellan", name: "MagellanTV", words: ["magellantv", "magellan", "mgl"], off: true },
  { id: "movistar", name: "Movistar+", words: ["movistar", "mp9"], off: true },
  { id: "mubi", name: "MUBI", words: ["mubi", "mbi"], off: true },
  { id: "netflixkids", name: "Netflix Kids", words: ["netflixkids", "nfk"], off: true },
  { id: "nlziet", name: "NLZIET", words: ["nlziet", "nlz"], off: true },
  { id: "sonyliv", name: "Sony LIV", words: ["sonyliv"], off: true },
  { id: "starz", name: "Starz", words: ["starz", "stz"], off: true },
  { id: "videoland", name: "Videoland", words: ["videoland", "vil"], off: true },
  { id: "viki", name: "Viki", words: ["viki", "vik"], off: true },
  { id: "zee5", name: "ZEE5", words: ["zee5", "z5", "zee"], off: true },
];

const BY_ID = new Map(STREAMING_SERVICES.map((s) => [s.id, s]));
export const streamingServiceById = (id: string): StreamingService | undefined => BY_ID.get(id);

const tokens = (text: string | null | undefined): string[] => (text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Words of seven letters or more also count when they sit inside the whole name run together ("Netflix Kids" is "netflixkids", "Sky Showtime" is "skyshowtime"). */
const LONG_WORD = 7;

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

/** The marker Home Rows keeps in the same hidden list when the person has turned a switched-off-by-default service on. */
export const serviceOnId = (service: string): string => `streaming-on:${service}`;

/** Is this service shown as a tile? Not when the person hid it; a service that is off by default only when they have turned it on. */
export function isServiceVisible(service: string, hiddenRowIds: readonly string[]): boolean {
  if (hiddenRowIds.includes(serviceRowId(service))) return false;
  return STREAMING_SERVICES.find((s) => s.id === service)?.off ? hiddenRowIds.includes(serviceOnId(service)) : true;
}

/** The hidden list after the person turns a service on or off in Home Rows. */
export function withServiceVisible(hiddenRowIds: readonly string[], service: string, visible: boolean): string[] {
  const rest = hiddenRowIds.filter((id) => id !== serviceRowId(service) && id !== serviceOnId(service));
  if (!visible) return [...rest, serviceRowId(service)];
  return STREAMING_SERVICES.find((s) => s.id === service)?.off ? [...rest, serviceOnId(service)] : rest;
}

/** Which of these services are shown as tiles. */
export const visibleServices = (services: string[], hiddenRowIds: readonly string[]): string[] => services.filter((s) => isServiceVisible(s, hiddenRowIds));

/** Is this entry in the Home Rows order a streaming service's (rather than an ordinary row's)? */
export const isServiceRowId = (id: string): boolean => id.startsWith("streaming:");

/**
 * Services in the person's own order: the ones they have placed (in the Home Rows order list, as `streaming:<id>`) in that order, then any not placed yet in
 * the default tile order. So a service an addon brings later joins at the end instead of jumping to the front.
 */
export function inUserOrder(services: readonly string[], order: readonly string[]): string[] {
  const placed = order.filter(isServiceRowId).map((entry) => entry.slice("streaming:".length)).filter((id) => services.includes(id));
  const placedSet = new Set(placed);
  return [...new Set(placed), ...services.filter((id) => !placedSet.has(id))];
}

/** One service moved up or down among `current`; null when it cannot move that way. */
export function moveService(current: readonly string[], service: string, delta: number): string[] | null {
  const ids = current.slice();
  const at = ids.indexOf(service);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= ids.length) return null;
  ids.splice(at, 1);
  ids.splice(to, 0, service);
  return ids;
}

/** The Home Rows order list with the services' part replaced by `services` (in that order); ordinary rows' entries are kept as they were. */
export const withServiceOrder = (order: readonly string[], services: readonly string[]): string[] => [...order.filter((id) => !isServiceRowId(id)), ...services.map(serviceRowId)];
