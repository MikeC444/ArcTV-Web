import { useMemo } from "react";
import { create } from "zustand";
import { blockedSet } from "../domain/blockedGenres";
import { globalKey, readJson, writeJson } from "./persist";

const KEY = globalKey("blockedGenres");

interface BlockedGenresState {
  genres: string[];
  toggle(genre: string): void;
  clear(): void;
}

/** Genres the person never wants to see. Kept in this browser (the account's synced settings have no field for it), so it is not shared with the TV app. */
export const useBlockedGenres = create<BlockedGenresState>((set, get) => {
  const save = (genres: string[]) => {
    set({ genres });
    writeJson(KEY, genres);
  };
  return {
    genres: readJson<string[]>(KEY, []),
    toggle(genre) {
      const current = get().genres;
      save(current.some((g) => g.toLowerCase() === genre.toLowerCase()) ? current.filter((g) => g.toLowerCase() !== genre.toLowerCase()) : [...current, genre]);
    },
    clear: () => save([]),
  };
});

/** The blocked genres as a lower-cased set, stable until the list changes. */
export function useBlockedSet(): Set<string> {
  const genres = useBlockedGenres((s) => s.genres);
  return useMemo(() => blockedSet(genres), [genres]);
}
