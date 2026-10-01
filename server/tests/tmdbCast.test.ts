import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTmdbCast } from "../src/tmdbCast.js";
import { appWith } from "./helpers/app.js";
import { createMockBackend } from "./helpers/mockBackend.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeTmdb(calls: string[] = []) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search.replace(/api_key=[^&]*/, "api_key=KEY")} ${(init?.headers as Record<string, string> | undefined)?.Authorization ?? ""}`.trim());
    if (url.pathname.startsWith("/3/find/")) return json({ movie_results: [{ id: 278 }], tv_results: [] });
    if (url.pathname === "/3/movie/278/credits") {
      return json({ cast: [{ name: "Tim Robbins", character: "Andy Dufresne", profile_path: "/abc.jpg" }, { name: "No Photo", character: "", profile_path: null }, { name: "  ", character: "x" }, { name: "Bad Path", profile_path: "/../etc" }] });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
}

describe("TMDB cast lookup", () => {
  it("returns names, characters and photo addresses, dropping blanks and odd image paths", async () => {
    const calls: string[] = [];
    const cast = await createTmdbCast("0123456789abcdef0123456789abcdef", fakeTmdb(calls)).cast("tt0111161", "MOVIE");
    expect(cast).toEqual([
      { name: "Tim Robbins", character: "Andy Dufresne", photo: "https://image.tmdb.org/t/p/w185/abc.jpg" },
      { name: "No Photo", character: null, photo: null },
      { name: "Bad Path", character: null, photo: null },
    ]);
    expect(calls[0]).toContain("/3/find/tt0111161?external_source=imdb_id&api_key=KEY");
  });

  it("sends a v4 token as a bearer header, not in the address", async () => {
    const calls: string[] = [];
    await createTmdbCast("eyJhbGciOi.fake.token", fakeTmdb(calls)).cast("tt0111161", "MOVIE");
    expect(calls[0]).toBe("/3/find/tt0111161?external_source=imdb_id Bearer eyJhbGciOi.fake.token");
  });

  it("remembers answers and shares a lookup already under way", async () => {
    const f = fakeTmdb();
    const lookup = createTmdbCast("0123456789abcdef", f);
    await Promise.all([lookup.cast("tt0111161", "MOVIE"), lookup.cast("tt0111161", "MOVIE")]);
    await lookup.cast("tt0111161", "MOVIE");
    expect(f).toHaveBeenCalledTimes(2); // /find + /credits, once
  });

  it("does nothing without a key or for a malformed id", async () => {
    const f = fakeTmdb();
    expect(await createTmdbCast(undefined, f).cast("tt0111161", "MOVIE")).toEqual([]);
    expect(await createTmdbCast("0123456789abcdef", f).cast("../../x", "MOVIE")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("GET /api/cast", () => {
  it("answers an empty list when there is no TMDB key (the feature is off), without needing a session", async () => {
    const app = appWith(createMockBackend().fetch);
    const res = await request(app).get("/api/cast").query({ imdbId: "tt0111161", type: "MOVIE" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cast: [] });
  });
  it("answers an empty list for a malformed id even with a key", async () => {
    const app = appWith(createMockBackend().fetch, { tmdbKey: "0123456789abcdef" });
    const res = await request(app).get("/api/cast").query({ imdbId: "https://evil.example", type: "MOVIE" });
    expect(res.body).toEqual({ cast: [] });
  });
});
