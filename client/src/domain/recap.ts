import { formatDuration, type WatchStats } from "./stats";

/** What the shareable recap card says, worked out from the stats. Pure, so the wording is tested; the picture is drawn from it. */
export interface Recap {
  heading: string;
  /** The big number: "126 hours". */
  hours: string;
  /** A few short lines under it. */
  lines: string[];
}

/** Null when there is nothing to recap yet. */
export function recapOf(stats: WatchStats): Recap | null {
  if (stats.empty || stats.totalMs <= 0) return null;
  const lines: string[] = [];
  if (stats.topShow) lines.push(`Most watched show: ${stats.topShow.title}`);
  if (stats.topMovie) lines.push(`Most watched movie: ${stats.topMovie.title}`);
  if (stats.longestStreakDays >= 2) lines.push(`Longest streak: ${stats.longestStreakDays} days`);
  const counts: string[] = [];
  if (stats.moviesFinished > 0) counts.push(`${stats.moviesFinished} ${stats.moviesFinished === 1 ? "movie" : "movies"} finished`);
  if (stats.episodesWatched > 0) counts.push(`${stats.episodesWatched} ${stats.episodesWatched === 1 ? "episode" : "episodes"} watched`);
  if (counts.length > 0) lines.push(counts.join(" · "));
  return { heading: "My ArcTV recap", hours: formatDuration(stats.totalMs), lines };
}
