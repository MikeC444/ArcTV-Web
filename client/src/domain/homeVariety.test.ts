import { describe, expect, it } from "vitest";
import { dayStamp, hashSeed, HOME_GENRES, homeGenresFor, pickPage, varyOrder } from "./homeVariety";

describe("Home variety", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it("is steady for the same seed and row", () => {
    expect(varyOrder(items, "u1|2026-10-09", "base")).toEqual(varyOrder(items, "u1|2026-10-09", "base"));
    expect(pickPage("u1|2026-10-09", "base", [5, 3, 2])).toBe(pickPage("u1|2026-10-09", "base", [5, 3, 2]));
  });

  it("changes from day to day and from person to person", () => {
    const today = varyOrder(items, "u1|2026-10-09", "base");
    expect(varyOrder(items, "u1|2026-10-10", "base")).not.toEqual(today);
    expect(varyOrder(items, "u2|2026-10-09", "base")).not.toEqual(today);
  });

  it("keeps every title, never adds or loses one", () => {
    const shuffled = varyOrder(items, "u1|2026-10-09", "toprated");
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it("favours the better-ranked titles near the top", () => {
    let topHalfInFirstTen = 0;
    for (let day = 1; day <= 60; day++) {
      const first10 = varyOrder(items, `u1|2026-10-${day}`, "base").slice(0, 10);
      topHalfInFirstTen += first10.filter((rank) => rank < 50).length;
    }
    expect(topHalfInFirstTen / 600).toBeGreaterThan(0.6); // well above the 0.5 an unweighted shuffle would give
  });

  it("reads mostly the first page but sometimes a deeper one", () => {
    const counts = [0, 0, 0];
    for (let day = 1; day <= 400; day++) counts[pickPage(`u|${day}`, "base", [5, 3, 2])]!++;
    expect(counts[0]!).toBeGreaterThan(counts[1]!);
    expect(counts[1]!).toBeGreaterThan(counts[2]!);
    expect(counts[2]!).toBeGreaterThan(0);
  });

  it("picks only the curated genres an addon really declares, in curated order", () => {
    expect(homeGenresFor(["Western", "Horror", "Action", "sci-fi", "2026"])).toEqual(["Action", "Horror", "sci-fi"]);
    expect(homeGenresFor(["Western", "War"])).toEqual([]);
    expect(HOME_GENRES).toHaveLength(9);
  });

  it("formats the day and hashes text to a stable number", () => {
    expect(dayStamp(new Date(2026, 9, 9))).toBe("2026-10-09");
    expect(hashSeed("a")).toBe(hashSeed("a"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});
