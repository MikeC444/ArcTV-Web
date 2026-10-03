import { describe, expect, it } from "vitest";
import type { CatalogProvider } from "./provider";
import { searchProviders, type SearchResults } from "./search";
import type { Content } from "./types";

const item = (id: string, type: "MOVIE" | "TV_SHOW" = "MOVIE"): Content => ({ id, title: id, type, posterUrl: null }) as Content;
const provider = (result: Content[] | Error, delayMs = 0): CatalogProvider =>
  ({ search: () => new Promise((resolve, reject) => setTimeout(() => (result instanceof Error ? reject(result) : resolve(result)), delayMs)) }) as unknown as CatalogProvider;

describe("searchProviders", () => {
  it("shows the fast addon's results without waiting for the slow one", async () => {
    const seen: SearchResults[] = [];
    const done = searchProviders([provider([item("slow")], 60), provider([item("fast")], 0)], "x", (r) => seen.push(r));
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.movies.map((c) => c.id)).toEqual(["fast"]);
    expect(seen[0]!.pending).toBe(1);
    const final = await done;
    expect(final.movies.map((c) => c.id)).toEqual(["slow", "fast"]); // settled order is by addon, not by who answered first
    expect(final.pending).toBe(0);
  });
  it("keeps addon order stable, dedupes and splits movies from shows", async () => {
    const final = await searchProviders([provider([item("a"), item("s", "TV_SHOW")], 20), provider([item("a"), item("b")], 0)], "x", () => undefined);
    expect(final.movies.map((c) => c.id)).toEqual(["a", "b"]);
    expect(final.tvShows.map((c) => c.id)).toEqual(["s"]);
  });
  it("leaves a stuck addon behind after the timeout and counts it as failed", async () => {
    const final = await searchProviders([provider([item("ok")]), provider([item("never")], 500)], "x", () => undefined, 40);
    expect(final.movies.map((c) => c.id)).toEqual(["ok"]);
    expect(final.failed).toBe(1);
    expect(final.pending).toBe(0);
  });
  it("counts a failing addon", async () => {
    const final = await searchProviders([provider(new Error("boom"))], "x", () => undefined);
    expect(final.failed).toBe(1);
  });
  it("shows an addon's partial answer before that addon has finished", async () => {
    const partial = { search: (_q: string, onPartial?: (items: Content[]) => void) => new Promise<Content[]>((resolve) => { onPartial?.([item("early")]); setTimeout(() => resolve([item("early"), item("late")]), 50); }) } as unknown as CatalogProvider;
    const seen: SearchResults[] = [];
    const done = searchProviders([partial], "x", (r) => seen.push(r));
    expect(seen[0]!.movies.map((c) => c.id)).toEqual(["early"]);
    expect(seen[0]!.pending).toBe(1);
    expect((await done).movies.map((c) => c.id)).toEqual(["early", "late"]);
  });
});
