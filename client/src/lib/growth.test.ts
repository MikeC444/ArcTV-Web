import { describe, expect, it } from "vitest";
import { addedIn, compactNumber, formatDay, labelIndices, niceTicks, rangePoints, trimLeadingEmpty, type GrowthPoint } from "./growth";

const pt = (date: string, newUsers: number, total: number): GrowthPoint => ({ date, newUsers, total });
const series = [pt("2026-10-04", 0, 0), pt("2026-10-05", 0, 0), pt("2026-10-06", 3, 3), pt("2026-10-07", 0, 3), pt("2026-10-08", 5, 8)];

describe("user growth helpers", () => {
  it("drops the quiet days before the first sign-up, keeping one day as the starting point", () => {
    expect(trimLeadingEmpty(series).map((p) => p.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    const withOld = [pt("2026-10-04", 0, 2), pt("2026-10-05", 0, 2), pt("2026-10-06", 3, 5)];
    expect(trimLeadingEmpty(withOld).map((p) => p.date)).toEqual(["2026-10-05", "2026-10-06"]);
    expect(trimLeadingEmpty([pt("2026-10-04", 0, 0)])).toEqual([]);
    expect(trimLeadingEmpty([pt("2026-10-04", 0, 4), pt("2026-10-05", 0, 4)])).toHaveLength(2); // no sign-ups in the window: honestly flat
  });

  it("a range shows the last N days, or all of them, never counting the quiet days before the first sign-up", () => {
    expect(rangePoints(series, 7).map((p) => p.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    const long = Array.from({ length: 10 }, (_, i) => pt(`2026-10-${String(i + 1).padStart(2, "0")}`, 1, i + 1));
    expect(rangePoints(long, 7).map((p) => p.date)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"]);
    expect(rangePoints(series, "all")).toHaveLength(4);
  });

  it("adds up the new accounts across the shown days", () => {
    expect(addedIn(series)).toBe(8);
    expect(addedIn([])).toBe(0);
  });

  it("makes clean axis ticks from zero up past the largest value", () => {
    expect(niceTicks(374)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(8)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
    const t = niceTicks(1234);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]!).toBeGreaterThanOrEqual(1234);
  });

  it("shortens big numbers and formats days without time zones", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(1000)).toBe("1K");
    expect(compactNumber(1200)).toBe("1.2K");
    expect(compactNumber(12000)).toBe("12K");
    expect(formatDay("2026-10-09")).toBe("Oct 9");
    expect(formatDay("2026-01-01")).toBe("Jan 1");
  });

  it("picks axis label positions that include both ends", () => {
    expect(labelIndices(3)).toEqual([0, 1, 2]);
    expect(labelIndices(30)).toEqual([0, 7, 15, 22, 29]);
    expect(labelIndices(0)).toEqual([]);
  });
});
