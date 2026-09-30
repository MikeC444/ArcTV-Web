// A tiny fake of TMDB's v3 API (and image CDN) for the browser tests of the built-in catalog addon.
// 300 movies (TMDB ids 1–300, IMDb ids tt8000001…; every 13th has NO IMDb id) and 20 TV shows (TMDB ids 501–520, IMDb ids tt8100001…).
const MOVIE_GENRES = [28, 35, 18, 878, 27, 10749];
const TV_GENRES = [10759, 35, 18, 10765];
const imdbOfMovie = (n) => (n % 13 === 0 ? null : `tt${8000000 + n}`);
const imdbOfTv = (n) => `tt${8100000 + (n - 500)}`;

const movie = (n) => ({ id: n, title: `Tmdb Movie ${n}`, overview: `Movie ${n} from the fake TMDB.`, poster_path: `/p${n}.svg`, backdrop_path: `/b${n}.svg`, release_date: `${2000 + (n % 24)}-06-15`, vote_average: 5 + (n % 40) / 10, genre_ids: [MOVIE_GENRES[n % 6], MOVIE_GENRES[(n + 2) % 6]] });
const show = (n) => ({ id: n, name: `Tmdb Show ${n - 500}`, overview: `Show ${n - 500} from the fake TMDB.`, poster_path: `/p${n}.svg`, backdrop_path: `/b${n}.svg`, first_air_date: `${2005 + (n % 19)}-01-10`, vote_average: 6 + (n % 30) / 10, genre_ids: [TV_GENRES[n % 4]] });
const MOVIES = Array.from({ length: 300 }, (_, i) => movie(i + 1));
const SHOWS = Array.from({ length: 20 }, (_, i) => show(501 + i));

export function handleFakeTmdb(res, p, url, svg) {
  const send = (body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(body));
    return true;
  };
  let m = /^\/tmdb-img\/w185\/actor(\d+)\.svg$/.exec(p);
  if (m) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" });
    res.end(svg("poster", `${m[1]}-actor`));
    return true;
  }
  m = /^\/tmdb-img\/(w\d+)\/([pb])(\d+)\.svg$/.exec(p);
  if (m) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" });
    res.end(svg(m[2] === "p" ? "poster" : "bg", `${m[3]}-tmdb`));
    return true;
  }
  if (!p.startsWith("/tmdb/3/")) return false;
  if (url.searchParams.get("api_key") !== "e2e-key") return send({ status_message: "Invalid API key" }, 401);
  const q = p.slice("/tmdb/3".length);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageOf = (items) => send({ page, results: items.slice((page - 1) * 20, page * 20), total_pages: Math.ceil(items.length / 20) });

  if (q === "/movie/popular") return pageOf(MOVIES);
  if (q === "/tv/popular") return pageOf(SHOWS);
  if (q === "/trending/movie/week") return pageOf(MOVIES.slice().reverse());
  if (q === "/trending/tv/week") return pageOf(SHOWS.slice().reverse());
  if (q === "/movie/top_rated") return pageOf(MOVIES.slice().sort((a, b) => b.vote_average - a.vote_average || a.id - b.id));
  if (q === "/tv/top_rated") return pageOf(SHOWS.slice().sort((a, b) => b.vote_average - a.vote_average || a.id - b.id));
  if (q === "/discover/movie" || q === "/discover/tv") {
    const wanted = (url.searchParams.get("with_genres") ?? "").split("|").map(Number);
    return pageOf((q === "/discover/movie" ? MOVIES : SHOWS).filter((it) => it.genre_ids.some((g) => wanted.includes(g))));
  }
  if (q === "/search/movie") return send({ page: 1, results: MOVIES.filter((it) => it.title.toLowerCase().includes((url.searchParams.get("query") ?? "").toLowerCase())) });
  if (q === "/search/tv") return send({ page: 1, results: SHOWS.filter((it) => it.name.toLowerCase().includes((url.searchParams.get("query") ?? "").toLowerCase())) });
  if ((m = /^\/movie\/(\d+)\/external_ids$/.exec(q))) return send({ imdb_id: imdbOfMovie(Number(m[1])) });
  if ((m = /^\/tv\/(\d+)\/external_ids$/.exec(q))) return send({ imdb_id: imdbOfTv(Number(m[1])) });
  if ((m = /^\/find\/(tt\d+)$/.exec(q))) {
    const n = Number(m[1].slice(2));
    if (n > 8000000 && n <= 8000300) return send({ movie_results: [MOVIES[n - 8000001]], tv_results: [] });
    if (n > 8100000 && n <= 8100020) return send({ movie_results: [], tv_results: [SHOWS[n - 8100001]] });
    return send({ movie_results: [], tv_results: [] });
  }
  if ((m = /^\/movie\/(\d+)$/.exec(q))) {
    const item = MOVIES[Number(m[1]) - 1];
    if (!item) return send({ status_message: "not found" }, 404);
    return send({ ...item, runtime: 100 + (item.id % 50), genres: item.genre_ids.map((id) => ({ id, name: `g${id}` })), credits: { cast: [{ name: "Fake Actor", character: "Hero", profile_path: "/actor1.svg" }, { name: "Other Actor" }], crew: [{ job: "Director", name: "Fake Director" }] }, images: { logos: [] }, external_ids: { imdb_id: imdbOfMovie(item.id) } });
  }
  if ((m = /^\/tv\/(\d+)$/.exec(q))) {
    const item = SHOWS[Number(m[1]) - 501];
    if (!item) return send({ status_message: "not found" }, 404);
    return send({ ...item, episode_run_time: [42], genres: item.genre_ids.map((id) => ({ id, name: `g${id}` })), created_by: [{ name: "Fake Creator" }], seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }], credits: { cast: [{ name: "Show Actor" }] }, images: { logos: [] }, external_ids: { imdb_id: imdbOfTv(item.id) } });
  }
  if ((m = /^\/tv\/(\d+)\/season\/(\d+)$/.exec(q))) return send({ episodes: [1, 2, 3].map((e) => ({ episode_number: e, name: `Episode ${e}`, overview: `Season ${m[2]}, episode ${e}.`, still_path: `/b${m[1]}.svg`, air_date: "2020-03-0" + e })) });
  return send({ status_message: "not found" }, 404);
}
