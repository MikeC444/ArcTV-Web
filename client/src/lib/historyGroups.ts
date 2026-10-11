/** One row of a user's watch history, as the developer panel receives it (newest first). */
export interface HistoryRow {
  profileId: string;
  title: string;
  contentType: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  positionMs: number;
  durationMs: number;
  completed: boolean;
  watchedAt: string;
}

/** What the panel shows for one run of history: a single row as it was, or several finished episodes of one season folded into one line. */
export interface HistoryGroup {
  title: string;
  seasonNumber: number | null;
  /** The newest time in the run. */
  watchedAt: string;
  /** Set for a single row. */
  single: HistoryRow | null;
  /** Finished episodes folded in (0 for a single row). */
  episodes: number;
  firstEpisode: number | null;
  lastEpisode: number | null;
}

/** Finished episodes of the same show and season within this long of each other count as one sitting (marking a season watched, or a binge). */
export const SAME_RUN_MS = 10 * 60_000;

const isEpisode = (r: HistoryRow): boolean => r.seasonNumber != null && r.episodeNumber != null;

/**
 * Tidies the history list for the panel. Rows that never got anywhere (not finished, nothing watched: an episode marked as not watched, or one
 * opened and left at once) are left out, and runs of finished episodes of one season close together in time become one line, so marking a
 * 12-episode season watched is one row instead of twelve. `rows` is newest first; so is the result.
 */
export function groupHistory(rows: HistoryRow[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  let open: { group: HistoryGroup; profileId: string; oldestMs: number; numbers: number[] } | null = null;
  for (const row of rows) {
    if (!row.completed && row.positionMs <= 0) continue;
    const at = Date.parse(row.watchedAt);
    if (row.completed && isEpisode(row)) {
      if (open && open.profileId === row.profileId && open.group.title === row.title && open.group.seasonNumber === row.seasonNumber && open.oldestMs - at <= SAME_RUN_MS) {
        open.numbers.push(row.episodeNumber!);
        open.oldestMs = at;
        open.group.episodes = open.numbers.length;
        open.group.firstEpisode = Math.min(...open.numbers);
        open.group.lastEpisode = Math.max(...open.numbers);
        continue;
      }
      const group: HistoryGroup = {
        title: row.title,
        seasonNumber: row.seasonNumber,
        watchedAt: row.watchedAt,
        single: row,
        episodes: 0,
        firstEpisode: row.episodeNumber,
        lastEpisode: row.episodeNumber
      };
      groups.push(group);
      open = { group, profileId: row.profileId, oldestMs: at, numbers: [row.episodeNumber!] };
      continue;
    }
    open = null;
    groups.push({ title: row.title, seasonNumber: row.seasonNumber, watchedAt: row.watchedAt, single: row, episodes: 0, firstEpisode: row.episodeNumber, lastEpisode: row.episodeNumber });
  }
  // A run of one stays a plain row; two or more fold into a summary line.
  for (const g of groups) if (g.episodes >= 2) g.single = null;
  return groups;
}

/** "E1–E12", or "E4" for one episode. */
export function episodeRange(g: HistoryGroup): string {
  if (g.firstEpisode == null || g.lastEpisode == null) return "";
  return g.firstEpisode === g.lastEpisode ? `E${g.firstEpisode}` : `E${g.firstEpisode}–E${g.lastEpisode}`;
}
