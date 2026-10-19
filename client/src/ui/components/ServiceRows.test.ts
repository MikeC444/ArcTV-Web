import { describe, expect, it } from "vitest";
import type { Content } from "../../domain/types";
import { serviceRows } from "./ServiceRows";

const c = (id: number, over: Partial<Content> = {}) => ({ id: `t${id}`, type: "MOVIE", rating: null, genres: [], ...over }) as Content;
const many = (n: number, over: (i: number) => Partial<Content> = () => ({})) => Array.from({ length: n }, (_, i) => c(i, over(i)));

describe("serviceRows", () => {
  it("has no rows for a handful of titles", () => expect(serviceRows(many(4))).toEqual([]));
  it("makes Popular, Top Rated, Movies and TV Shows rows, and a row per genre", () => {
    const items = many(20, (i) => ({ type: i % 2 ? "TV_SHOW" : "MOVIE", rating: i, genres: [{ id: "d", name: i < 8 ? "Drama" : "Comedy" }] }));
    const rows = serviceRows(items);
    expect(rows.map((r) => r.title)).toEqual(["Popular", "Top Rated", "Movies", "TV Shows", "Comedy", "Drama"]);
    expect(rows[1]?.items[0]?.rating).toBe(19);
  });
  it("leaves out a genre with too few titles", () => {
    const items = many(20, (i) => ({ genres: i < 3 ? [{ id: "h", name: "Horror" }] : [] }));
    expect(serviceRows(items).map((r) => r.title)).not.toContain("Horror");
  });
});
