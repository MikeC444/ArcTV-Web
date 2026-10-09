import { create } from "zustand";
import { PICKED_DISMISS_DAYS } from "../domain/recommend/config";
import { api, ApiClientError } from "../lib/api";
import { activeProfileId, DEFAULT_PROFILE_ID, profileKey } from "./profile";
import { Outbox, readJson, writeJson } from "./persist";

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
  /** Reads this profile's removals from the account and merges them with what is on this device (the later removal of a title wins). False when it could not be read. */
  pull(): Promise<boolean>;
  retryPending(): Promise<void>;
  /** Brings every removed title back into consideration. */
  clear(): void;
}

/** Wire DTO of GET/POST /user/picked-dismissals (the backend's picked_dismissals table). */
interface DismissalDto {
  profileId: string;
  contentId: string;
  dismissedAt: string;
}

let outbox: Outbox<DismissalDto> | null = null;
const ENDPOINT = "/user/picked-dismissals";

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
export const usePickedDismissed = create<PickedDismissedState>((set, get) => {
  const commit = (removedAt: Record<string, number>) => {
    const { userId, profileId } = get();
    set({ removedAt, ids: idsOf(removedAt) });
    if (userId) writeJson(keyFor(userId, profileId), removedAt);
  };

  /** Saves one removal on the account; if the server already holds a later removal of the same title, this device takes that one. */
  async function push(dto: DismissalDto) {
    try {
      const saved = await api<DismissalDto>(ENDPOINT, { method: "POST", body: dto });
      outbox?.remove(dto.contentId);
      const at = Date.parse(saved.dismissedAt);
      const mine = get().removedAt[dto.contentId];
      if (Number.isFinite(at) && mine !== undefined && at > mine) commit({ ...get().removedAt, [dto.contentId]: at });
    } catch {
      outbox?.put(dto.contentId, dto);
    }
  }

  return {
  userId: null,
  profileId: DEFAULT_PROFILE_ID,
  removedAt: {},
  ids: [],
  hydrate(userId, profileId = activeProfileId(userId)) {
    outbox = new Outbox<DismissalDto>(userId, `picked-dismissed:${profileId}`);
    const removedAt = activeRemovals(readJson<unknown>(keyFor(userId, profileId), {}), Date.now());
    writeJson(keyFor(userId, profileId), removedAt); // forget the expired ones, and keep the new format
    set({ userId, profileId, removedAt, ids: idsOf(removedAt) });
  },
  reset() {
    outbox = null;
    set({ userId: null, profileId: DEFAULT_PROFILE_ID, removedAt: {}, ids: [] });
  },
  dismiss(id) {
    const { userId, profileId } = get();
    if (!userId) return;
    const at = Date.now();
    commit({ ...activeRemovals(get().removedAt, at), [id]: at });
    void push({ profileId, contentId: id, dismissedAt: new Date(at).toISOString() });
  },

  async pull() {
    const { userId, profileId } = get();
    if (!userId) return false;
    try {
      const { items } = await api<{ items: DismissalDto[] }>(`${ENDPOINT}?${new URLSearchParams({ profileId })}`);
      const now = Date.now();
      const merged = activeRemovals(get().removedAt, now);
      const remote = new Map<string, number>();
      for (const item of items) {
        const at = Date.parse(item.dismissedAt);
        if (item.profileId !== profileId || !Number.isFinite(at)) continue;
        remote.set(item.contentId, at);
        if (now - at < DISMISS_MS && (merged[item.contentId] ?? 0) < at) merged[item.contentId] = at;
      }
      commit(merged);
      // anything removed here that the account has not heard about (made offline, or before this was synced) goes up now
      for (const [id, at] of Object.entries(merged)) if ((remote.get(id) ?? 0) < at) void push({ profileId, contentId: id, dismissedAt: new Date(at).toISOString() });
      return true;
    } catch {
      return false;
    }
  },

  async retryPending() {
    for (const [id, dto] of Object.entries(outbox?.all() ?? {})) {
      if (Date.now() - Date.parse(dto.dismissedAt) >= DISMISS_MS) {
        outbox?.remove(id); // too old to matter any more
        continue;
      }
      try {
        await api<DismissalDto>(ENDPOINT, { method: "POST", body: dto });
        outbox?.remove(id);
      } catch (error) {
        if (error instanceof ApiClientError && (error.status === 401 || error.isNetwork)) return;
      }
    }
  },
  clear() {
    commit({});
  },
  };
});
