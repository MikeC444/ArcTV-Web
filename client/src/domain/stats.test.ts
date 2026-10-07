import { describe, expect, it } from "vitest";
import { computeStats, formatDuration, watchedMsOf, type HistoryItem } from "./stats";

const HOUR = 3600_000;
const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  providerId: "p",
  contentId: "tt1",
  contentType: "MOVIE",
  seasonNumber: null,
  episodeNumber: null,
  title: "A Film",
  posterUrl: null,
  positionMs: 2 * HOUR,
  durationMs: 2 * HOUR,
  completed: true,
  watchedAt: "2026-10-07T12:00:00",
  ...over,
});
// Local noon, so the weekday and day arithmetic doesn't depend on the machine's time zone.
const NOW = new Date("2026-10-07T18:00:00");

describe("watchedMsOf", () => {
  it("counts all of a finished title, how far in an unfinished one got, and never more than its length", () => {
    expect(watchedMsOf({ positionMs: 10, durationMs: 100, completed: true })).toBe(100);
    expect(watchedMsOf({ positionMs: 40, durationMs: 100, completed: false })).toBe(40);
    expect(watchedMsOf({ positionMs: 400, durationMs: 100, completed: false })).toBe(100);
    expect(watchedMsOf({ positionMs: 40, durationMs: 0, completed: false })).toBe(40);
    expect(watchedMsOf({ positionMs: -5, durationMs: 100, completed: false })).toBe(0);
  });
});

describe("computeStats", () => {
  it("is empty for no history", () => {
    const stats = computeStats([], NOW);
    expect(stats.empty).toBe(true);
    expect(stats.topTitles).toEqual([]);
    expect(stats.busiestWeekday).toBeNull();
  });

  it("totals the time, splits recent weeks and counts movies and episodes", () => {
    const stats = computeStats(
      [
        item({ contentId: "m1", watchedAt: "2026-10-06T20:00:00" }),
        item({ contentId: "m2", watchedAt: "2026-09-20T20:00:00", positionMs: 1 * HOUR, durationMs: 2 * HOUR, completed: false }),
        item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "A Show", positionMs: HOUR, durationMs: HOUR, watchedAt: "2026-10-05T20:00:00" }),
        item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 2, title: "A Show", positionMs: HOUR, durationMs: HOUR, watchedAt: "2026-10-04T20:00:00" }),
      ],
      NOW,
    );
    expect(stats.totalMs).toBe(2 * HOUR + 1 * HOUR + 1 * HOUR + 1 * HOUR);
    expect(stats.last7DaysMs).toBe(4 * HOUR);
    expect(stats.last30DaysMs).toBe(5 * HOUR);
    expect(stats.titlesWatched).toBe(3);
    expect(stats.moviesFinished).toBe(1);
    expect(stats.episodesWatched).toBe(2);
    expect(stats.showsWatched).toBe(1);
  });

  it("ranks titles by time, a show counting all its episodes together", () => {
    const stats = computeStats(
      [
        item({ contentId: "m1", title: "Short", positionMs: HOUR, durationMs: HOUR }),
        item({ contentId: "s1", contentType: "TV_SHOW", episodeNumber: 1, title: "Long Show", positionMs: HOUR, durationMs: HOUR, watchedAt: "2026-10-05T20:00:00" }),
        item({ contentId: "s1", contentType: "TV_SHOW", episodeNumber: 2, title: "Long Show", positionMs: HOUR, durationMs: HOUR, watchedAt: "2026-10-04T20:00:00" }),
      ],
      NOW,
    );
    expect(stats.topTitles.map((t) => t.title)).toEqual(["Long Show", "Short"]);
    expect(stats.topTitles[0]).toMatchObject({ watchedMs: 2 * HOUR, parts: 2 });
  });

  it("finds the busiest weekday, Monday first", () => {
    // 2026-10-05 is a Monday, 2026-10-07 a Wednesday.
    const stats = computeStats([item({ contentId: "a", watchedAt: "2026-10-05T20:00:00", positionMs: HOUR, durationMs: HOUR }), item({ contentId: "b", watchedAt: "2026-10-07T10:00:00" })], NOW);
    expect(stats.busiestWeekday).toBe(2);
    expect(stats.byWeekdayMs[0]).toBe(HOUR);
  });

  it("counts the streak back from today, or from yesterday when nothing is watched yet today", () => {
    const days = (list: string[]) => list.map((d, i) => item({ contentId: `x${i}`, watchedAt: `${d}T20:00:00` }));
    expect(computeStats(days(["2026-10-07", "2026-10-06", "2026-10-05", "2026-10-02"]), NOW).streakDays).toBe(3);
    expect(computeStats(days(["2026-10-06", "2026-10-05"]), NOW).streakDays).toBe(2);
    expect(computeStats(days(["2026-10-04"]), NOW).streakDays).toBe(0);
    expect(computeStats(days(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-06"]), NOW).longestStreakDays).toBe(3);
  });

  it("ignores rows with an unreadable date", () => {
    expect(computeStats([item({ watchedAt: "garbage" })], NOW).empty).toBe(true);
  });
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    expect(formatDuration(0)).toBe("0 minutes");
    expect(formatDuration(30_000)).toBe("under a minute");
    expect(formatDuration(60_000)).toBe("1 minute");
    expect(formatDuration(65 * 60_000)).toBe("1 hour 5 minutes");
    expect(formatDuration(2 * HOUR)).toBe("2 hours");
    expect(formatDuration(126 * HOUR + 5 * 60_000)).toBe("126 hours");
  });
});
