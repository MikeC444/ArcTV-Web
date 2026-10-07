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
  /** The 7 days before the last 7 (to say whether this week was busier or quieter). */
  prev7DaysMs: number;
  /** Time in movies and in episodes of shows. */
  movieMs: number;
  showMs: number;
  /** Days with something watched, and the average watched on those days. */
  activeDays: number;
  avgPerActiveDayMs: number;
  /** Time watched per local day for the last [HEAT_DAYS] days, oldest first (the last entry is today). */
  dailyMs: number[];
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

/** How many days the activity grid covers: 13 weeks. */
export const HEAT_DAYS = 91;
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
    return { empty: true, totalMs: 0, last7DaysMs: 0, last30DaysMs: 0, prev7DaysMs: 0, movieMs: 0, showMs: 0, activeDays: 0, avgPerActiveDayMs: 0, dailyMs: new Array<number>(HEAT_DAYS).fill(0), titlesWatched: 0, moviesFinished: 0, episodesWatched: 0, showsWatched: 0, byWeekdayMs: [0, 0, 0, 0, 0, 0, 0], busiestWeekday: null, streakDays: 0, longestStreakDays: 0, topTitles: [], firstWatchedAt: null };
  }
  const nowMs = now.getTime();
  let totalMs = 0;
  let last7 = 0;
  let last30 = 0;
  let prev7 = 0;
  let movieMs = 0;
  let showMs = 0;
  const today = localDay(nowMs);
  const dailyMs = new Array<number>(HEAT_DAYS).fill(0);
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
    if (nowMs - at > 7 * DAY_MS && nowMs - at <= 14 * DAY_MS) prev7 += ms;
    if (item.contentType === "MOVIE") movieMs += ms;
    else showMs += ms;
    const ago = today - localDay(at);
    if (ago >= 0 && ago < HEAT_DAYS) dailyMs[HEAT_DAYS - 1 - ago]! += ms;
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
    prev7DaysMs: prev7,
    movieMs,
    showMs,
    activeDays: days.size,
    avgPerActiveDayMs: days.size > 0 ? totalMs / days.size : 0,
    dailyMs,
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

/** "45m" / "3h" / "12.5h" for a bar label; empty for nothing. */
export function formatShort(ms: number): string {
  if (!(ms > 0)) return "";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = ms / 3600_000;
  return hours < 10 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours)}h`;
}

/** This week against the one before: "up 18%", "down 30%", "the same", or null when there is nothing to compare. */
export function weekChange(last7: number, prev7: number): { direction: "up" | "down" | "same"; percent: number } | null {
  if (!(prev7 > 0)) return null;
  const percent = Math.round(((last7 - prev7) / prev7) * 100);
  return { direction: percent > 0 ? "up" : percent < 0 ? "down" : "same", percent: Math.abs(percent) };
}

export interface HeatCell {
  /** Milliseconds watched that day; null for the blank cells that start the first week on a Monday. */
  ms: number | null;
  /** 0 (nothing) to 4 (the busiest days). */
  level: 0 | 1 | 2 | 3 | 4;
  /** "Mon 5 Oct" for the tooltip. */
  label: string;
}

/** The activity grid's cells, week by week (Monday first), column by column: pad to a Monday, then one cell per day. */
export function heatCells(dailyMs: readonly number[], now: Date = new Date()): HeatCell[] {
  const max = Math.max(...dailyMs, 0);
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dailyMs.length - 1));
  const pad = (first.getDay() + 6) % 7;
  const cells: HeatCell[] = Array.from({ length: pad }, () => ({ ms: null, level: 0, label: "" }));
  dailyMs.forEach((ms, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const level = ms <= 0 || max <= 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((ms / max) * 4))) as 1 | 2 | 3 | 4);
    cells.push({ ms, level, label: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) });
  });
  return cells;
}
