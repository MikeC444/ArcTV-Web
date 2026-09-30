import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseExtra } from "../src/catalog/router.js";
import { TmdbClient } from "../src/catalog/tmdb.js";
import { testConfig } from "./helpers/app.js";

/** A tiny fake of TMDB's v3 API: 30 movies (ids 1–30, imdb ids tt1000001…) — every 7th has no poster, every 10th no IMDb id. */
function fakeTmdb() {
  const calls: string[] = [];
  const movie = (n: number) => ({ id: n, title: `Movie ${n}`, overview: `About ${n}`, poster_path: n % 7 === 0 ? null : `/p${n}.jpg`, backdrop_path: `/b${n}.jpg`, release_date: "2021-05-06", vote_average: 7.26, genre_ids: [28, 878] });
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const p = url.pathname.replace(/^\/3/, "");
    const page = Number(url.searchParams.get("page") ?? 1);
    let m: RegExpExecArray | null;
    if (/^\/(movie\/popular|discover\/movie|trending\/movie\/week|movie\/top_rated)$/.test(p)) {
      // each TMDB page has 20 results; page 1 → movies 1–20, page 2 → 21–30 (and nothing after)
      const from = (page - 1) * 20 + 1;
      return json({ results: Array.from({ length: 20 }, (_, i) => from + i).filter((n) => n <= 30).map(movie) });
    }
    if (/^\/(tv\/popular|discover\/tv|trending\/tv\/week|tv\/top_rated)$/.test(p)) return json({ results: [{ id: 500, name: "Show 500", poster_path: "/s500.jpg", backdrop_path: null, first_air_date: "2019-01-01", vote_average: 8, genre_ids: [10759] }] });
    if (p === "/search/movie") return json({ results: [movie(3)] });
    if ((m = /^\/movie\/(\d+)\/external_ids$/.exec(p))) return json({ imdb_id: Number(m[1]) % 10 === 0 ? null : `tt${1000000 + Number(m[1])}` });
    if ((m = /^\/tv\/(\d+)\/external_ids$/.exec(p))) return json({ imdb_id: "tt2000500" });
    if ((m = /^\/find\/(tt\d+)$/.exec(p))) {
      if (m[1] === "tt1000001") return json({ movie_results: [{ id: 1 }], tv_results: [] });
      if (m[1] === "tt2000500") return json({ movie_results: [], tv_results: [{ id: 500 }] });
      return json({ movie_results: [], tv_results: [] });
    }
    if (p === "/movie/1")
      return json({ ...movie(1), runtime: 142, genres: [{ id: 878, name: "Science Fiction" }, { id: 28, name: "Action" }], credits: { cast: [{ name: "Ana", character: "Neo", profile_path: "/ana.jpg" }, { name: "Bo" }], crew: [{ job: "Director", name: "Sam" }, { job: "Writer", name: "Kit" }] }, images: { logos: [{ file_path: "/fr.png", iso_639_1: "fr", vote_average: 9 }, { file_path: "/en.png", iso_639_1: "en", vote_average: 5 }] } });
    if (p === "/tv/500") return json({ id: 500, name: "Show 500", overview: "A show", poster_path: "/s500.jpg", backdrop_path: "/sb500.jpg", first_air_date: "2019-01-01", vote_average: 8.04, episode_run_time: [45], genres: [{ id: 10759, name: "Action & Adventure" }], created_by: [{ name: "Maker" }], seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }], credits: { cast: [{ name: "Cy" }] }, images: { logos: [] } });
    if ((m = /^\/tv\/500\/season\/(\d+)$/.exec(p))) return json({ episodes: [{ episode_number: 1, name: `S${m[1]}E1`, overview: "x", still_path: "/still.jpg", air_date: "2019-02-03" }, { episode_number: 2, name: `S${m[1]}E2` }] });
    return json({ status_message: "not found" }, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const appWithTmdb = (fake = fakeTmdb(), overrides = {}) => ({
  app: createApp(testConfig({ tmdbApiKey: "key123", tmdbApiBase: "http://tmdb.test/3", tmdbImageBase: "http://img.test/t/p", ...overrides }), { backend: async () => ({ status: 500, body: null, headers: {} }) as never, tmdbFetch: fake.fetchImpl }),
  fake,
});

describe("built-in catalog addon", () => {
  it("is off (a clear 404, open to browsers) when no TMDB key is configured", async () => {
    const app = createApp(testConfig(), { backend: (async () => ({ status: 500, body: null, headers: {} })) as never });
    const res = await request(app).get("/addon/manifest.json");
    expect(res.status).toBe(404);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("serves a Stremio manifest: catalog + meta, IMDb ids, Popular plus Trending / Top Rated / genre rows", async () => {
    const { app } = appWithTmdb();
    const res = await request(app).get("/addon/manifest.json");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.body).toMatchObject({ id: "tv.mango.catalog", name: "Mango TV Catalog", resources: ["catalog", "meta"], idPrefixes: ["tt"] });
    const popular = res.body.catalogs.find((c: { type: string; id: string }) => c.type === "movie" && c.id === "popular");
    expect(popular.extra.find((e: { name: string }) => e.name === "genre").options).toEqual(expect.arrayContaining(["Action", "Horror", "Sci-Fi"]));
    expect(popular.extra.map((e: { name: string }) => e.name)).toEqual(expect.arrayContaining(["search", "skip"]));
    const featured = res.body.catalogs.find((c: { type: string; id: string }) => c.type === "series" && c.id === "featured");
    expect(featured.extra[0]).toMatchObject({ name: "genre", options: ["Trending", "Top Rated"], isRequired: true });
  });

  it("builds a page of 100 from five TMDB pages, with IMDb ids and poster / backdrop URLs; titles without a poster or an IMDb id are left out", async () => {
    const { app, fake } = appWithTmdb();
    const res = await request(app).get("/addon/catalog/movie/popular.json");
    expect(res.status).toBe(200);
    const ids = res.body.metas.map((m: { id: string }) => m.id);
    // 30 movies, minus every 7th (no poster: 7, 14, 21, 28) and every 10th (no IMDb id: 10, 20, 30) = 23
    expect(ids).toHaveLength(23);
    expect(ids).toContain("tt1000001");
    expect(ids).not.toContain("tt1000007");
    expect(ids).not.toContain("tt1000010");
    expect(res.body.metas[0]).toMatchObject({ id: "tt1000001", type: "movie", name: "Movie 1", poster: "http://img.test/t/p/w500/p1.jpg", background: "http://img.test/t/p/w1280/b1.jpg", releaseInfo: "2021", imdbRating: "7.3", genres: ["Action", "Sci-Fi"] });
    const pages = fake.calls.filter((c) => c.startsWith("/3/movie/popular")).map((c) => new URL(`http://x/${c}`).searchParams.get("page"));
    expect(pages.sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("maps skip to later TMDB pages, genre to discover, and the featured rows to trending / top rated", async () => {
    const { app, fake } = appWithTmdb();
    await request(app).get("/addon/catalog/movie/popular/skip=100.json");
    const later = fake.calls.filter((c) => c.startsWith("/3/movie/popular")).map((c) => new URL(`http://x/${c}`).searchParams.get("page")).sort();
    expect(later).toEqual(["10", "6", "7", "8", "9"]);

    const genre = await request(app).get(`/addon/catalog/movie/popular/${encodeURIComponent("genre=Sci-Fi")}.json`);
    expect(genre.status).toBe(200);
    expect(fake.calls.some((c) => c.startsWith("/3/discover/movie") && c.includes("with_genres=878") && c.includes("sort_by=popularity.desc"))).toBe(true);

    await request(app).get(`/addon/catalog/series/featured/${encodeURIComponent("genre=Trending")}.json`);
    await request(app).get(`/addon/catalog/movie/featured/${encodeURIComponent("genre=Top Rated")}.json`);
    expect(fake.calls.some((c) => c.startsWith("/3/trending/tv/week"))).toBe(true);
    expect(fake.calls.some((c) => c.startsWith("/3/movie/top_rated"))).toBe(true);

    // a genre TMDB has no equivalent for (TV Horror), an unknown catalog and an unknown type are simply empty
    expect((await request(app).get(`/addon/catalog/series/popular/${encodeURIComponent("genre=Horror")}.json`)).body).toEqual({ metas: [] });
    expect((await request(app).get("/addon/catalog/movie/nothing.json")).body).toEqual({ metas: [] });
    expect((await request(app).get("/addon/catalog/channel/popular.json")).body).toEqual({ metas: [] });
  });

  it("searches", async () => {
    const { app } = appWithTmdb();
    const res = await request(app).get(`/addon/catalog/movie/popular/${encodeURIComponent("search=mov")}.json`);
    expect(res.body.metas.map((m: { id: string }) => m.id)).toEqual(["tt1000003"]);
  });

  it("answers repeated requests from its cache instead of asking TMDB again", async () => {
    const { app, fake } = appWithTmdb();
    await request(app).get("/addon/catalog/movie/popular.json");
    const first = fake.calls.length;
    await request(app).get("/addon/catalog/movie/popular.json");
    expect(fake.calls.length).toBe(first);
  });

  it("serves a movie's details: artwork, logo (English first), runtime, genres, cast and director", async () => {
    const { app } = appWithTmdb();
    const res = await request(app).get("/addon/meta/movie/tt1000001.json");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      id: "tt1000001",
      type: "movie",
      name: "Movie 1",
      logo: "http://img.test/t/p/w500/en.png",
      runtime: "142 min",
      genres: ["Sci-Fi", "Action"],
      cast: ["Ana", "Bo"],
      app_extras: { cast: [{ name: "Ana", character: "Neo", photo: "http://img.test/t/p/w185/ana.jpg" }, { name: "Bo" }] },
      director: ["Sam"],
      releaseInfo: "2021",
      released: "2021-05-06T00:00:00.000Z",
    });
  });

  it("serves a TV show's details with every episode as a video (id tt…:season:episode), skipping specials", async () => {
    const { app } = appWithTmdb();
    const res = await request(app).get("/addon/meta/series/tt2000500.json");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ id: "tt2000500", type: "series", name: "Show 500", runtime: "45 min", director: ["Maker"] });
    const videos = res.body.meta.videos as Array<{ id: string; season: number; episode: number; thumbnail?: string }>;
    expect(videos.map((v) => v.id)).toEqual(["tt2000500:1:1", "tt2000500:1:2", "tt2000500:2:1", "tt2000500:2:2"]);
    expect(videos[0]).toMatchObject({ season: 1, episode: 1, title: "S1E1", thumbnail: "http://img.test/t/p/w300/still.jpg" });
  });

  it("404s for an unknown or malformed id, and is a 502 (not a crash) when TMDB is down", async () => {
    const { app } = appWithTmdb();
    expect((await request(app).get("/addon/meta/movie/tt9999999.json")).status).toBe(404);
    expect((await request(app).get("/addon/meta/movie/not-an-id.json")).status).toBe(404);
    expect((await request(app).get("/addon/meta/channel/tt1000001.json")).status).toBe(404);

    const down = { fetchImpl: (async () => new Response("nope", { status: 503 })) as typeof fetch, calls: [] };
    const { app: brokenApp } = appWithTmdb(down as never);
    const res = await request(brokenApp).get("/addon/catalog/movie/popular.json");
    expect(res.status).toBe(502);
  }, 20_000);

  it("parses the extra segment defensively", () => {
    expect(parseExtra("genre=Action&skip=100")).toEqual({ genre: "Action", skip: 100 });
    expect(parseExtra("search=the%20matrix")).toEqual({ search: "the matrix" });
    expect(parseExtra("skip=abc&genre=" + "x".repeat(60))).toEqual({});
    expect(parseExtra("skip=99999999")).toEqual({});
    expect(parseExtra("%E0%A4%A&skip=5")).toEqual({ skip: 5 });
    expect(parseExtra(undefined)).toEqual({});
  });
});

describe("TMDB client", () => {
  const options = { baseUrl: "http://tmdb.test/3", imageBaseUrl: "http://img.test", retryDelayMs: 1 };

  it("sends a v3 key as api_key, and a v4 token as a bearer header", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = (async (url: URL, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await new TmdbClient({ ...options, apiKey: "abc", fetchImpl }).get("/x", { a: 1 });
    await new TmdbClient({ ...options, apiKey: "eyJhbGciOi.payload.sig", fetchImpl }).get("/x");
    expect(seen[0]).toEqual({ url: "http://tmdb.test/3/x?a=1&api_key=abc", auth: null });
    expect(seen[1]!.url).not.toContain("api_key");
    expect(seen[1]!.auth).toBe("Bearer eyJhbGciOi.payload.sig");
  });

  it("retries a 429 and then succeeds, never retries a 404, and doesn't remember failures", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response("", { status: 429 }) : new Response('{"ok":true}', { status: 200 }))) as unknown as typeof fetch;
    const client = new TmdbClient({ ...options, apiKey: "k", fetchImpl: flaky });
    await expect(client.get("/y")).resolves.toEqual({ ok: true });
    expect(n).toBe(3);

    let m = 0;
    const missing = (async () => (++m, new Response("", { status: 404 }))) as unknown as typeof fetch;
    const c2 = new TmdbClient({ ...options, apiKey: "k", fetchImpl: missing });
    await expect(c2.get("/z")).rejects.toMatchObject({ status: 404 });
    await expect(c2.get("/z")).rejects.toMatchObject({ status: 404 });
    expect(m).toBe(2); // one call each: not retried, and the failure wasn't cached
  });

  it("caps requests in flight", async () => {
    let active = 0;
    let peak = 0;
    const slow = (async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new TmdbClient({ ...options, apiKey: "k", fetchImpl: slow, concurrency: 3 });
    await Promise.all(Array.from({ length: 12 }, (_, i) => client.get(`/n${i}`)));
    expect(peak).toBeLessThanOrEqual(3);
  });
});
