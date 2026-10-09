import { create } from "zustand";
import type { ContentType } from "../domain/types";
import type { Feedback } from "../domain/recommend/signals";
import { api, ApiClientError } from "../lib/api";
import { isoMs, monotonicIso } from "../lib/iso";
import { activeProfileId, DEFAULT_PROFILE_ID, profileKey } from "./profile";
import { Outbox, readJson, writeJson } from "./persist";

/** The addon id Cinemeta reports; used for feedback saved before the movie's provider was recorded. */
const DEFAULT_PROVIDER_ID = "com.linvo.cinemeta";

export interface FeedbackEntry {
  value: Feedback;
  title: string;
  /** When this feedback was given (the last-write-wins timestamp). */
  at: string;
  providerId?: string;
  /** Movie or TV show. Missing (older entries) means a movie. */
  contentType?: ContentType;
  /** True once the server has acknowledged exactly this entry. Entries without it (older, or given offline) are pushed on the next sync. */
  synced?: boolean;
}

/** Wire DTO of GET/POST/DELETE /user/feedback (the MangoTV backend's movie_feedback table). */
interface FeedbackDto {
  profileId: string;
  providerId: string;
  contentId: string;
  contentType: "MOVIE" | "TV_SHOW";
  title: string;
  feedback: Feedback;
  updatedAt: string;
  deletedAt?: string | null;
}

type Pending = { kind: "set"; dto: FeedbackDto } | { kind: "clear"; dto: FeedbackDto };

/** A movie or TV show being rated. */
export interface MovieRef {
  id: string;
  title: string;
  providerId?: string | null;
  type?: ContentType;
}

interface FeedbackState {
  userId: string | null;
  profileId: string;
  /** Explicit Like / Not for me per movie id, for the active profile only. The latest feedback replaces the earlier one. */
  entries: Record<string, FeedbackEntry>;
  hydrate(userId: string, profileId?: string): void;
  reset(): void;
  /** value = null clears the feedback. */
  set(movie: MovieRef, value: Feedback | null): void;
  /** Pressing Like when already liked clears it; pressing it when disliked switches it. */
  toggle(movie: MovieRef, value: Feedback): void;
  /** Reads this profile's feedback from the account (last-write-wins against what is on this device). Returns false when it could not be read. */
  pull(): Promise<boolean>;
  retryPending(): Promise<void>;
}

const naturalKey = (profileId: string, providerId: string, id: string) => `${profileId}|${providerId}|${id}`;
let outbox: Outbox<Pending> | null = null;

const persist = (state: Pick<FeedbackState, "userId" | "profileId" | "entries">) => {
  if (state.userId) writeJson(profileKey(state.userId, state.profileId, "feedback"), state.entries);
};

/**
 * Explicit taste feedback, per account and profile. Kept in this browser at once and synced to the account (so every device agrees):
 * changes are pushed immediately, queued when offline, and reconciled last-write-wins on their own timestamp, like My List.
 */
export const useFeedback = create<FeedbackState>((set, get) => {
  const commit = (entries: Record<string, FeedbackEntry>) => {
    set({ entries });
    persist({ userId: get().userId, profileId: get().profileId, entries });
  };

  const toDto = (id: string, entry: FeedbackEntry): FeedbackDto => ({
    profileId: get().profileId,
    providerId: entry.providerId ?? DEFAULT_PROVIDER_ID,
    contentId: id,
    contentType: entry.contentType ?? "MOVIE",
    title: entry.title,
    feedback: entry.value,
    updatedAt: entry.at,
  });

  /** Applies the server's authoritative row for one movie (it may have lost a last-write-wins race to another device). */
  function reconcile(dto: FeedbackDto) {
    if (dto.profileId !== get().profileId) return;
    const entries = { ...get().entries };
    if (dto.deletedAt) delete entries[dto.contentId];
    else entries[dto.contentId] = { value: dto.feedback, title: dto.title, at: dto.updatedAt, providerId: dto.providerId, contentType: dto.contentType, synced: true };
    commit(entries);
  }

  async function pushSet(dto: FeedbackDto) {
    const key = naturalKey(dto.profileId, dto.providerId, dto.contentId);
    try {
      reconcile(await api<FeedbackDto>("/user/feedback", { method: "POST", body: dto }));
      outbox?.remove(key);
    } catch {
      outbox?.put(key, { kind: "set", dto });
    }
  }

  async function pushClear(dto: FeedbackDto) {
    const key = naturalKey(dto.profileId, dto.providerId, dto.contentId);
    const query = new URLSearchParams({ profileId: dto.profileId, providerId: dto.providerId, contentId: dto.contentId, contentType: dto.contentType, updatedAt: dto.updatedAt });
    try {
      const response = await api<FeedbackDto | undefined>(`/user/feedback?${query}`, { method: "DELETE" });
      if (response) reconcile(response);
      outbox?.remove(key);
    } catch {
      outbox?.put(key, { kind: "clear", dto });
    }
  }

  return {
    userId: null,
    profileId: DEFAULT_PROFILE_ID,
    entries: {},

    hydrate(userId, profileId = activeProfileId(userId)) {
      outbox = new Outbox<Pending>(userId, `feedback:${profileId}`);
      set({ userId, profileId, entries: readJson<Record<string, FeedbackEntry>>(profileKey(userId, profileId, "feedback"), {}) });
    },
    reset() {
      outbox = null;
      set({ userId: null, profileId: DEFAULT_PROFILE_ID, entries: {} });
    },

    set(movie, value) {
      const { userId, profileId, entries } = get();
      if (!userId) return;
      const providerId = movie.providerId ?? entries[movie.id]?.providerId ?? DEFAULT_PROVIDER_ID;
      const at = monotonicIso(`fb|${naturalKey(profileId, providerId, movie.id)}`);
      const next = { ...entries };
      if (value === null) {
        const existing = next[movie.id];
        delete next[movie.id];
        commit(next);
        if (existing) void pushClear({ profileId, providerId: existing.providerId ?? providerId, contentId: movie.id, contentType: existing.contentType ?? "MOVIE", title: existing.title, feedback: existing.value, updatedAt: at });
        return;
      }
      const entry: FeedbackEntry = { value, title: movie.title, at, providerId, contentType: movie.type ?? entries[movie.id]?.contentType ?? "MOVIE", synced: false };
      next[movie.id] = entry;
      commit(next);
      void pushSet(toDto(movie.id, entry));
    },
    toggle(movie, value) {
      get().set(movie, get().entries[movie.id]?.value === value ? null : value);
    },

    async pull() {
      const { userId, profileId } = get();
      if (!userId) return false;
      try {
        const { items } = await api<{ items: FeedbackDto[] }>(`/user/feedback?${new URLSearchParams({ profileId })}`);
        const pending = outbox?.all() ?? {};
        const remote = new Map(items.filter((i) => i.profileId === profileId).map((i) => [i.contentId, i]));
        const next: Record<string, FeedbackEntry> = {};
        const toPush: Array<[string, FeedbackEntry]> = [];
        for (const [id, local] of Object.entries(get().entries)) {
          const server = remote.get(id);
          const key = naturalKey(profileId, local.providerId ?? DEFAULT_PROVIDER_ID, id);
          if (key in pending) next[id] = local; // a change made here that has not reached the server yet wins
          else if (!server) {
            if (local.synced) continue; // it was acknowledged once and is gone now: cleared on another device
            next[id] = local; // never reached the server (older or offline): send it up
            toPush.push([id, local]);
          } else if (!local.synced && isoMs(local.at) > isoMs(server.updatedAt)) {
            next[id] = local; // given here after the server's version
            toPush.push([id, local]);
          }
        }
        for (const [id, server] of remote) {
          if (id in next) continue;
          const key = naturalKey(profileId, server.providerId, id);
          if (key in pending) continue;
          next[id] = { value: server.feedback, title: server.title, at: server.updatedAt, providerId: server.providerId, contentType: server.contentType, synced: true };
        }
        commit(next);
        for (const [id, entry] of toPush) void pushSet(toDto(id, entry));
        return true;
      } catch {
        return false;
      }
    },

    async retryPending() {
      for (const [, pending] of Object.entries(outbox?.all() ?? {})) {
        try {
          if (pending.kind === "set") {
            reconcile(await api<FeedbackDto>("/user/feedback", { method: "POST", body: pending.dto }));
          } else {
            const query = new URLSearchParams({ profileId: pending.dto.profileId, providerId: pending.dto.providerId, contentId: pending.dto.contentId, contentType: pending.dto.contentType, updatedAt: pending.dto.updatedAt });
            const response = await api<FeedbackDto | undefined>(`/user/feedback?${query}`, { method: "DELETE" });
            if (response) reconcile(response);
          }
          outbox?.remove(naturalKey(pending.dto.profileId, pending.dto.providerId, pending.dto.contentId));
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.isNetwork)) return;
        }
      }
    },
  };
});
