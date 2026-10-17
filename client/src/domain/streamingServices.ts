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
}

/** In the order the tiles appear. */
export const STREAMING_SERVICES: readonly StreamingService[] = [
  { id: "netflix", name: "Netflix", words: ["netflix", "nfx"] },
  { id: "disney", name: "Disney+", words: ["disney", "disneyplus", "dnp"] },
  { id: "prime", name: "Prime Video", words: ["prime", "primevideo", "amazon", "amp"] },
  { id: "max", name: "HBO Max", words: ["hbo", "hbomax", "hbm", "max"] },
  { id: "apple", name: "Apple TV+", words: ["apple", "appletv", "atp"] },
  { id: "paramount", name: "Paramount+", words: ["paramount", "paramountplus", "pmp"] },
  { id: "hulu", name: "Hulu", words: ["hulu", "hlu"] },
];

const BY_ID = new Map(STREAMING_SERVICES.map((s) => [s.id, s]));
export const streamingServiceById = (id: string): StreamingService | undefined => BY_ID.get(id);

const tokens = (text: string | null | undefined): string[] => (text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Which service a catalogue is for (by its name first, then its id), or null when it is not one of them. */
export function serviceOfCatalog(catalog: Pick<AddonCatalogDef, "id" | "name">): string | null {
  for (const source of [catalog.name, catalog.id]) {
    const found = tokens(source);
    if (found.length === 0) continue;
    const hit = STREAMING_SERVICES.find((s) => s.words.some((w) => found.includes(w)));
    if (hit) return hit.id;
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
