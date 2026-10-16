import { describe, expect, it } from "vitest";
import { afterReset, computeStats, isMarkedByHand, formatDuration, formatShort, heatCells, heatMax, heatMonthLabels, HEAT_DAYS, streakNote, watchedMsOf, weekChange, weekdayLine, type HistoryItem } from "./stats";

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
        item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "A Show", positionMs: HOUR - 1, durationMs: HOUR, watchedAt: "2026-10-05T20:00:00" }),
        item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 2, title: "A Show", positionMs: HOUR - 1, durationMs: HOUR, watchedAt: "2026-10-04T20:00:00" }),
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
        item({ contentId: "s1", contentType: "TV_SHOW", episodeNumber: 1, title: "Long Show", positionMs: HOUR - 1, durationMs: HOUR, watchedAt: "2026-10-05T20:00:00" }),
        item({ contentId: "s1", contentType: "TV_SHOW", episodeNumber: 2, title: "Long Show", positionMs: HOUR - 1, durationMs: HOUR, watchedAt: "2026-10-04T20:00:00" }),
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

describe("the extra numbers", () => {
  it("compares weeks, splits movies from shows and fills the daily grid", () => {
    const stats = computeStats(
      [
        item({ contentId: "m1", watchedAt: "2026-10-06T20:00:00" }), // this week, 2 h
        item({ contentId: "m2", watchedAt: "2026-09-28T20:00:00", positionMs: HOUR, durationMs: HOUR }), // the week before, 1 h
        item({ contentId: "s1", contentType: "TV_SHOW", episodeNumber: 1, positionMs: HOUR - 1, durationMs: HOUR, watchedAt: "2026-10-07T10:00:00" }),
      ],
      NOW,
    );
    expect(stats.last7DaysMs).toBe(3 * HOUR);
    expect(stats.prev7DaysMs).toBe(HOUR);
    expect(stats.movieMs).toBe(3 * HOUR);
    expect(stats.showMs).toBe(HOUR);
    expect(stats.activeDays).toBe(3);
    expect(stats.avgPerActiveDayMs).toBeCloseTo((4 * HOUR) / 3);
    expect(stats.dailyMs).toHaveLength(HEAT_DAYS);
    expect(stats.dailyMs[HEAT_DAYS - 1]).toBe(HOUR); // today
    expect(stats.dailyMs[HEAT_DAYS - 2]).toBe(2 * HOUR); // yesterday
  });

  it("says how this week compares", () => {
    expect(weekChange(3, 2)).toEqual({ direction: "up", percent: 50 });
    expect(weekChange(1, 2)).toEqual({ direction: "down", percent: 50 });
    expect(weekChange(2, 2)).toEqual({ direction: "same", percent: 0 });
    expect(weekChange(5, 0)).toBeNull();
  });

  it("labels bars compactly", () => {
    expect(formatShort(0)).toBe("");
    expect(formatShort(20_000)).toBe("1m");
    expect(formatShort(45 * 60_000)).toBe("45m");
    expect(formatShort(2.5 * HOUR)).toBe("2.5h");
    expect(formatShort(14 * HOUR)).toBe("14h");
  });

  it("starts the activity grid on a Monday and grades the days", () => {
    const daily = new Array<number>(HEAT_DAYS).fill(0);
    daily[HEAT_DAYS - 1] = 4 * HOUR;
    daily[HEAT_DAYS - 2] = HOUR;
    const cells = heatCells(daily, NOW);
    expect(cells.length % 7 === 0 || cells.length > HEAT_DAYS).toBe(true);
    const pad = cells.findIndex((c) => c.ms !== null);
    // 2026-07-09 (the first of the 91 days ending 2026-10-07) is a Thursday: three blank cells put it under Thursday.
    expect(pad).toBe(3);
    expect(cells.at(-1)).toMatchObject({ ms: 4 * HOUR, level: 4 });
    expect(cells.at(-2)).toMatchObject({ ms: HOUR, level: 1 });
    expect(cells[pad]).toMatchObject({ ms: 0, level: 0 });
  });
});

describe("the extra numbers", () => {
  const day = 24 * 3600_000;
  it("compares the last 30 days with the 30 before, and names the top movie and top show", () => {
    const stats = computeStats(
      [
        item({ contentId: "m1", title: "Big Movie", watchedAt: new Date(NOW.getTime() - 3 * day).toISOString(), positionMs: 2 * HOUR, durationMs: 2 * HOUR, completed: true }),
        item({ contentId: "m2", title: "Old Movie", watchedAt: new Date(NOW.getTime() - 40 * day).toISOString(), positionMs: HOUR, durationMs: HOUR, completed: true }),
        item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "Show", watchedAt: new Date(NOW.getTime() - 5 * day).toISOString(), positionMs: HOUR / 2 - 1, durationMs: HOUR / 2, completed: true }),
      ],
      NOW,
    );
    expect(stats.last30DaysMs).toBe(2.5 * HOUR);
    expect(stats.prev30DaysMs).toBe(HOUR);
    expect(stats.topMovie?.title).toBe("Big Movie");
    expect(stats.topShow?.title).toBe("Show");
    expect(computeStats([], NOW).topMovie).toBeNull();
    expect(computeStats([item({ contentId: "m1", positionMs: HOUR, durationMs: HOUR, completed: true })], NOW).topShow).toBeNull();
  });

  it("says how far the streak is from the best one", () => {
    expect(streakNote(5, 6)).toBe("best 6 · 1 day to match it");
    expect(streakNote(2, 6)).toBe("best 6 · 4 days to match it");
    expect(streakNote(6, 6)).toBe("your best");
    expect(streakNote(0, 6)).toBe("best 6");
    expect(streakNote(0, 0)).toBeNull();
  });

  it("says which weekday is the busiest, in plain words", () => {
    expect(weekdayLine(0)).toBe("You watch most on Mondays.");
    expect(weekdayLine(6)).toBe("You watch most on Sundays.");
    expect(weekdayLine(null)).toBeNull();
  });

  it("labels the activity grid with the month where a new one starts, never two names side by side", () => {
    const daily = new Array<number>(HEAT_DAYS).fill(0);
    const cells = heatCells(daily, NOW);
    const labels = heatMonthLabels(cells, "en-US");
    expect(labels).toHaveLength(Math.ceil(cells.length / 7));
    const named = labels.filter(Boolean);
    expect(named.length).toBeGreaterThanOrEqual(3); // 13 weeks span at least three months
    expect(new Set(named).size).toBe(named.length); // each month named once
    labels.forEach((label, i) => {
      if (label && labels[i + 1]) throw new Error(`two month names side by side at column ${i}`);
    });
    expect(cells.filter((c) => c.ms !== null).every((c) => c.month !== null)).toBe(true);
    expect(cells.filter((c) => c.ms === null).every((c) => c.month === null)).toBe(true);
  });

  it("knows what the darkest square stands for", () => {
    expect(heatMax([0, 3 * HOUR, HOUR])).toBe(3 * HOUR);
    expect(heatMax([])).toBe(0);
  });
});

describe("afterReset", () => {
  const a = item({ contentId: "a", watchedAt: "2026-10-01T12:00:00.000Z" });
  const b = item({ contentId: "b", watchedAt: "2026-10-10T12:00:00.000Z" });
  it("keeps everything when stats were never reset, or the time is not a time", () => {
    expect(afterReset([a, b], null)).toEqual([a, b]);
    expect(afterReset([a, b], "garbage")).toEqual([a, b]);
  });
  it("keeps only what was watched at or after the reset", () => {
    expect(afterReset([a, b], "2026-10-05T00:00:00.000Z")).toEqual([b]);
    expect(afterReset([a, b], "2026-10-10T12:00:00.000Z")).toEqual([b]);
    expect(afterReset([a, b], "2026-11-01T00:00:00.000Z")).toEqual([]);
  });
  it("starts the numbers again: the totals only count what came after", () => {
    const all = computeStats([a, b], NOW);
    const fresh = computeStats(afterReset([a, b], "2026-10-05T00:00:00.000Z"), NOW);
    expect(fresh.totalMs).toBeLessThan(all.totalMs);
    expect(fresh.moviesFinished).toBe(1);
    expect(computeStats(afterReset([a, b], "2026-11-01T00:00:00.000Z"), NOW).empty).toBe(true);
  });
});

describe("episodes only ticked as watched by hand", () => {
  const MIN = 60_000;
  const played = item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "Show", positionMs: 45 * MIN - 1234, durationMs: 45 * MIN, completed: true, watchedAt: "2026-10-07T10:00:00" });
  const ticked = item({ contentId: "s1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 2, title: "Show", positionMs: 45 * MIN, durationMs: 45 * MIN, completed: true, markedManually: true, watchedAt: "2026-10-06T10:00:00" });

  it("are recognised by the account's flag, or, for older rows, by the listed runtime used as both position and length", () => {
    expect(isMarkedByHand(ticked)).toBe(true);
    expect(isMarkedByHand({ ...played, markedManually: true })).toBe(true);
    expect(isMarkedByHand(played)).toBe(false);
    // a row from before the flag: a whole-minute length with the position exactly at the end
    expect(isMarkedByHand({ ...ticked, markedManually: undefined })).toBe(true);
    expect(isMarkedByHand({ ...ticked, markedManually: false })).toBe(true);
    // not for a movie, an unfinished episode, or one whose length is not whole minutes
    expect(isMarkedByHand({ ...ticked, markedManually: undefined, contentType: "MOVIE" })).toBe(false);
    expect(isMarkedByHand({ ...ticked, markedManually: undefined, completed: false })).toBe(false);
    expect(isMarkedByHand({ ...ticked, markedManually: undefined, positionMs: 45 * MIN + 17, durationMs: 45 * MIN + 17 })).toBe(false);
  });

  it("do not count as time watched, episodes watched, a day watched or the top show", () => {
    const stats = computeStats([played, ticked], NOW);
    expect(stats.totalMs).toBe(45 * MIN);
    expect(stats.episodesWatched).toBe(1);
    expect(stats.activeDays).toBe(1);
    expect(stats.dailyMs.reduce((a, b) => a + b, 0)).toBe(45 * MIN);
    expect(stats.topShow?.parts).toBe(1);
    expect(stats.streakDays).toBeLessThanOrEqual(1);
  });

  it("leave nothing when every row was only ticked", () => {
    expect(computeStats([ticked], NOW).empty).toBe(true);
  });
});
