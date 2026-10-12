import { distinctBy, interleave } from "../lib/format";
import type { CatalogProvider } from "./provider";
import type { Content } from "./types";

/** How long Search waits for any one addon. A slow addon is left behind instead of holding up everyone else's results. */
export const SEARCH_ADDON_TIMEOUT_MS = 6000;

export interface SearchResults {
  movies: Content[];
  tvShows: Content[];
  /** Addons that have not answered yet (and have not timed out). */
  pending: number;
  /** Addons that failed or timed out. */
  failed: number;
}

const mergeAll = (lists: Array<Content[] | undefined>): Content[] => distinctBy(interleave(lists.filter((l): l is Content[] => !!l)), (c) => c.id);

const merge = (lists: Array<Content[] | undefined>): { movies: Content[]; tvShows: Content[] } => {
  const merged = distinctBy(interleave(lists.filter((l): l is Content[] => !!l)), (c) => c.id);
  return { movies: merged.filter((c) => c.type === "MOVIE"), tvShows: merged.filter((c) => c.type === "TV_SHOW") };
};

interface Collected {
  lists: Array<Content[] | undefined>;
  pending: number;
  failed: number;
}

/** Asks every provider at once, tells `onUpdate` after each answer (or partial answer), and gives up on a provider after `timeoutMs`. */
async function collect(
  providers: CatalogProvider[],
  ask: (provider: CatalogProvider, onPartial: (items: Content[]) => void) => Promise<Content[]>,
  onUpdate: (state: Collected) => void,
  timeoutMs: number,
): Promise<Collected> {
  const lists: Array<Content[] | undefined> = providers.map(() => undefined);
  let pending = providers.length;
  let failed = 0;
  const snapshot = (): Collected => ({ lists: lists.slice(), pending, failed });
  await Promise.all(
    providers.map(async (provider, index) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        lists[index] = await Promise.race([
          ask(provider, (items) => {
            lists[index] = items;
            onUpdate(snapshot());
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
          }),
        ]);
      } catch {
        failed++;
      } finally {
        clearTimeout(timer);
        pending--;
      }
      onUpdate(snapshot());
    }),
  );
  return snapshot();
}

/**
 * SearchViewModel.kt — every addon is searched at once. Results are handed to `onUpdate` the moment each addon answers (so the first
 * quick answer shows straight away), always merged in the same addon order so rows don't jump around. Resolves with the final state.
 */
export async function searchProviders(providers: CatalogProvider[], query: string, onUpdate: (results: SearchResults) => void, timeoutMs = SEARCH_ADDON_TIMEOUT_MS): Promise<SearchResults> {
  const toResults = (c: Collected): SearchResults => ({ ...merge(c.lists), pending: c.pending, failed: c.failed });
  return toResults(await collect(providers, (provider, onPartial) => provider.search(query, onPartial), (c) => onUpdate(toResults(c)), timeoutMs));
}

export interface AnimeSearchResults {
  items: Content[];
  pending: number;
  failed: number;
}

/**
 * The anime-only search: asks only the addons that have anime catalogues (`hasAnimeSearch`), the same way. Callers pass just those addons; with none,
 * nothing is asked and the result is empty, so people without an anime addon never see an anime line.
 */
export async function searchAnime(providers: CatalogProvider[], query: string, onUpdate: (results: AnimeSearchResults) => void, timeoutMs = SEARCH_ADDON_TIMEOUT_MS): Promise<AnimeSearchResults> {
  const asking = providers.filter((p) => p.hasAnimeSearch === true && typeof p.searchAnime === "function");
  const toResults = (c: Collected): AnimeSearchResults => ({ items: mergeAll(c.lists), pending: c.pending, failed: c.failed });
  return toResults(await collect(asking, (provider, onPartial) => provider.searchAnime!(query, onPartial), (c) => onUpdate(toResults(c)), timeoutMs));
}
