import { create } from "zustand";
import { activeProfileId, DEFAULT_PROFILE_ID, profileKey } from "./profile";
import { readJson, writeJson } from "./persist";

interface PickedDismissedState {
  userId: string | null;
  profileId: string;
  /** Movie ids removed from the "Picked for you" row by the user. */
  ids: string[];
  hydrate(userId: string, profileId?: string): void;
  reset(): void;
  dismiss(id: string): void;
  /** Brings every removed title back into consideration. */
  clear(): void;
}

const keyFor = (userId: string, profileId: string) => profileKey(userId, profileId, "picked-dismissed");

/**
 * Titles taken out of the "Picked for you" row by hand. This is deliberately NOT taste feedback: it is not a Like or a Not for me, never
 * enters the interactions the recommendation is built from, and so cannot change the profile's preferences or any score. It only
 * keeps those titles out of the row (the next best candidate takes the place). Kept in this browser, per account and profile.
 */
export const usePickedDismissed = create<PickedDismissedState>((set, get) => ({
  userId: null,
  profileId: DEFAULT_PROFILE_ID,
  ids: [],
  hydrate(userId, profileId = activeProfileId(userId)) {
    set({ userId, profileId, ids: readJson<string[]>(keyFor(userId, profileId), []) });
  },
  reset() {
    set({ userId: null, profileId: DEFAULT_PROFILE_ID, ids: [] });
  },
  dismiss(id) {
    const { userId, profileId, ids } = get();
    if (!userId || ids.includes(id)) return;
    const next = [...ids, id];
    set({ ids: next });
    writeJson(keyFor(userId, profileId), next);
  },
  clear() {
    const { userId, profileId } = get();
    set({ ids: [] });
    if (userId) writeJson(keyFor(userId, profileId), []);
  },
}));
