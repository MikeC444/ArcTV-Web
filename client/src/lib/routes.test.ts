import { describe, expect, it } from "vitest";
import { selectedNavIndex } from "../ui/components/TopNav";
import { idFromSlug, isDetailPath, routes, slugify } from "./routes";

describe("readable title addresses", () => {
  it("slugifies a title for the address", () => {
    expect(slugify("Prison Break")).toBe("prison-break-");
    expect(slugify("Amélie")).toBe("amelie-");
    expect(slugify("Tom & Jerry: The Movie!")).toBe("tom-and-jerry-the-movie-");
    expect(slugify("  ---  ")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify("x".repeat(100)).length).toBeLessThanOrEqual(61);
  });

  it("builds a readable address for Cinemeta titles and keeps the long one for everything else", () => {
    expect(routes.detail("com.linvo.cinemeta", "TV_SHOW", "tt0455275", "Prison Break")).toBe("/tv-shows/prison-break-tt0455275");
    expect(routes.detail("com.linvo.cinemeta", "MOVIE", "tt1375666", "Inception")).toBe("/movies/inception-tt1375666");
    expect(routes.detail("com.linvo.cinemeta", "MOVIE", "tt1375666")).toBe("/movies/tt1375666"); // no title: just the id
    expect(routes.detail("com.linvo.cinemeta", "MOVIE", "kitsu:1", "Naruto")).toBe("/detail/com.linvo.cinemeta/MOVIE/kitsu%3A1");
    expect(routes.detail("some.other.addon", "MOVIE", "tt1375666", "Inception")).toBe("/detail/some.other.addon/MOVIE/tt1375666");
  });

  it("finds the id on the end of an address, whatever the title part says", () => {
    expect(idFromSlug("prison-break-tt0455275")).toBe("tt0455275");
    expect(idFromSlug("tt0455275")).toBe("tt0455275");
    expect(idFromSlug("the-wrong-name-tt0455275")).toBe("tt0455275");
    expect(idFromSlug("prison-break")).toBeNull();
    expect(idFromSlug("tt0455275-prison-break")).toBeNull();
    expect(idFromSlug(undefined)).toBeNull();
  });

  it("treats both address forms as title pages (nav says Home, nav sits over the picture) but not the list pages", () => {
    expect(isDetailPath("/detail/a/MOVIE/tt1")).toBe(true);
    expect(isDetailPath("/movies/inception-tt1375666")).toBe(true);
    expect(isDetailPath("/tv-shows/prison-break-tt0455275")).toBe(true);
    expect(isDetailPath("/movies")).toBe(false);
    expect(isDetailPath("/tv")).toBe(false);
    expect(selectedNavIndex("/movies/inception-tt1375666")).toBe(0);
    expect(selectedNavIndex("/movies")).toBe(1);
  });
});
