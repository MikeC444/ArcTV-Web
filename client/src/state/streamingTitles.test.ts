import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api }));
import { fetchServiceTitles, viewerRegion } from "./streamingTitles";

beforeEach(() => {
  api.mockReset();
});

describe("viewerRegion", () => {
  it("is the region of the browser's language, upper-cased, else the UK", () => {
    expect(viewerRegion("en-us")).toBe("US");
    expect(viewerRegion("pt_BR")).toBe("BR");
    expect(viewerRegion("en")).toBe("GB");
    expect(viewerRegion("")).toBe("GB");
  });
});

describe("fetchServiceTitles", () => {
  it("asks for one service, type and page and turns the answer into titles that open through the addon", async () => {
    api.mockResolvedValue({
      available: true,
      page: 3,
      totalPages: 9,
      items: [{ imdbId: "tt1", type: "MOVIE", title: "Alpha", year: 2020, rating: 7.5, overview: "A", poster: "https://p/a.jpg", backdrop: null }],
    });
    const page = await fetchServiceTitles("netflix", "MOVIE", 3, "pw.ers.netflix-catalog");
    const url = String(api.mock.calls[0]![0]);
    expect(url).toContain("/user/streaming-titles?");
    expect(url).toContain("service=netflix");
    expect(url).toContain("type=MOVIE");
    expect(url).toContain("page=3");
    expect(page.available).toBe(true);
    expect(page.totalPages).toBe(9);
    expect(page.items).toEqual([
      { id: "tt1", type: "MOVIE", title: "Alpha", description: "A", posterUrl: "https://p/a.jpg", backdropUrl: null, year: 2020, rating: 7.5, genres: [], cast: [], seasons: [], watched: false, providerId: "pw.ers.netflix-catalog" },
    ]);
  });

  it("is simply not available when the ask fails", async () => {
    api.mockImplementation(async () => {
      throw new Error("down");
    });
    expect(await fetchServiceTitles("netflix", "TV_SHOW", 1, "x")).toEqual({ available: false, items: [], totalPages: 0 });
  });
});
