import { describe, expect, it, vi } from "vitest";
import { detailOrder, loadDetails } from "./detailSource";
import type { CatalogProvider } from "./provider";
import type { Content } from "./types";

const META = "com.linvo.cinemeta";
const content = (title: string, providerId = "x"): Content => ({ id: "tt1", type: "MOVIE", title, description: "", posterUrl: null, backdropUrl: null, genres: [], cast: [], seasons: [], watched: false, providerId });
const provider = (id: string, result: Content | null | "throws"): CatalogProvider =>
  ({ id, getDetails: vi.fn(async () => { if (result === "throws") throw new Error("down"); return result; }) }) as unknown as CatalogProvider;

describe("detailOrder", () => {
  it("asks Cinemeta first, then the title's own addon, then the rest in the person's order", () => {
    expect(detailOrder(["a", META, "b", "c"], "b", "tt1")).toEqual([META, "b", "a", "c"]);
  });
  it("skips Cinemeta for a title without an IMDb id, or when it is not installed or turned on", () => {
    expect(detailOrder(["a", META], "a", "kitsu:1")).toEqual(["a", META]);
    expect(detailOrder(["a", "b"], "b", "tt1")).toEqual(["b", "a"]);
  });
  it("copes with the title's own addon having been removed", () => {
    expect(detailOrder(["a", META], "gone", "tt1")).toEqual([META, "a"]);
  });
});

describe("loadDetails", () => {
  it("uses Cinemeta's details but keeps the title filed under the addon it came from", async () => {
    const own = provider("own", content("thin"));
    const meta = provider(META, content("good", META));
    const out = await loadDetails([own, meta], "own", "MOVIE", "tt1");
    expect(out?.title).toBe("good");
    expect(out?.providerId).toBe("own");
    expect(own.getDetails).not.toHaveBeenCalled();
  });
  it("falls back to the title's own addon, then to the next addon, when the earlier ones fail or don't know it", async () => {
    const meta = provider(META, "throws");
    const own = provider("own", null);
    const second = provider("second", content("from second"));
    const out = await loadDetails([own, second, meta], "own", "MOVIE", "tt1");
    expect(out?.title).toBe("from second");
    expect(out?.providerId).toBe("own");
    expect(meta.getDetails).toHaveBeenCalled();
    expect(own.getDetails).toHaveBeenCalled();
  });
  it("is null when no addon has the title (or there are none)", async () => {
    expect(await loadDetails([provider("a", null)], "a", "MOVIE", "tt1")).toBeNull();
    expect(await loadDetails([], "a", "MOVIE", "tt1")).toBeNull();
  });
});
