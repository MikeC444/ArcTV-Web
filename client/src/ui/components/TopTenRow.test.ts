import { describe, expect, it } from "vitest";
import type { Content } from "../../domain/types";
import { pickUnblocked, topTen } from "./TopTenRow";

const c = (id: string) => ({ id, genres: [] }) as unknown as Content;
const list = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => c(`${prefix}${i}`));

describe("topTen", () => {
  it("takes series and movies in turn, most popular first, up to ten", () => {
    expect(topTen(list("m", 20), list("s", 20)).map((x) => x.id)).toEqual(["s0", "m0", "s1", "m1", "s2", "m2", "s3", "m3", "s4", "m4"]);
  });
  it("fills from the longer list and skips a title both lists hold", () => {
    expect(topTen([c("a"), c("b")], [c("a"), c("x"), c("y")]).map((x) => x.id)).toEqual(["a", "x", "b", "y"]);
  });
  it("is empty with nothing to show", () => expect(topTen([], [])).toEqual([]));
});

describe("pickUnblocked", () => {
  const genres = (names: string[]) => names.map((name) => ({ id: name, name }));
  const lookup = (table: Record<string, string[]>) => async (c: Content) => (table[c.id] ? genres(table[c.id] as string[]) : null);

  it("skips titles with a blocked genre and fills the places from further down", async () => {
    const pool = list("t", 8);
    const out = await pickUnblocked(pool, new Set(["horror"]), lookup({ t1: ["Horror"], t2: ["Drama", "HORROR"] }), 4);
    expect(out.map((x) => x.id)).toEqual(["t0", "t3", "t4", "t5"]);
  });
  it("keeps a title whose genres can't be found", async () => {
    const out = await pickUnblocked(list("t", 3), new Set(["horror"]), async () => null, 3);
    expect(out).toHaveLength(3);
  });
  it("returns fewer when the pool runs out", async () => {
    const out = await pickUnblocked(list("t", 4), new Set(["horror"]), lookup({ t0: ["Horror"], t1: ["Horror"], t2: ["Horror"] }), 4);
    expect(out.map((x) => x.id)).toEqual(["t3"]);
  });
  it("treats a failed lookup like an unknown title", async () => {
    const out = await pickUnblocked(list("t", 2), new Set(["horror"]), async () => Promise.reject(new Error("x")), 2);
    expect(out).toHaveLength(2);
  });
});
