import { create } from "zustand";
import type { Feedback } from "../domain/recommend/signals";
import { nowIso } from "../lib/iso";
import { activeProfileId, DEFAULT_PROFILE_ID, profileKey } from "./profile";
import { readJson, writeJson } from "./persist";

export interface FeedbackEntry {
  value: Feedback;
  title: string;
  at: string;
}

interface FeedbackState {
  userId: string | null;
  profileId: string;
  /** Explicit Like / Not for me per movie id, for the active profile only. The latest feedback replaces the earlier one. */
  entries: Record<string, FeedbackEntry>;
  hydrate(userId: string, profileId?: string): void;
  reset(): void;
  /** value = null removes the feedback. Setting the same value again keeps it (use `toggle` for the button behaviour). */
  set(movie: { id: string; title: string }, value: Feedback | null): void;
  /** Pressing Like when already liked clears it; pressing it when disliked switches it. */
  toggle(movie: { id: string; title: string }, value: Feedback): void;
}

const persist = (state: Pick<FeedbackState, "userId" | "profileId" | "entries">) => {
  if (state.userId) writeJson(profileKey(state.userId, state.profileId, "feedback"), state.entries);
};

/** Explicit taste feedback. Kept in this browser (the account's synced data has no field for it), separately for each profile. */
export const useFeedback = create<FeedbackState>((set, get) => ({
  userId: null,
  profileId: DEFAULT_PROFILE_ID,
  entries: {},
  hydrate(userId, profileId = activeProfileId(userId)) {
    set({ userId, profileId, entries: readJson<Record<string, FeedbackEntry>>(profileKey(userId, profileId, "feedback"), {}) });
  },
  reset() {
    set({ userId: null, profileId: DEFAULT_PROFILE_ID, entries: {} });
  },
  set(movie, value) {
    const { userId, profileId, entries } = get();
    if (!userId) return;
    const next = { ...entries };
    if (value === null) delete next[movie.id];
    else next[movie.id] = { value, title: movie.title, at: nowIso() };
    set({ entries: next });
    persist({ userId, profileId, entries: next });
  },
  toggle(movie, value) {
    get().set(movie, get().entries[movie.id]?.value === value ? null : value);
  },
}));
