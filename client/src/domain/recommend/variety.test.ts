import { describe, expect, it } from "vitest";
import { recommend, type Candidate, type FeatureLoader } from "./engine";
import { collectInteractions } from "./signals";
import { freshen, seededRandom } from "./variety";

const pick = (id: string, score: number) => ({ id, score });

describe("variety step", () => {
  it("gives the same order for the same seed and never adds, drops or alters a pick", () => {
    const sorted = [pick("a", 0.9), pick("b", 0.88), pick("c", 0.87), pick("d", 0.5), pick("e", 0.49)];
    const one = freshen(sorted, 42);
    expect(freshen(sorted, 42)).toEqual(one);
    expect([...one].map((p) => p.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    for (const p of one) expect(p.score).toBe(sorted.find((s) => s.id === p.id)!.score); // scores are untouched
  });

  it("a clearly higher score is never overtaken by a clearly lower one, whatever the seed", () => {
    const sorted = [pick("top1", 0.9), pick("top2", 0.89), pick("mid", 0.6), pick("low1", 0.3), pick("low2", 0.29)];
    for (let seed = 0; seed < 200; seed++) {
      const order = freshen(sorted, seed).map((p) => p.id);
      expect(order.indexOf("mid")).toBeGreaterThan(Math.max(order.indexOf("top1"), order.indexOf("top2")));
      expect(order.indexOf("mid")).toBeLessThan(Math.min(order.indexOf("low1"), order.indexOf("low2")));
    }
  });

  it("only near-tied picks change places, and different seeds do give different orders for them", () => {
    const sorted = ["a", "b", "c", "d", "e", "f"].map((id, i) => pick(id, 0.8 - i * 0.002)); // all within one band
    const orders = new Set<string>();
    for (let seed = 0; seed < 50; seed++) orders.add(freshen(sorted, seed).map((p) => p.id).join(""));
    expect(orders.size).toBeGreaterThan(5);
  });

  it("leaves a list with nothing tied exactly as it was", () => {
    const sorted = [pick("a", 0.9), pick("b", 0.7), pick("c", 0.5), pick("d", 0.3)];
    for (let seed = 0; seed < 20; seed++) expect(freshen(sorted, seed)).toEqual(sorted);
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
  // Twelve candidates that all resemble the one liked movie equally, so their scores tie.
  const liked = { id: "liked", title: "liked", completed: false, inWatchlist: false, feedback: "like" as const };
  const likedB = { ...liked, id: "likedB", title: "likedB" };
  const likedC = { ...liked, id: "likedC", title: "likedC" };
  const features = { genres: ["sci-fi"], directors: ["d"], cast: ["c"] };
  const pool: Candidate[] = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, title: `m${i}`, genres: ["sci-fi"], rating: 7 }));
  const loader: FeatureLoader = async (refs) => new Map(refs.map((r) => [r.id, features]));
  const go = (seed?: number) => recommend({ interactions: collectInteractions([liked, likedB, likedC]), excludeIds: new Set(), pool, interactionRefs: new Map(), loadFeatures: loader, seed });

  it("without a seed is fully deterministic", async () => {
    expect((await go()).items.map((i) => i.id)).toEqual((await go()).items.map((i) => i.id));
  });
  it("with a seed shows the same real scores and reasons, just in a different order for tied picks", async () => {
    const base = await go();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = await go(seed);
      expect(r.mode).toBe("personal");
      expect(r.items.map((i) => i.id).sort()).toEqual(base.items.map((i) => i.id).sort());
      for (const item of r.items) {
        const original = base.items.find((b) => b.id === item.id)!;
        expect(item.score).toBe(original.score);
        expect(item.reason === null || /^Because you liked /.test(item.reason)).toBe(true);
      }
      seen.add(r.items.map((i) => i.id).join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
