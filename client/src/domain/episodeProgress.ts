import type { HistoryItem } from "./stats";
import type { Episode, Season } from "./types";

/** How one episode stands: finished (or ticked off), or part-way through (`fraction` of its length, 0 to 1). */
export interface EpisodeStatus {
  watched: boolean;
  fraction: number;
}

export const episodeKey = (season: number, episode: number): string => `${season}:${episode}`;

/** Anything under this is "just opened", not worth a bar. */
const MIN_FRACTION = 0.02;

/** The status of each episode of one show, from history rows (newest first: the newest row for an episode is the one that counts). */
export function episodeStatuses(rows: HistoryItem[], providerId: string, contentId: string): Map<string, EpisodeStatus> {
  const map = new Map<string, EpisodeStatus>();
  for (const row of rows) {
    if (row.providerId !== providerId || row.contentId !== contentId || row.contentType !== "TV_SHOW" || row.seasonNumber == null || row.episodeNumber == null) continue;
    const key = episodeKey(row.seasonNumber, row.episodeNumber);
    if (map.has(key)) continue;
    const fraction = row.durationMs > 0 ? Math.min(1, Math.max(0, row.positionMs / row.durationMs)) : 0;
    map.set(key, row.completed ? { watched: true, fraction: 1 } : { watched: false, fraction: fraction >= MIN_FRACTION ? fraction : 0 });
  }
  return map;
}

/** The first episode, in order, that is not watched (specials in season 0 come last). Undefined when every episode is watched. */
export function firstUnwatched(seasons: Season[], statuses: Map<string, EpisodeStatus>): Episode | undefined {
  const ordered = [...seasons].sort((a, b) => (a.seasonNumber || Infinity) - (b.seasonNumber || Infinity));
  for (const season of ordered) for (const episode of season.episodes) if (!statuses.get(episodeKey(episode.seasonNumber, episode.episodeNumber))?.watched) return episode;
  return undefined;
}
