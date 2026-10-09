import { create } from "zustand";
import { PICKED_DISMISS_DAYS } from "../domain/recommend/config";
import { activeProfileId, DEFAULT_PROFILE_ID, profileKey } from "./profile";
import { readJson, writeJson } from "./persist";

const DISMISS_MS = PICKED_DISMISS_DAYS * 24 * 60 * 60 * 1000;

interface PickedDismissedState {
  userId: string | null;
  profileId: string;
  /** Title id -> when it was removed from the "Picked for you" row (ms). Only removals less than PICKED_DISMISS_DAYS old are kept. */
  removedAt: Record<string, number>;
  /** The ids still kept out of the row (every key of `removedAt`). */
  ids: string[];
  hydrate(userId: string, profileId?: string): void;
  reset(): void;
  dismiss(id: string): void;
  /** Brings every removed title back into consideration. */
  clear(): void;
}

const keyFor = (userId: string, profileId: string) => profileKey(userId, profileId, "picked-dismissed");

/** Reads what is saved, dropping removals older than the window. The first version saved a plain list of ids: those start their window now. */
export function activeRemovals(saved: unknown, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(saved)) {
    for (const id of saved) if (typeof id === "string") out[id] = now;
  } else if (saved && typeof saved === "object") {
    for (const [id, at] of Object.entries(saved as Record<string, unknown>)) if (typeof at === "number" && now - at < DISMISS_MS) out[id] = at;
  }
  return out;
}

const idsOf = (removedAt: Record<string, number>): string[] => Object.keys(removedAt);

/**
 * Titles taken out of the "Picked for you" row by hand. This is deliberately NOT taste feedback: it is not a Like or a Not for me, never
 * enters the interactions the recommendation is built from, and so cannot change the profile's preferences or any score. It only
 * keeps those titles out of the row for PICKED_DISMISS_DAYS days (the next best candidate takes the place); after that the title is an
 * ordinary candidate again and the algorithm decides whether it is still worth showing. Kept in this browser, per account and profile.
 */
export const usePickedDismissed = create<PickedDismissedState>((set, get) => ({
  userId: null,
  profileId: DEFAULT_PROFILE_ID,
  removedAt: {},
  ids: [],
  hydrate(userId, profileId = activeProfileId(userId)) {
    const removedAt = activeRemovals(readJson<unknown>(keyFor(userId, profileId), {}), Date.now());
    writeJson(keyFor(userId, profileId), removedAt); // forget the expired ones, and keep the new format
    set({ userId, profileId, removedAt, ids: idsOf(removedAt) });
  },
  reset() {
    set({ userId: null, profileId: DEFAULT_PROFILE_ID, removedAt: {}, ids: [] });
  },
  dismiss(id) {
    const { userId, profileId } = get();
    if (!userId) return;
    const removedAt = { ...activeRemovals(get().removedAt, Date.now()), [id]: Date.now() };
    set({ removedAt, ids: idsOf(removedAt) });
    writeJson(keyFor(userId, profileId), removedAt);
  },
  clear() {
    const { userId, profileId } = get();
    set({ removedAt: {}, ids: [] });
    if (userId) writeJson(keyFor(userId, profileId), {});
  },
}));
