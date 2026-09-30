import { describe, expect, it } from "vitest";
import { pickHeroPool, pickHeroTitles } from "./heroPool";

const item = (id: string, backdropUrl: string | null, posterUrl: string | null) => ({ id, backdropUrl, posterUrl });
const wide = (id: string) => item(id, `https://img/${id}/bg`, `https://img/${id}/poster`);
const posterOnly = (id: string) => item(id, `https://img/${id}/poster`, `https://img/${id}/poster`); // backdropUrl falls back to the poster
const blank = (id: string) => item(id, null, null);

describe("hero pool", () => {
  it("takes titles with a real landscape background first", () => {
    const pool = [posterOnly("p1"), wide("w1"), blank("b1"), wide("w2"), posterOnly("p2"), wide("w3")];
    expect(pickHeroPool(pool, 3).map((c) => c.id).sort()).toEqual(["w1", "w2", "w3"]);
  });

  it("never picks a poster-only title while enough titles have a background", () => {
    const pool = [...Array.from({ length: 12 }, (_, i) => wide(`w${i}`)), ...Array.from({ length: 30 }, (_, i) => posterOnly(`p${i}`))];
    for (let run = 0; run < 20; run++) expect(pickHeroPool(pool, 10).every((c) => c.id.startsWith("w"))).toBe(true);
  });

  it("fills up with poster-only titles, then blank ones, only when there aren't enough backgrounds", () => {
    const pool = [wide("w1"), blank("b1"), posterOnly("p1"), posterOnly("p2")];
    const picked = pickHeroPool(pool, 4).map((c) => c.id);
    expect(picked[0]).toBe("w1");
    expect(picked.slice(1, 3).sort()).toEqual(["p1", "p2"]);
    expect(picked[3]).toBe("b1");
    expect(pickHeroPool(pool, 10)).toHaveLength(4);
    expect(pickHeroPool([], 10)).toEqual([]);
  });
});

describe("hero titles from the enabled rows", () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => wide(`${prefix}${i}`));

  it("draws only from the enabled rows when they hold enough titles", () => {
    for (let run = 0; run < 20; run++) {
      const picked = pickHeroTitles(many("on", 25), many("off", 25), 10);
      expect(picked).toHaveLength(10);
      expect(picked.every((c) => c.id.startsWith("on"))).toBe(true);
      expect(new Set(picked.map((c) => c.id)).size).toBe(10);
    }
  });

  it("uses every enabled title and makes up the rest from other rows when there are fewer than ten", () => {
    const picked = pickHeroTitles(many("on", 4), [...many("on", 4), ...many("off", 20)], 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((c) => c.id)).size).toBe(10); // no title twice, even though the backup repeats the enabled ones
    expect(picked.filter((c) => c.id.startsWith("on"))).toHaveLength(4);
  });

  it("copes with nothing enabled, and with too few titles overall", () => {
    expect(pickHeroTitles([], many("off", 12), 10)).toHaveLength(10);
    expect(pickHeroTitles(many("on", 2), many("off", 3), 10)).toHaveLength(5);
    expect(pickHeroTitles([], [], 10)).toEqual([]);
  });
});
