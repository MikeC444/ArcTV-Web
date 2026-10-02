import { describe, expect, it } from "vitest";
import { MAX_RESULTS, ROTATION_ANCHORS } from "./config";
import { recommend, type Candidate, type FeatureLoader } from "./engine";
import { compose, seededRandom, type ComposePick } from "./rotation";
import { collectInteractions } from "./signals";

const pick = (id: string, score: number, genre: string | null): ComposePick => ({ id, score, genre });
const idsOf = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

// 30 horror picks scoring high, 10 comedy and 10 action picks scoring lower: what a horror-heavy profile looks like.
const horror = Array.from({ length: 30 }, (_, i) => pick(`h${i}`, 0.95 - i * 0.005, "horror"));
const comedy = Array.from({ length: 10 }, (_, i) => pick(`c${i}`, 0.45 - i * 0.01, "comedy"));
const action = Array.from({ length: 10 }, (_, i) => pick(`a${i}`, 0.4 - i * 0.01, "action"));
const all = [...horror, ...comedy, ...action].sort((a, b) => b.score - a.score);
const shares = new Map([["horror", 0.75], ["comedy", 0.15], ["action", 0.1]]);
const count = (row: ComposePick[], genre: string) => row.filter((p) => p.genre === genre).length;

describe("composition step", () => {
  it("gives the row the profile's genre split, instead of the biggest taste filling every place", () => {
    const row = compose(all, MAX_RESULTS, { shares });
    expect(row).toHaveLength(MAX_RESULTS);
    expect(count(row, "horror")).toBe(15); // 75% of 20
    expect(count(row, "comedy")).toBe(3); // 15%
    expect(count(row, "action")).toBe(2); // 10%
  });

  it("still does what it says without variety: a profile with one taste gets a one-genre row", () => {
    const row = compose(horror, MAX_RESULTS, { shares: new Map([["horror", 1]]) });
    expect(count(row, "horror")).toBe(MAX_RESULTS);
  });

  it("always keeps the strongest picks, mixes the genres through the row, and never alters a score", () => {
    for (let seed = 0; seed < 100; seed++) {
      const row = compose(all, MAX_RESULTS, { shares, seed });
      for (let i = 0; i < ROTATION_ANCHORS; i++) expect(idsOf(row)).toContain(`h${i}`);
      for (const p of row) expect(p.score).toBe(all.find((x) => x.id === p.id)!.score);
      expect(new Set(idsOf(row)).size).toBe(row.length);
      // a minority genre shows up in the first half of the row, not only at the end
      expect(row.slice(0, 12).some((p) => p.genre !== "horror")).toBe(true);
    }
  });

  it("is repeatable for a seed and different across seeds", () => {
    expect(idsOf(compose(all, MAX_RESULTS, { shares, seed: 7 }))).toEqual(idsOf(compose(all, MAX_RESULTS, { shares, seed: 7 })));
    const rows = new Set<string>();
    for (let seed = 0; seed < 30; seed++) rows.add(idsOf(compose(all, MAX_RESULTS, { shares, seed })).join(","));
    expect(rows.size).toBeGreaterThan(20);
  });

  it("swaps most of the row on the next load when it is told what the last one showed, keeping the genre split", () => {
    let previous = new Set(idsOf(compose(all, MAX_RESULTS, { shares, seed: 1 })));
    let kept = 0;
    let loads = 0;
    for (let seed = 2; seed < 40; seed++) {
      const row = compose(all, MAX_RESULTS, { shares, seed, previous });
      kept += row.filter((p) => previous.has(p.id)).length;
      loads++;
      previous = new Set(idsOf(row));
      expect(count(row, "horror")).toBe(15);
    }
    expect(kept / loads).toBeLessThan(MAX_RESULTS * 0.7);
    expect(kept / loads).toBeGreaterThanOrEqual(ROTATION_ANCHORS);
  });

  it("never draws in a pick that scored zero or below, or far below the best of its genre", () => {
    const list = [...horror.slice(0, 10), pick("c-ok", 0.4, "comedy"), pick("c-weak", 0.05, "comedy"), pick("c-zero", 0, "comedy"), pick("c-neg", -0.3, "comedy")];
    for (let seed = 0; seed < 100; seed++) {
      const row = idsOf(compose(list, 8, { shares: new Map([["horror", 0.6], ["comedy", 0.4]]), seed }));
      expect(row).not.toContain("c-zero");
      expect(row).not.toContain("c-neg");
      expect(row).not.toContain("c-weak");
    }
  });

  it("hands a genre's places to the next genre when it has too few, and fills with the best scores if everything runs short", () => {
    const row = compose([...horror.slice(0, 6), pick("c0", 0.4, "comedy")], 10, { shares });
    expect(row).toHaveLength(7); // only seven picks exist
    expect(idsOf(row)).toContain("c0");
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

describe("engine: a mostly-horror profile still gets its other tastes", () => {
  const liked = (id: string) => ({ id, title: id, completed: false, inWatchlist: false, feedback: "like" as const });
  const META = new Map<string, { genres: string[]; directors: string[]; cast: string[] }>();
  const pool: Candidate[] = [];
  const add = (id: string, genres: string[], d: string, c: string) => {
    META.set(id, { genres, directors: [d], cast: [c] });
    pool.push({ id, title: id, genres, rating: 7 });
  };
  for (let i = 0; i < 30; i++) add(`hor${i}`, i % 2 === 0 ? ["horror"] : ["horror", "thriller"], `hd${i % 6}`, `hc${i % 6}`);
  for (let i = 0; i < 12; i++) add(`com${i}`, i % 2 === 0 ? ["comedy"] : ["comedy", "romance"], `cd${i % 4}`, `cc${i % 4}`);
  // the profile: three liked horror movies and one liked comedy (75% / 25% by signal)
  for (const id of ["lh1", "lh2", "lh3"]) META.set(id, { genres: ["horror", "thriller"], directors: ["hd1"], cast: ["hc1"] });
  META.set("lc1", { genres: ["comedy"], directors: ["cd1"], cast: ["cc1"] });
  const loader: FeatureLoader = async (refs) => new Map(refs.map((r) => [r.id, META.get(r.id) ?? null]));
  const go = (seed?: number, previousShown?: ReadonlySet<string>) =>
    recommend({ interactions: collectInteractions(["lh1", "lh2", "lh3", "lc1"].map(liked)), excludeIds: new Set(), pool, interactionRefs: new Map(), loadFeatures: loader, seed, previousShown });

  it("includes its comedy taste instead of a row that is all horror, with real scores and a real reason", async () => {
    for (const seed of [undefined, 1, 2, 3]) {
      const r = await go(seed);
      expect(r.mode).toBe("personal");
      const comedyPicks = r.items.filter((i) => i.id.startsWith("com"));
      expect(comedyPicks.length).toBeGreaterThanOrEqual(3); // about a quarter of 20
      expect(comedyPicks.length).toBeLessThan(r.items.length / 2);
      for (const item of r.items) {
        expect(item.score!).toBeGreaterThan(0);
        expect(item.reason).toMatch(/^Because you liked /);
      }
      for (const c of comedyPicks) expect(c.reason).toBe("Because you liked lc1"); // named for the movie that really raised it
    }
  });

  it("without a seed is fully deterministic, and keeps the strongest picks with a seed", async () => {
    const base = await go();
    expect((await go()).items.map((i) => i.id)).toEqual(base.items.map((i) => i.id));
    for (const seed of [1, 2, 3, 4]) {
      const r = await go(seed);
      for (const top of base.items.slice(0, ROTATION_ANCHORS)) expect(r.items.map((i) => i.id)).toContain(top.id);
    }
  });
});
