import { create } from "zustand";
import { api, ApiClientError } from "../lib/api";
import { isoMs, monotonicIso } from "../lib/iso";
import type { ContentType } from "../domain/types";
import { Outbox, readJson, writeJson } from "./persist";
import { libraryKey, libraryName } from "./profile";

/** ContinueWatchingEntry.kt */
export interface ContinueWatchingEntry {
  providerId: string;
  contentId: string;
  contentType: ContentType;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  positionMs: number;
  durationMs: number;
  lastWatchedAt: string;
}

/** Wire DTO of POST /user/watch-progress. */
export interface WatchProgressRequest {
  providerId: string;
  contentId: string;
  contentType: ContentType;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  positionMs: number;
  durationMs: number;
  completed: boolean;
  watchedAt: string;
}

interface ContinueWatchingDto extends Omit<ContinueWatchingEntry, "seasonNumber" | "episodeNumber" | "episodeTitle" | "posterUrl" | "backdropUrl"> {
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  deletedAt?: string | null;
}

const keyOf = (providerId: string, contentId: string, type: ContentType) => `${providerId}|${contentId}|${type}`;

function fromDto(dto: ContinueWatchingDto): ContinueWatchingEntry | null {
  if (dto.contentType !== "MOVIE" && dto.contentType !== "TV_SHOW") return null;
  return {
    providerId: dto.providerId,
    contentId: dto.contentId,
    contentType: dto.contentType,
    seasonNumber: dto.seasonNumber ?? null,
    episodeNumber: dto.episodeNumber ?? null,
    episodeTitle: dto.episodeTitle ?? null,
    title: dto.title,
    posterUrl: dto.posterUrl ?? null,
    backdropUrl: dto.backdropUrl ?? null,
    positionMs: Number(dto.positionMs),
    durationMs: Number(dto.durationMs),
    lastWatchedAt: dto.lastWatchedAt,
  };
}

/** Movies finishing past this fraction drop out of Continue Watching (and count as watched). */
export const COMPLETION_THRESHOLD = 0.85;
/** Any real watching is saved (a second or more); a source that never played reports 0 and is not. */
export const MIN_REPORTABLE_POSITION_MS = 1_000;

interface ContinueWatchingState {
  userId: string | null;
  items: ContinueWatchingEntry[];
  hydrate(userId: string): void;
  reset(): void;
  findResumePoint(providerId: string, contentId: string, type: ContentType): ContinueWatchingEntry | undefined;
  /** Optimistic local update + server report (PlaybackProgress reporting and "Remove from Continue Watching" when completed=true). */
  reportProgress(input: Omit<WatchProgressRequest, "watchedAt">, options?: { keepalive?: boolean }): void;
  pull(): Promise<boolean>;
  retryPending(): Promise<void>;
}

let outbox: Outbox<WatchProgressRequest> | null = null;

export const useContinueWatching = create<ContinueWatchingState>((set, get) => {
  const commit = (items: ContinueWatchingEntry[]) => {
    set({ items });
    const uid = get().userId;
    if (uid) writeJson(libraryKey(uid, "continueWatching"), items);
  };
  const remove = (providerId: string, contentId: string, type: ContentType) =>
    commit(get().items.filter((e) => keyOf(e.providerId, e.contentId, e.contentType) !== keyOf(providerId, contentId, type)));
  const upsert = (entry: ContinueWatchingEntry) =>
    commit([entry, ...get().items.filter((e) => keyOf(e.providerId, e.contentId, e.contentType) !== keyOf(entry.providerId, entry.contentId, entry.contentType))]);

  function reconcile(providerId: string, contentId: string, type: ContentType, dto: ContinueWatchingDto | null) {
    if (!dto || dto.deletedAt) return remove(providerId, contentId, type);
    const entry = fromDto(dto);
    if (entry) upsert(entry);
  }

  return {
    userId: null,
    items: [],

    hydrate(userId) {
      outbox = new Outbox<WatchProgressRequest>(userId, libraryName("continueWatching"));
      set({ userId, items: readJson<ContinueWatchingEntry[]>(libraryKey(userId, "continueWatching"), []) });
    },
    reset() {
      outbox = null;
      set({ userId: null, items: [] });
    },

    findResumePoint(providerId, contentId, type) {
      return get().items.find((e) => keyOf(e.providerId, e.contentId, e.contentType) === keyOf(providerId, contentId, type));
    },

    reportProgress(input, options) {
      const watchedAt = monotonicIso(`cw|${keyOf(input.providerId, input.contentId, input.contentType)}`);
      const request: WatchProgressRequest = { ...input, watchedAt };
      const key = keyOf(input.providerId, input.contentId, input.contentType);
      if (input.completed) remove(input.providerId, input.contentId, input.contentType);
      else
        upsert({
          providerId: input.providerId,
          contentId: input.contentId,
          contentType: input.contentType,
          seasonNumber: input.seasonNumber,
          episodeNumber: input.episodeNumber,
          episodeTitle: input.episodeTitle,
          title: input.title,
          posterUrl: input.posterUrl,
          backdropUrl: input.backdropUrl,
          positionMs: input.positionMs,
          durationMs: input.durationMs,
          lastWatchedAt: watchedAt,
        });

      void (async () => {
        try {
          const response = await api<{ continueWatching: ContinueWatchingDto | null }>("/user/watch-progress", { method: "POST", body: request, keepalive: options?.keepalive });
          reconcile(input.providerId, input.contentId, input.contentType, response.continueWatching);
          outbox?.remove(key);
        } catch {
          outbox?.put(key, request);
        }
      })();
    },

    async pull() {
      try {
        const { items } = await api<{ items: ContinueWatchingDto[] }>("/user/continue-watching");
        const pending = outbox?.all() ?? {};
        const remote = items.map(fromDto).filter((e): e is ContinueWatchingEntry => e !== null);
        // keep local entries whose newer report hasn't landed yet
        const local = get().items.filter((e) => keyOf(e.providerId, e.contentId, e.contentType) in pending && !pending[keyOf(e.providerId, e.contentId, e.contentType)]?.completed);
        const merged = [...local, ...remote.filter((r) => !local.some((l) => keyOf(l.providerId, l.contentId, l.contentType) === keyOf(r.providerId, r.contentId, r.contentType)))];
        commit(merged.sort((a, b) => isoMs(b.lastWatchedAt) - isoMs(a.lastWatchedAt)));
        return true;
      } catch {
        return false;
      }
    },

    async retryPending() {
      for (const [key, request] of Object.entries(outbox?.all() ?? {})) {
        try {
          const response = await api<{ continueWatching: ContinueWatchingDto | null }>("/user/watch-progress", { method: "POST", body: request });
          reconcile(request.providerId, request.contentId, request.contentType, response.continueWatching);
          outbox?.remove(key);
        } catch (error) {
          if (error instanceof ApiClientError && (error.status === 401 || error.isNetwork)) return;
        }
      }
    },
  };
});
