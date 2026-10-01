import { describe, expect, it } from "vitest";
import { blockedSet, isBlocked, withoutBlocked } from "./blockedGenres";

const title = (...names: string[]) => ({ genres: names.map((name) => ({ id: name.toLowerCase(), name })) });

describe("blocked genres", () => {
  it("hides titles that carry a blocked genre, ignoring case", () => {
    const set = blockedSet(["Horror"]);
    expect(isBlocked(title("Drama", "horror"), set)).toBe(true);
    expect(isBlocked(title("Drama"), set)).toBe(false);
  });
  it("keeps titles with no genre data and leaves everything alone when nothing is blocked", () => {
    expect(isBlocked(title(), blockedSet(["Horror"]))).toBe(false);
    const items = [title("Horror"), title("Comedy")];
    expect(withoutBlocked(items, blockedSet([]))).toBe(items);
    expect(withoutBlocked(items, blockedSet(["Horror"]))).toEqual([items[1]]);
  });
});
