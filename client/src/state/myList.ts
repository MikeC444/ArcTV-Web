import { create } from "zustand";
import { api, ApiClientError } from "../lib/api";
import { monotonicIso } from "../lib/iso";
import type { Content, ContentType } from "../domain/types";
import { Outbox, readJson, userKey, writeJson } from "./persist";

/** SavedListItem.kt — one My List entry. Server order (added_at ASC) is preserved; the UI shows newest first. */
export interface SavedListItem {
  id: string;
  type: ContentType;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  year: number | null;
  rating: number | null;
  providerId: string;
  watched: boolean;
  updatedAt: string;
}

/** Wire DTO of GET/POST/DELETE /user/watchlist. */
interface WatchlistDto {
  providerId: string;
  contentId: string;
  contentType: ContentType;
  title: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  year?: number | null;
  rating?: number | null;
  watched?: boolean;
  updatedAt: string;
  deletedAt?: string | null;
}

const naturalKey = (providerId: string, id: string, type: ContentType) => `${providerId}|${id}|${type}`;
const keyOfItem = (i: SavedListItem) => naturalKey(i.providerId, i.id, i.type);

function toDto(item: SavedListItem): WatchlistDto {
  return {
    providerId: item.providerId,
    contentId: item.id,
    contentType: item.type,
    title: item.title,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    year: item.year,
    rating: item.rating,
    watched: item.watched,
    updatedAt: item.updatedAt,
  };
}

function fromDto(dto: WatchlistDto): SavedListItem | null {
  if (dto.contentType !== "MOVIE" && dto.contentType !== "TV_SHOW") return null; // build/server skew — leave local state alone
  return {
    id: dto.contentId,
    type: dto.contentType,
    title: dto.title,
    posterUrl: dto.posterUrl ?? null,
    backdropUrl: dto.backdropUrl ?? null,
    year: dto.year ?? null,
    rating: dto.rating ?? null,
    providerId: dto.providerId,
    watched: dto.watched === true,
    updatedAt: dto.updatedAt,
  };
}

interface MyListState {
  userId: string | null;
  items: SavedListItem[];
  hydrate(userId: string): void;
  reset(): void;
  toggle(content: Content): void;
  markWatched(content: Content): void;
  toggleWatched(content: Content): void;
  pull(): Promise<boolean>;
  retryPending(): Promise<void>;
  /** Marks every finished movie in the account's watch history as watched (runs once per account per browser). */
  backfillWatchedFromHistory(): Promise<void>;
}

let outbox: Outbox<WatchlistDto> | null = null;

function persist(userId: string | null, items: SavedListItem[]) {
  if (userId) writeJson(userKey(userId, "myList"), items);
}

function snapshotFromContent(content: Content, providerId: string, watched: boolean): SavedListItem {
  return {
    id: content.id,
    type: content.type,
    title: content.title,
    posterUrl: content.posterUrl,
    backdropUrl: content.backdropUrl,
    year: content.year ?? null,
    rating: content.rating ?? null,
    providerId,
    watched,
    updatedAt: monotonicIso(`wl|${naturalKey(providerId, content.id, content.type)}`),
  };
}

export const useMyList = create<MyListState>((set, get) => {
  /** Applies the server's authoritative row for one item (it may have lost a last-write-wins race). */
  function reconcile(dto: WatchlistDto) {
    const current = get().items;
    const key = naturalKey(dto.providerId, dto.contentId, dto.contentType);
    const matches = (i: SavedListItem) => keyOfItem(i) === key;
    const remote = fromDto(dto);
    let next: SavedListItem[];
    if (dto.deletedAt) next = current.filter((i) => !matches(i));
    else if (!remote) next = current;
    else if (current.some(matches)) next = current.map((i) => (matches(i) ? remote : i));
    else next = [...current, remote];
    set({ items: next });
    persist(get().userId, next);
  }

  async function pushAdded(item: SavedListItem) {
    const dto = toDto(item);
    const key = keyOfItem(item);
    try {
      reconcile(await api<WatchlistDto>("/user/watchlist", { method: "POST", body: dto }));
      outbox?.remove(key);
    } catch {
      outbox?.put(key, dto);
    }
  }

  async function pushRemoved(item: { providerId: string; id: string; type: ContentType }, updatedAt: string) {
    const key = naturalKey(item.providerId, item.id, item.type);
    const pending: WatchlistDto = { providerId: item.providerId, contentId: item.id, contentType: item.type, title: "", updatedAt, deletedAt: updatedAt };
    const query = new URLSearchParams({ providerId: item.providerId, contentId: item.id, contentType: item.type, updatedAt });
    try {
      const response = await api<WatchlistDto | undefined>(`/user/watchlist?${query}`, { method: "DELETE" });
      if (response) reconcile(response);
      outbox?.remove(key);
    } catch {
      outbox?.put(key, pending);
    }
  }

  function commit(next: SavedListItem[]) {
    set({ items: next });
    persist(get().userId, next);
  }

  function upsertLocal(content: Content, watched: (existing: SavedListItem | undefined) => boolean | null) {
    const providerId = content.providerId;
    if (!providerId) return;
    const current = get().items;
    const existing = current.find((i) => i.id === content.id && i.providerId === providerId && i.type === content.type);
    const nextWatched = watched(existing);
    if (nextWatched === null) return; // no change
    const changed: SavedListItem = existing
      ? { ...existing, watched: nextWatched, updatedAt: monotonicIso(`wl|${naturalKey(providerId, content.id, content.type)}`) }
      : snapshotFromContent(content, providerId, nextWatched);
    commit(existing ? current.map((i) => (i === existing ? changed : i)) : [...current, changed]);
    void pushAdded(changed);
  }

  return {
    userId: null,
    items: [],

    hydrate(userId) {
      outbox = new Outbox<WatchlistDto>(userId, "watchlist");
      set({ userId, items: readJson<SavedListItem[]>(userKey(userId, "myList"), []) });
    },
    reset() {
      outbox = null;
      set({ userId: null, items: [] });
    },

    toggle(content) {
      const providerId = content.providerId;
      if (!providerId) return;
      const current = get().items;
      const existing = current.find((i) => i.id === content.id && i.providerId === providerId && i.type === content.type);
      if (existing) {
        commit(current.filter((i) => i !== existing));
        void pushRemoved(existing, monotonicIso(`wl|${keyOfItem(existing)}`));
      } else {
        const item = snapshotFromContent(content, providerId, false);
        commit([...current, item]);
        void pushAdded(item);
      }
    },

    markWatched(content) {
      upsertLocal(content, (existing) => (existing?.watched === true ? null : true));
    },

    toggleWatched(content) {
      upsertLocal(content, (existing) => (existing ? !existing.watched : true));
    },

    async pull() {
      try {
        const { items } = await api<{ items: WatchlistDto[] }>("/user/watchlist");
        const mapped = items.map(fromDto).filter((i): i is SavedListItem => i !== null);
        // Never clobber a local change that hasn't reached the server yet — retryPending() pushes it right after.
        const pending = outbox?.all() ?? {};
        const merged = Object.keys(pending).length
          ? mapped.filter((i) => !(keyOfItem(i) in pending)).concat(get().items.filter((i) => keyOfItem(i) in pending))
          : mapped;
        commit(merged);
        return true;
      } catch {
        return false;
      }
    },

    async retryPending() {
      const entries = Object.entries(outbox?.all() ?? {});
      for (const [key, dto] of entries) {
        try {
          if (dto.deletedAt) {
            const query = new URLSearchParams({ providerId: dto.providerId, contentId: dto.contentId, contentType: dto.contentType, updatedAt: dto.updatedAt });
            const response = await api<WatchlistDto | undefined>(`/user/watchlist?${query}`, { method: "DELETE" });
            if (response) reconcile(response);
          } else {
            reconcile(await api<WatchlistDto>("/user/watchlist", { method: "POST", body: dto }));
          }
          outbox?.remove(key);
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 401) return;
          if (error instanceof ApiClientError && error.isNetwork) return; // they'd all fail identically right now
        }
      }
    },

    async backfillWatchedFromHistory() {
      const userId = get().userId;
      if (!userId) return;
      const flag = userKey(userId, "watchedBackfillDone");
      if (readJson<boolean>(flag, false)) return;
      try {
        let before: string | undefined;
        for (;;) {
          const query = new URLSearchParams({ limit: "200" });
          if (before) query.set("before", before);
          const page = await api<{ items: Array<{ providerId: string; contentId: string; contentType: ContentType; title: string; posterUrl: string | null; completed: boolean; watchedAt: string }> }>(`/user/history?${query}`);
          if (page.items.length === 0) break;
          for (const entry of page.items) {
            if (entry.contentType === "MOVIE" && entry.completed) {
              get().markWatched({ id: entry.contentId, type: "MOVIE", title: entry.title, description: "", posterUrl: entry.posterUrl, backdropUrl: null, providerId: entry.providerId, genres: [], cast: [], seasons: [], watched: false });
            }
          }
          if (page.items.length < 200) break;
          before = page.items[page.items.length - 1]!.watchedAt;
        }
        writeJson(flag, true);
      } catch {
        /* try again next launch */
      }
    },
  };
});

