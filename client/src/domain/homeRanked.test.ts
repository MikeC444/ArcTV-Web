import cinemetaJson from "../assets/cinemeta_manifest.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyRowOrder, dedupeRows } from "./homeRows";
import { setHomeVarietySeed, StremioAddonProvider } from "./provider";
import { clearAddonCache, normalizeManifest } from "./stremio/client";
import type { HomeSection } from "./types";

const cinemeta = normalizeManifest(cinemetaJson);
const metas = (type: string, n: number) => ({ metas: Array.from({ length: n }, (_, i) => ({ id: `${type}${i}`, type, name: `${type} ${i}`, poster: "p.jpg" })) });

async function homeRows(urls: string[]): Promise<HomeSection[]> {
  clearAddonCache(); // catalogue answers are cached for minutes: each call here must really ask
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(metas(url.includes("/movie/") ? "movie" : "series", 40)), { status: 200 });
  }));
  const provider = new StremioAddonProvider("https://c.example/manifest.json", cinemeta);
  const rows: HomeSection[] = [];
  for await (const batch of provider.getHomeSections()) rows.push(...batch);
  return rows;
}

describe("Home rows for Cinemeta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("are Popular, New, Top rated, then the nine wide-appeal genres, and nothing else", async () => {
    setHomeVarietySeed("u1|2026-10-09");
    const rows = await homeRows([]);
    expect(rows.map((r) => r.title)).toEqual(["Popular", "New", "Top rated", "Action", "Comedy", "Drama", "Thriller", "Horror", "Sci-Fi", "Crime", "Animation", "Documentary"]);
    // shown in that order once the default ordering is applied, whatever order they arrived in
    expect(applyRowOrder([...rows].reverse(), { order: [], hiddenRowIds: [] }).slice(0, 3).map((r) => r.title)).toEqual(["Popular", "New", "Top rated"]);
  });

  it("mixes movies and shows in each row, and never shows a title twice", async () => {
    setHomeVarietySeed("u1|2026-10-09");
    const rows = dedupeRows(await homeRows([]));
    expect(rows[0]!.items.some((c) => c.type === "MOVIE") && rows[0]!.items.some((c) => c.type === "TV_SHOW")).toBe(true);
    const ids = rows.flatMap((r) => r.items.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("asks for New by this year, and reads a different page and order on a different day", async () => {
    setHomeVarietySeed("u1|2026-10-09");
    const urlsA: string[] = [];
    const rowsA = await homeRows(urlsA);
    expect(urlsA.some((u) => /catalog\/movie\/year\/genre=\d{4}/.test(u))).toBe(true);
    expect(urlsA.some((u) => u.includes("/year/") && !u.includes("genre="))).toBe(false); // New always names its year
    const pagesSeen = new Set<string>();
    let orderChanged = false;
    for (let day = 10; day < 40; day++) {
      setHomeVarietySeed(`u1|2026-10-${day}`);
      const urls: string[] = [];
      const rows = await homeRows(urls);
      urls.filter((u) => u.includes("/movie/top/")).forEach((u) => pagesSeen.add(/skip=(\d+)/.exec(u)?.[1] ?? "0"));
      if (rows[0]!.items.map((c) => c.id).join() !== rowsA[0]!.items.map((c) => c.id).join()) orderChanged = true;
    }
    expect(pagesSeen.size).toBeGreaterThan(1);
    expect(orderChanged).toBe(true);
  });

  it("is the same all day for the same account", async () => {
    setHomeVarietySeed("u1|2026-10-09");
    const first = (await homeRows([])).map((r) => r.items.map((c) => c.id).join());
    setHomeVarietySeed("u1|2026-10-09");
    expect((await homeRows([])).map((r) => r.items.map((c) => c.id).join())).toEqual(first);
  });
});
