import { describe, expect, it } from "vitest";
import { episodeKey, episodeStatuses, firstUnwatched } from "./episodeProgress";
import type { HistoryItem } from "./stats";
import type { Season } from "./types";

const row = (over: Partial<HistoryItem>): HistoryItem => ({ providerId: "p", contentId: "tt1", contentType: "TV_SHOW", seasonNumber: 1, episodeNumber: 1, title: "Show", posterUrl: null, positionMs: 0, durationMs: 1000, completed: false, watchedAt: "2026-01-01T00:00:00.000Z", ...over });
const ep = (s: number, e: number) => ({ id: `${s}-${e}`, seasonNumber: s, episodeNumber: e, title: "t", description: "", thumbnailUrl: null, runtimeMinutes: 40 });
const seasons: Season[] = [{ seasonNumber: 1, name: "S1", episodes: [ep(1, 1), ep(1, 2)] }, { seasonNumber: 2, name: "S2", episodes: [ep(2, 1)] }];

describe("episodeStatuses", () => {
  it("uses the newest row per episode", () => {
    const m = episodeStatuses([row({ positionMs: 0, completed: false }), row({ completed: true, positionMs: 1000 })], "p", "tt1");
    expect(m.get("1:1")).toEqual({ watched: false, fraction: 0 });
  });
  it("reports part-way fractions and ignores other shows", () => {
    const m = episodeStatuses([row({ episodeNumber: 2, positionMs: 250 }), row({ contentId: "other", completed: true })], "p", "tt1");
    expect(m.get("1:2")).toEqual({ watched: false, fraction: 0.25 });
    expect(m.size).toBe(1);
  });
  it("counts completed as full", () => {
    expect(episodeStatuses([row({ completed: true })], "p", "tt1").get("1:1")).toEqual({ watched: true, fraction: 1 });
  });
});

describe("firstUnwatched", () => {
  it("skips watched episodes in order", () => {
    const m = episodeStatuses([row({ completed: true }), row({ episodeNumber: 2, completed: true })], "p", "tt1");
    expect(firstUnwatched(seasons, m)?.id).toBe("2-1");
  });
  it("is undefined once everything is watched", () => {
    const m = new Map([[episodeKey(1, 1), { watched: true, fraction: 1 }], [episodeKey(1, 2), { watched: true, fraction: 1 }], [episodeKey(2, 1), { watched: true, fraction: 1 }]]);
    expect(firstUnwatched(seasons, m)).toBeUndefined();
  });
});
