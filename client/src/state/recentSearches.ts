import { create } from "zustand";
import { useAuth } from "./auth";
import { globalKey, readJson, writeJson } from "./persist";
import { libraryKey } from "./profile";

export const RECENT_SEARCH_LIMIT = 8;

/** Puts a search at the front of the list: trimmed, a repeat (any letter case) moves up instead of doubling, and only the newest few are kept. */
export function withRecentSearch(list: string[], query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (q === "") return list;
  return [q, ...list.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_SEARCH_LIMIT);
}

/** Signed in: kept per profile (the account's own profile keeps the name it always had; wiped on sign-out with the rest). Not signed in: kept in this browser. */
const storageKey = (): string => {
  const userId = useAuth.getState().user?.id;
  return userId ? libraryKey(userId, "recent-searches") : globalKey("recentSearches");
};

interface RecentSearchesState {
  items: string[];
  /** Re-reads the list for whoever is signed in now. */
  load(): void;
  add(query: string): void;
  remove(query: string): void;
  clear(): void;
}

export const useRecentSearches = create<RecentSearchesState>((set, get) => ({
  items: [],
  load() {
    set({ items: readJson<string[]>(storageKey(), []).filter((s) => typeof s === "string") });
  },
  add(query) {
    const items = withRecentSearch(get().items, query);
    set({ items });
    writeJson(storageKey(), items);
  },
  remove(query) {
    const items = get().items.filter((s) => s !== query);
    set({ items });
    writeJson(storageKey(), items);
  },
  clear() {
    set({ items: [] });
    writeJson(storageKey(), []);
  },
}));
