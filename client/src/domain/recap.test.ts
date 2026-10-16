import { describe, expect, it } from "vitest";
import { recapOf } from "./recap";
import { computeStats, type HistoryItem } from "./stats";

const NOW = new Date("2026-10-16T12:00:00");
const HOUR = 3600_000;
const item = (over: Partial<HistoryItem>): HistoryItem => ({ providerId: "p", contentId: "c", contentType: "MOVIE", seasonNumber: null, episodeNumber: null, title: "T", posterUrl: null, positionMs: HOUR, durationMs: HOUR, completed: true, watchedAt: new Date(NOW.getTime() - HOUR).toISOString(), ...over });

describe("the recap card", () => {
  it("has nothing to say without a history", () => {
    expect(recapOf(computeStats([], NOW))).toBeNull();
  });
  it("names the hours, the top show and movie, the best streak and the counts", () => {
    const recap = recapOf(
      computeStats(
        [
          item({ contentId: "m", title: "Big Movie", positionMs: 2 * HOUR, durationMs: 2 * HOUR }),
          item({ contentId: "s", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "The Show" }),
          item({ contentId: "s", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 2, title: "The Show", watchedAt: new Date(NOW.getTime() - 25 * HOUR).toISOString() }),
        ],
        NOW,
      ),
    )!;
    expect(recap.heading).toBe("My ArcTV recap");
    expect(recap.hours).toBe("4 hours");
    expect(recap.lines).toEqual(["Most watched show: The Show", "Most watched movie: Big Movie", "Longest streak: 2 days", "1 movie finished · 2 episodes watched"]);
  });
  it("leaves out what does not apply", () => {
    const recap = recapOf(computeStats([item({ contentId: "m", title: "Only Movie" })], NOW))!;
    expect(recap.lines).toEqual(["Most watched movie: Only Movie", "1 movie finished"]);
  });
});
