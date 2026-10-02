import { useMemo } from "react";
import { create } from "zustand";
import { blockedSet } from "../domain/blockedGenres";
import { KIDS_BLOCKED_GENRES } from "../domain/profiles";
import { globalKey, readJson, writeJson } from "./persist";
import { activeProfileOf, useProfiles } from "./profiles";
import { useSettings } from "./settings";

const KEY = globalKey("blockedGenres");

interface BlockedGenresState {
  genres: string[];
  toggle(genre: string): void;
  clear(): void;
}

const guestGenres = (): string[] => readJson<string[]>(KEY, []);

/**
 * Genres the person never wants to see. Signed in, the list lives in the account's synced settings, so it follows them to every device
 * (the TV app reads the same field). Not signed in, it stays in this browser. This store is what the screens read either way.
 */
export const useBlockedGenres = create<BlockedGenresState>((set, get) => {
  const save = (genres: string[]) => {
    if (useSettings.getState().userId) {
      set({ genres });
      useSettings.getState().setBlockedGenres(genres); // saved to the account (and kept locally with the rest of the settings)
    } else {
      set({ genres });
      writeJson(KEY, genres);
    }
  };
  // follow the account's list as it is pulled in or changed, and fall back to this browser's own list when signed out
  useSettings.subscribe((state, previous) => {
    if (state.userId) {
      if (state.blockedGenres !== previous.blockedGenres || state.userId !== previous.userId) set({ genres: state.blockedGenres });
    } else if (previous.userId) {
      set({ genres: guestGenres() });
    }
  });
  return {
    genres: useSettings.getState().userId ? useSettings.getState().blockedGenres : guestGenres(),
    toggle(genre) {
      const current = get().genres;
      save(current.some((g) => g.toLowerCase() === genre.toLowerCase()) ? current.filter((g) => g.toLowerCase() !== genre.toLowerCase()) : [...current, genre]);
    },
    clear: () => save([]),
  };
});

export const isKidsProfile = (): boolean => activeProfileOf(useProfiles.getState())?.kind === "kids";

/** What the screens hide right now: the profile's own Blocked Genres, plus the fixed kids list on a kids profile. */
export const effectiveBlockedSet = (): Set<string> => blockedSet(isKidsProfile() ? [...useBlockedGenres.getState().genres, ...KIDS_BLOCKED_GENRES] : useBlockedGenres.getState().genres);

/** The blocked genres as a lower-cased set, stable until the list (or the profile's kind) changes. */
export function useBlockedSet(): Set<string> {
  const genres = useBlockedGenres((s) => s.genres);
  const kids = useProfiles((s) => activeProfileOf(s)?.kind === "kids");
  return useMemo(() => blockedSet(kids ? [...genres, ...KIDS_BLOCKED_GENRES] : genres), [genres, kids]);
}
