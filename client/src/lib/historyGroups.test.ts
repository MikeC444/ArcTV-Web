import { describe, expect, it } from "vitest";
import { episodeRange, groupHistory, type HistoryRow } from "./historyGroups";

const row = (episode: number | null, at: string, extra: Partial<HistoryRow> = {}): HistoryRow => ({
  profileId: "p1", title: "Ted Lasso", contentType: "TV_SHOW", seasonNumber: episode == null ? null : 2, episodeNumber: episode,
  positionMs: 1_800_000, durationMs: 1_800_000, completed: true, watchedAt: at, ...extra
});

describe("groupHistory", () => {
  it("folds a season marked watched at once into one line", () => {
    const rows = [row(3, "2026-10-11T16:00:03Z"), row(2, "2026-10-11T16:00:02Z"), row(1, "2026-10-11T16:00:01Z")];
    const groups = groupHistory(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.single).toBeNull();
    expect(groups[0]!.episodes).toBe(3);
    expect(episodeRange(groups[0]!)).toBe("E1–E3");
    expect(groups[0]!.watchedAt).toBe("2026-10-11T16:00:03Z");
  });

  it("drops rows that never got anywhere (marked not watched, opened and left)", () => {
    const rows = [row(2, "2026-10-11T16:00:02Z", { completed: false, positionMs: 0 }), row(1, "2026-10-11T16:00:01Z")];
    const groups = groupHistory(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.single?.episodeNumber).toBe(1);
  });

  it("keeps a lone finished episode, and partial watches, as plain rows", () => {
    const rows = [row(5, "2026-10-11T16:00:00Z", { completed: false, positionMs: 60_000 }), row(4, "2026-10-11T15:00:00Z")];
    const groups = groupHistory(rows);
    expect(groups.map((g) => g.single?.episodeNumber)).toEqual([5, 4]);
    expect(episodeRange(groups[1]!)).toBe("E4");
  });

  it("does not join episodes hours apart, other seasons, other shows or other profiles", () => {
    const rows = [
      row(2, "2026-10-11T16:00:00Z"),
      row(1, "2026-10-11T12:00:00Z"),
      row(9, "2026-10-11T11:59:00Z", { seasonNumber: 1 }),
      row(8, "2026-10-11T11:58:00Z", { title: "Severance" }),
      row(7, "2026-10-11T11:57:00Z", { profileId: "p2" })
    ];
    expect(groupHistory(rows)).toHaveLength(5);
  });

  it("leaves movies alone", () => {
    const movie = row(null, "2026-10-11T16:00:00Z", { contentType: "MOVIE", title: "Heat" });
    expect(groupHistory([movie])[0]!.single).toBe(movie);
  });
});
