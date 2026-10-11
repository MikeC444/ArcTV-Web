import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { episodeKey, episodeStatuses, type EpisodeStatus } from "../domain/episodeProgress";
import type { HistoryItem } from "../domain/stats";
import type { Content, Episode } from "../domain/types";
import { useContinueWatching } from "./continueWatching";

const PAGE = 200;
/** A very long history is read up to here (newest first) rather than without end. */
const MAX_PAGES = 25;
/** The history wants a length; used for an episode with no listed runtime when it is ticked off. */
const DEFAULT_EPISODE_MINUTES = 45;

async function loadShowHistory(providerId: string, contentId: string): Promise<Map<string, EpisodeStatus>> {
  const items: HistoryItem[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE) });
    if (before) query.set("before", before);
    const result = await api<{ items: HistoryItem[] }>(`/user/history?${query}`);
    const batch = Array.isArray(result.items) ? result.items : [];
    items.push(...batch);
    if (batch.length < PAGE) break;
    before = batch[batch.length - 1]!.watchedAt;
  }
  return episodeStatuses(items, providerId, contentId);
}

/**
 * Which episodes of a show the signed-in profile has watched, and how far into the others (GET /user/history, read once when the page opens).
 * Changes made on the page sit on top of that and are reported to the account, keeping the show's Continue Watching entry (the episode the
 * person is part-way through) as it was.
 */
export function useEpisodeStatuses(content: Content, providerId: string, signedIn: boolean) {
  const [loaded, setLoaded] = useState<Map<string, EpisodeStatus>>(new Map());
  const [changes, setChanges] = useState<Map<string, EpisodeStatus>>(new Map());
  const resume = useContinueWatching((s) => s.items.find((e) => e.providerId === providerId && e.contentId === content.id && e.contentType === content.type));

  useEffect(() => {
    if (!signedIn || content.type !== "TV_SHOW") return;
    let cancelled = false;
    loadShowHistory(providerId, content.id)
      .then((m) => !cancelled && setLoaded(m))
      .catch(() => undefined); // no ticks rather than an error: the page works without them
    return () => {
      cancelled = true;
    };
  }, [signedIn, providerId, content.id, content.type]);

  const statuses = useMemo(() => {
    const merged = new Map(loaded);
    changes.forEach((v, k) => merged.set(k, v));
    // The episode being watched right now has a live position the history may not have yet.
    if (resume?.seasonNumber != null && resume.episodeNumber != null && resume.durationMs > 0) {
      const key = episodeKey(resume.seasonNumber, resume.episodeNumber);
      if (!merged.get(key)?.watched) merged.set(key, { watched: false, fraction: Math.min(1, resume.positionMs / resume.durationMs) });
    }
    return merged;
  }, [loaded, changes, resume]);

  const setWatched = useCallback(
    (episodes: Episode[], watched: boolean) => {
      const changing = episodes.filter((e) => statuses.get(episodeKey(e.seasonNumber, e.episodeNumber))?.watched !== watched);
      if (changing.length === 0) return;
      setChanges((prev) => {
        const next = new Map(prev);
        for (const e of changing) next.set(episodeKey(e.seasonNumber, e.episodeNumber), { watched, fraction: watched ? 1 : 0 });
        return next;
      });
      const store = useContinueWatching.getState();
      for (const e of changing) {
        const durationMs = (e.runtimeMinutes ?? DEFAULT_EPISODE_MINUTES) * 60_000;
        const base = { providerId, contentId: content.id, contentType: content.type, seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, episodeTitle: e.title, title: content.title, posterUrl: content.posterUrl, backdropUrl: content.backdropUrl, durationMs };
        // A finished report clears the show's Continue Watching entry, so the one the person is really part-way through goes back afterwards.
        const keep = resume && !(resume.seasonNumber === e.seasonNumber && resume.episodeNumber === e.episodeNumber) ? resume : undefined;
        store.reportProgress({ ...base, positionMs: watched ? durationMs : 0, completed: watched });
        if (keep) store.reportProgress({ providerId: keep.providerId, contentId: keep.contentId, contentType: keep.contentType, seasonNumber: keep.seasonNumber, episodeNumber: keep.episodeNumber, episodeTitle: keep.episodeTitle, title: keep.title, posterUrl: keep.posterUrl, backdropUrl: keep.backdropUrl, positionMs: keep.positionMs, durationMs: keep.durationMs, completed: false });
        else if (!watched) store.removeEntry(providerId, content.id, content.type);
      }
    },
    [statuses, resume, providerId, content]
  );

  return { statuses, setWatched };
}
