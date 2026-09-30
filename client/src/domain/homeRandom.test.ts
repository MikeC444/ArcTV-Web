import { afterEach, describe, expect, it, vi } from "vitest";
import { hashString, seededRandom, shuffled } from "../lib/format";
import { normalizeManifest } from "./stremio/client";
import { homeStartPage, StremioAddonProvider } from "./provider";

describe("random Home rows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a seed always gives the same numbers, and different seeds differ", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom(7)()).not.toBe(seededRandom(8)());
    expect(hashString("row")).toBe(hashString("row"));
    expect(hashString("row")).not.toBe(hashString("rows"));
  });

  it("a seeded shuffle keeps every title and is repeatable", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const once = shuffled(items, seededRandom(3));
    expect([...once].sort((x, y) => x - y)).toEqual(items);
    expect(once).toEqual(shuffled(items, seededRandom(3)));
    expect(once).not.toEqual(items);
  });

  it("each page load starts rows at one of the first five pages, and different loads start at different ones", () => {
    const pages = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const page = homeStartPage(seed, "com.linvo.cinemeta|base|movie|top");
      expect(page).toBeGreaterThanOrEqual(0);
      expect(page).toBeLessThan(5);
      pages.add(page);
    }
    expect(pages.size).toBe(5);
    expect(homeStartPage(11, "row")).toBe(homeStartPage(11, "row")); // stable within one page load
  });

  const manifest = (skip: boolean) =>
    normalizeManifest({ id: "t.addon", name: "T", version: "1", resources: ["catalog"], types: ["movie"], catalogs: [{ type: "movie", id: "top", name: "Popular", extra: skip ? [{ name: "skip" }] : [] }] });
  const metas = (n: number, tag: string) => ({ metas: Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, type: "movie", name: `Title ${tag}${i}`, poster: `https://x/${tag}${i}.jpg` })) });

  it("asks a catalogue that can be paged for a later page, and still returns every title of it", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      const skip = /skip=(\d+)/.exec(url)?.[1] ?? "0";
      return new Response(JSON.stringify(metas(20, `p${skip}_`)), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const provider = new StremioAddonProvider("https://paged.example/manifest.json", manifest(true));
    const rows: string[][] = [];
    for await (const batch of provider.getHomeSections()) rows.push(...batch.map((s) => s.items.map((c) => c.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(20);
    const skips = urls.map((u) => Number(/skip=(\d+)/.exec(u)?.[1] ?? 0));
    for (const skip of skips) expect([0, 100, 200, 300, 400]).toContain(skip);
  });

  it("falls back to the first page when the chosen page is empty, and never pages a catalogue that can't be", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(/skip=/.test(url) ? { metas: [] } : metas(10, "first")), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const paged = new StremioAddonProvider("https://empty-later.example/manifest.json", manifest(true));
    const items: string[] = [];
    for await (const batch of paged.getHomeSections()) items.push(...batch.flatMap((s) => s.items.map((c) => c.id)));
    expect(items).toHaveLength(10);

    urls.length = 0;
    const plain = new StremioAddonProvider("https://plain.example/manifest.json", manifest(false));
    for await (const batch of plain.getHomeSections()) expect(batch[0]?.items).toHaveLength(10);
    expect(urls.every((u) => !/skip=/.test(u))).toBe(true);
  });
});
