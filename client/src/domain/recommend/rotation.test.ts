import { describe, expect, it } from "vitest";
import { MAX_RESULTS, ROTATION_ANCHORS } from "./config";
import { recommend, type Candidate, type FeatureLoader } from "./engine";
import { rotate, seededRandom } from "./rotation";
import { collectInteractions } from "./signals";

// 40 scored picks with falling scores, best first.
const scoredList = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, score: 0.95 - i * 0.01 }));
const idsOf = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe("rotation step", () => {
  it("always keeps the strongest picks and returns a full row ordered by score", () => {
    for (let seed = 0; seed < 100; seed++) {
      const row = rotate(scoredList, MAX_RESULTS, seed);
      expect(row).toHaveLength(MAX_RESULTS);
      for (let i = 0; i < ROTATION_ANCHORS; i++) expect(idsOf(row)).toContain(`p${i}`);
      for (let i = 1; i < row.length; i++) expect(row[i]!.score).toBeLessThanOrEqual(row[i - 1]!.score);
    }
  });

  it("is repeatable for the same seed, and different seeds give different rows", () => {
    expect(idsOf(rotate(scoredList, MAX_RESULTS, 7))).toEqual(idsOf(rotate(scoredList, MAX_RESULTS, 7)));
    const rows = new Set<string>();
    for (let seed = 0; seed < 30; seed++) rows.add(idsOf(rotate(scoredList, MAX_RESULTS, seed)).join(","));
    expect(rows.size).toBeGreaterThan(20);
  });

  it("swaps most of the row on the next load when it is told what the last one showed", () => {
    let previous = new Set(idsOf(rotate(scoredList, MAX_RESULTS, 1)));
    let totalKept = 0;
    let loads = 0;
    for (let seed = 2; seed < 60; seed++) {
      const row = rotate(scoredList, MAX_RESULTS, seed, { previous });
      totalKept += row.filter((p) => previous.has(p.id)).length;
      loads++;
      previous = new Set(idsOf(row));
    }
    // fewer than half of each row was in the one before it, on average (the 5 anchors always stay)
    expect(totalKept / loads).toBeLessThan(MAX_RESULTS / 2);
    expect(totalKept / loads).toBeGreaterThanOrEqual(ROTATION_ANCHORS);
  });

  it("never swaps in a pick that scored zero or below, or far below the best", () => {
    const list = [...Array.from({ length: 8 }, (_, i) => ({ id: `good${i}`, score: 0.9 - i * 0.02 })), { id: "weak", score: 0.1 }, { id: "zero", score: 0 }, { id: "neg", score: -0.4 }];
    for (let seed = 0; seed < 100; seed++) {
      const row = idsOf(rotate(list, 8, seed));
      expect(row).not.toContain("zero");
      expect(row).not.toContain("neg");
      expect(row).not.toContain("weak");
      expect(row).toHaveLength(8);
    }
  });

  it("only ever returns picks it was given, with their scores untouched", () => {
    const row = rotate(scoredList, MAX_RESULTS, 3);
    for (const p of row) expect(p.score).toBe(scoredList.find((s) => s.id === p.id)!.score);
  });

  it("fills the row from the next best when too few clear the floor", () => {
    const list = [{ id: "a", score: 0.9 }, ...Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, score: 0.2 - i * 0.01 }))];
    expect(rotate(list, 10, 1)).toHaveLength(10);
  });

  it("seeded random is repeatable and stays in [0, 1)", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 20; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("engine with a seed", () => {
  const liked = (id: string) => ({ id, title: id, completed: false, inWatchlist: false, feedback: "like" as const });
  // 45 candidates in a spread of sci-fi-ness so they score differently; the profile likes sci-fi.
  const META = new Map<string, { genres: string[]; directors: string[]; cast: string[] }>();
  const pool: Candidate[] = Array.from({ length: 45 }, (_, i) => {
    const genres = i % 3 === 0 ? ["sci-fi"] : i % 3 === 1 ? ["sci-fi", "drama"] : ["sci-fi", "drama", "romance"];
    META.set(`m${i}`, { genres, directors: [`d${i % 7}`], cast: [`c${i % 5}`] });
    return { id: `m${i}`, title: `m${i}`, genres, rating: 7 };
  });
  META.set("l1", { genres: ["sci-fi"], directors: ["d1"], cast: ["c1"] });
  META.set("l2", { genres: ["sci-fi"], directors: ["d2"], cast: ["c2"] });
  META.set("l3", { genres: ["sci-fi", "drama"], directors: ["d3"], cast: ["c3"] });
  const loader: FeatureLoader = async (refs) => new Map(refs.map((r) => [r.id, META.get(r.id) ?? null]));
  const go = (seed?: number, previousShown?: ReadonlySet<string>) =>
    recommend({ interactions: collectInteractions([liked("l1"), liked("l2"), liked("l3")]), excludeIds: new Set(), pool, interactionRefs: new Map(), loadFeatures: loader, seed, previousShown });

  it("without a seed is fully deterministic", async () => {
    expect((await go()).items.map((i) => i.id)).toEqual((await go()).items.map((i) => i.id));
  });

  it("with a seed still shows only genuinely scored picks with their real scores and reasons, and keeps the top picks", async () => {
    const base = await go();
    const baseScores = new Map(base.items.map((i) => [i.id, i.score]));
    const everything = await recommend({ interactions: collectInteractions([liked("l1"), liked("l2"), liked("l3")]), excludeIds: new Set(), pool, interactionRefs: new Map(), loadFeatures: loader, seed: 1 });
    expect(everything.mode).toBe("personal");
    for (let seed = 1; seed <= 20; seed++) {
      const r = await go(seed);
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) {
        expect(item.score).not.toBeNull();
        expect(item.score!).toBeGreaterThan(0);
        expect(item.reason === null || /^Because you liked /.test(item.reason)).toBe(true);
        if (baseScores.has(item.id)) expect(item.score).toBe(baseScores.get(item.id));
      }
      for (const top of base.items.slice(0, 3)) expect(r.items.map((i) => i.id)).toContain(top.id);
    }
  });

  it("changes most of the row between loads when told what was shown last time", async () => {
    let previous = new Set((await go(1)).items.map((i) => i.id));
    let kept = 0;
    let loads = 0;
    for (let seed = 2; seed < 12; seed++) {
      const r = await go(seed, previous);
      kept += r.items.filter((i) => previous.has(i.id)).length;
      loads++;
      previous = new Set(r.items.map((i) => i.id));
    }
    expect(kept / loads).toBeLessThan(MAX_RESULTS * 0.7);
  });
});
