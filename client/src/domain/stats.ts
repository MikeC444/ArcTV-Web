/**
 * "Your stats": what the account's watch history says about how it is used. Pure, so every number is tested directly. The history holds
 * one row per movie or episode (the furthest point reached and when it was last watched), so a title watched twice counts once, on the
 * day it was last watched.
 */
export interface HistoryItem {
  providerId: string;
  contentId: string;
  contentType: "MOVIE" | "TV_SHOW";
  seasonNumber: number | null;
  episodeNumber: number | null;
  title: string;
  posterUrl: string | null;
  positionMs: number;
  durationMs: number;
  completed: boolean;
  /** ISO time it was last watched. */
  watchedAt: string;
}

export interface TopTitle {
  title: string;
  posterUrl: string | null;
  type: "MOVIE" | "TV_SHOW";
  watchedMs: number;
  /** Episodes of a show watched (1 for a movie). */
  parts: number;
}

export interface WatchStats {
  /** Nothing in the history yet. */
  empty: boolean;
  totalMs: number;
  last7DaysMs: number;
  last30DaysMs: number;
  titlesWatched: number;
  moviesFinished: number;
  episodesWatched: number;
  showsWatched: number;
  /** Milliseconds watched per weekday, Monday first. */
  byWeekdayMs: number[];
  /** Index into [byWeekdayMs] (Monday = 0) of the busiest day, or null with no history. */
  busiestWeekday: number | null;
  /** Consecutive days with something watched, counting back from today (or from yesterday, when nothing was watched yet today). */
  streakDays: number;
  /** The longest run of consecutive days with something watched, ever. */
  longestStreakDays: number;
  topTitles: TopTitle[];
  firstWatchedAt: string | null;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_MS = 24 * 3600_000;

/** How much of one row counts as watched: all of it when finished, otherwise how far in it got (never more than its length). */
export function watchedMsOf(item: Pick<HistoryItem, "positionMs" | "durationMs" | "completed">): number {
  const position = Math.max(0, item.positionMs);
  if (item.durationMs > 0) return item.completed ? item.durationMs : Math.min(position, item.durationMs);
  return position;
}

/** Local calendar day as a whole number (days since 1970 in the local time zone), so day arithmetic survives clock changes. */
function localDay(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

export function computeStats(items: readonly HistoryItem[], now: Date = new Date(), topCount = 5): WatchStats {
  const valid = items.filter((i) => Number.isFinite(Date.parse(i.watchedAt)));
  if (valid.length === 0) {
    return { empty: true, totalMs: 0, last7DaysMs: 0, last30DaysMs: 0, titlesWatched: 0, moviesFinished: 0, episodesWatched: 0, showsWatched: 0, byWeekdayMs: [0, 0, 0, 0, 0, 0, 0], busiestWeekday: null, streakDays: 0, longestStreakDays: 0, topTitles: [], firstWatchedAt: null };
  }
  const nowMs = now.getTime();
  let totalMs = 0;
  let last7 = 0;
  let last30 = 0;
  let moviesFinished = 0;
  let episodesWatched = 0;
  let first = Infinity;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const days = new Set<number>();
  const titles = new Map<string, TopTitle>();
  const shows = new Set<string>();
  for (const item of valid) {
    const ms = watchedMsOf(item);
    const at = Date.parse(item.watchedAt);
    totalMs += ms;
    if (nowMs - at <= 7 * DAY_MS) last7 += ms;
    if (nowMs - at <= 30 * DAY_MS) last30 += ms;
    first = Math.min(first, at);
    // getDay(): Sunday = 0; the week here starts on Monday.
    byWeekday[(new Date(at).getDay() + 6) % 7]! += ms;
    if (ms > 0) days.add(localDay(at));
    const key = `${item.providerId}|${item.contentId}|${item.contentType}`;
    const entry = titles.get(key) ?? { title: item.title, posterUrl: item.posterUrl, type: item.contentType, watchedMs: 0, parts: 0 };
    entry.watchedMs += ms;
    entry.parts += ms > 0 ? 1 : 0;
    titles.set(key, entry);
    if (item.contentType === "MOVIE") {
      if (item.completed) moviesFinished++;
    } else {
      shows.add(key);
      if (item.completed) episodesWatched++;
    }
  }
  const busiest = Math.max(...byWeekday);

  const ordered = [...days].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  ordered.forEach((day, i) => {
    run = i > 0 && day === ordered[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const today = localDay(nowMs);
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor--;
  }

  return {
    empty: false,
    totalMs,
    last7DaysMs: last7,
    last30DaysMs: last30,
    titlesWatched: titles.size,
    moviesFinished,
    episodesWatched,
    showsWatched: shows.size,
    byWeekdayMs: byWeekday,
    busiestWeekday: busiest > 0 ? byWeekday.indexOf(busiest) : null,
    streakDays: streak,
    longestStreakDays: longest,
    topTitles: [...titles.values()].filter((t) => t.watchedMs > 0).sort((a, b) => b.watchedMs - a.watchedMs).slice(0, topCount),
    firstWatchedAt: new Date(first).toISOString(),
  };
}

/** "126 hours" / "1 hour 5 minutes" / "40 minutes" / "under a minute", for the big numbers. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return ms > 0 ? "under a minute" : "0 minutes";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const m = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  if (hours === 0) return m;
  // Past a day's worth the minutes are noise.
  return hours >= 24 || minutes === 0 ? h : `${h} ${m}`;
}
