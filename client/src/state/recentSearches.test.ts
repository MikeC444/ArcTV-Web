import { describe, expect, it } from "vitest";
import { RECENT_SEARCH_LIMIT, withRecentSearch } from "./recentSearches";

describe("recent searches", () => {
  it("puts the newest first and ignores blanks", () => {
    expect(withRecentSearch(["dune"], "  star   wars ")).toEqual(["star wars", "dune"]);
    expect(withRecentSearch(["dune"], "   ")).toEqual(["dune"]);
  });
  it("moves a repeat (any letter case) to the front instead of doubling it", () => {
    expect(withRecentSearch(["a", "Dune", "b"], "dune")).toEqual(["dune", "a", "b"]);
  });
  it("keeps only the newest few", () => {
    const many = Array.from({ length: RECENT_SEARCH_LIMIT }, (_, i) => `t${i}`);
    const next = withRecentSearch(many, "new");
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`t${RECENT_SEARCH_LIMIT - 1}`);
  });
});
