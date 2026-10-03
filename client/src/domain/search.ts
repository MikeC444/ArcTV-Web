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

const merge = (lists: Array<Content[] | undefined>): { movies: Content[]; tvShows: Content[] } => {
  const merged = distinctBy(interleave(lists.filter((l): l is Content[] => !!l)), (c) => c.id);
  return { movies: merged.filter((c) => c.type === "MOVIE"), tvShows: merged.filter((c) => c.type === "TV_SHOW") };
};

/**
 * SearchViewModel.kt — every addon is searched at once. Results are handed to `onUpdate` the moment each addon answers (so the first
 * quick answer shows straight away), always merged in the same addon order so rows don't jump around. Resolves with the final state.
 */
export async function searchProviders(providers: CatalogProvider[], query: string, onUpdate: (results: SearchResults) => void, timeoutMs = SEARCH_ADDON_TIMEOUT_MS): Promise<SearchResults> {
  const lists: Array<Content[] | undefined> = providers.map(() => undefined);
  let pending = providers.length;
  let failed = 0;
  const snapshot = (): SearchResults => ({ ...merge(lists), pending, failed });
  await Promise.all(
    providers.map(async (provider, index) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        lists[index] = await Promise.race([
          provider.search(query, (items) => {
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
