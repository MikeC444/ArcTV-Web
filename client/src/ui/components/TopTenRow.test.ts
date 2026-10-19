import { describe, expect, it } from "vitest";
import type { Content } from "../../domain/types";
import { topTen, topTenTitle } from "./TopTenRow";

const c = (id: string) => ({ id }) as Content;
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

describe("topTenTitle", () => {
  it("names the country", () => expect(topTenTitle("AU")).toBe("Top 10 in Australia Today"));
  it("falls back without one", () => expect(topTenTitle("??")).toBe("Top 10 Today"));
});
