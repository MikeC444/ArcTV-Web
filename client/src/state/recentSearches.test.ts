import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "./auth";
import { setActiveProfile } from "./profile";
import { RECENT_SEARCH_LIMIT, useRecentSearches, withRecentSearch } from "./recentSearches";

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

describe("recent searches per profile", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.setState({ user: { id: "u1" } } as never);
    setActiveProfile("main");
  });

  it("keeps each profile's list separate, and the account's own profile keeps the list it already had", () => {
    localStorage.setItem("mtv:v1:u1:recent-searches", JSON.stringify(["dune"])); // saved before profiles had their own
    useRecentSearches.getState().load();
    expect(useRecentSearches.getState().items).toEqual(["dune"]);

    setActiveProfile("p_kid");
    useRecentSearches.getState().load();
    expect(useRecentSearches.getState().items).toEqual([]);
    useRecentSearches.getState().add("bluey");
    expect(useRecentSearches.getState().items).toEqual(["bluey"]);

    setActiveProfile("main");
    useRecentSearches.getState().load();
    expect(useRecentSearches.getState().items).toEqual(["dune"]);
  });
});
