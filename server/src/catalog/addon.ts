import { COLLECTIONS, GENRE_NAMES, genreName, MOVIE_GENRES, TV_GENRES } from "./genres.js";
import type { TmdbClient } from "./tmdb.js";

/**
 * Mango TV's own Stremio-protocol addon (catalog + meta, like Cinemeta), built on TMDB. Every title is identified by its IMDb id
 * ("tt…") — the id stream addons and the TV app use — which TMDB can look up but does not put in its lists, so the ids are
 * resolved per title (and remembered) when a catalog page is built.
 */
export const ADDON_ID = "tv.mango.catalog";
const PAGE_SIZE = 100; // what the web app (like Cinemeta) treats as one "page": skip is an item offset
const TMDB_PAGE_SIZE = 20;
const MAX_TMDB_PAGE = 500;
const SEASON_LIMIT = 40;
const DAY = 24 * 3600_000;

type Kind = "movie" | "tv";
const kindOf = (type: string): Kind | null => (type === "movie" ? "movie" : type === "series" ? "tv" : null);
const IMDB_ID = /^tt\d{5,10}$/;

interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}
interface TmdbList {
  results?: TmdbListItem[];
}
interface TmdbDetail extends TmdbListItem {
  runtime?: number | null;
  episode_run_time?: number[];
  genres?: Array<{ id: number; name: string }>;
  credits?: { cast?: Array<{ name: string; character?: string; profile_path?: string | null }>; crew?: Array<{ job?: string; name: string }> };
  images?: { logos?: Array<{ file_path: string; iso_639_1?: string | null; vote_average?: number }> };
  external_ids?: { imdb_id?: string | null };
  created_by?: Array<{ name: string }>;
  seasons?: Array<{ season_number: number }>;
}
interface TmdbSeason {
  episodes?: Array<{ episode_number: number; name?: string; overview?: string; still_path?: string | null; air_date?: string | null }>;
}

export interface CatalogExtra {
  genre?: string;
  search?: string;
  skip?: number;
}

export function buildManifest() {
  const extraGenres = (options: readonly string[], isRequired: boolean) => ({ name: "genre", options: [...options], ...(isRequired ? { isRequired: true } : {}) });
  return {
    id: ADDON_ID,
    version: "1.0.0",
    name: "Mango TV Catalog",
    description: "Trending, popular and top-rated movies and TV shows with artwork, built into Mango TV. Movie and TV data from TMDB.",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [
      { type: "movie", id: "popular", name: "Popular", extra: [extraGenres(Object.keys(MOVIE_GENRES), false), { name: "search" }, { name: "skip" }] },
      { type: "series", id: "popular", name: "Popular", extra: [extraGenres(Object.keys(TV_GENRES), false), { name: "search" }, { name: "skip" }] },
      // the hand-made collections are "genres" that are required, so they show as their own rows rather than merging into Popular
      { type: "movie", id: "featured", name: "Featured", extra: [extraGenres(COLLECTIONS, true), { name: "skip" }] },
      { type: "series", id: "featured", name: "Featured", extra: [extraGenres(COLLECTIONS, true), { name: "skip" }] },
    ],
    behaviorHints: { configurable: false },
  };
}

const year = (date: string | undefined): string | undefined => (date && /^\d{4}/.test(date) ? date.slice(0, 4) : undefined);
const isoDate = (date: string | null | undefined): string | undefined => (date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : undefined);
const rating = (value: number | undefined): string | undefined => (value && value > 0 ? value.toFixed(1) : undefined);

export class CatalogService {
  private readonly tmdbIdByImdb = new Map<string, number>();

  constructor(
    private readonly tmdb: TmdbClient,
    private readonly options: { resolveBudgetMs?: number } = {},
  ) {}

  manifest() {
    return buildManifest();
  }

  // ── catalogs ────────────────────────────────────────────────────────────────

  /** Stremio `catalog` resource: one window of PAGE_SIZE titles starting at `extra.skip`. Unknown catalogs / genres are simply empty. */
  async catalog(type: string, id: string, extra: CatalogExtra): Promise<{ metas: unknown[] }> {
    const kind = kindOf(type);
    if (!kind) return { metas: [] };
    const source = this.source(kind, id, extra);
    if (!source) return { metas: [] };
    const items = extra.search ? await this.searchItems(kind, extra.search) : await this.pagedItems(source.path, source.params, extra.skip ?? 0);
    return { metas: await this.previews(kind, items) };
  }

  private source(kind: Kind, id: string, extra: CatalogExtra): { path: string; params: Record<string, string | number> } | null {
    const k = kind === "movie" ? "movie" : "tv";
    if (id === "popular") {
      if (extra.search) return { path: `/search/${k}`, params: {} };
      if (!extra.genre) return { path: `/${k}/popular`, params: {} };
      const ids = (kind === "movie" ? MOVIE_GENRES : TV_GENRES)[extra.genre];
      if (!ids) return null;
      return { path: `/discover/${k}`, params: { with_genres: ids.join("|"), sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": 100 } };
    }
    if (id === "featured") {
      if (extra.genre === "Trending") return { path: `/trending/${k}/week`, params: {} };
      if (extra.genre === "Top Rated") return { path: `/${k}/top_rated`, params: {} };
      return null;
    }
    return null;
  }

  private async pagedItems(path: string, params: Record<string, string | number>, skip: number): Promise<TmdbListItem[]> {
    const first = Math.floor(Math.max(0, skip) / TMDB_PAGE_SIZE) + 1;
    const pages = Array.from({ length: PAGE_SIZE / TMDB_PAGE_SIZE }, (_, i) => first + i).filter((page) => page <= MAX_TMDB_PAGE);
    const answers = await Promise.allSettled(pages.map((page) => this.tmdb.get<TmdbList>(path, { ...params, language: "en-US", page })));
    if (answers.every((a) => a.status === "rejected")) throw (answers[0] as PromiseRejectedResult).reason;
    return answers.flatMap((a) => (a.status === "fulfilled" ? a.value.results ?? [] : []));
  }

  private async searchItems(kind: Kind, query: string): Promise<TmdbListItem[]> {
    const answer = await this.tmdb.get<TmdbList>(`/search/${kind}`, { query, include_adult: "false", language: "en-US", page: 1 }, 10 * 60_000);
    return answer.results ?? [];
  }

  private async imdbId(kind: Kind, tmdbId: number): Promise<string | null> {
    try {
      const ids = await this.tmdb.get<{ imdb_id?: string | null }>(`/${kind}/${tmdbId}/external_ids`, {}, 30 * DAY);
      const imdb = ids.imdb_id ?? null;
      if (imdb && IMDB_ID.test(imdb)) {
        this.remember(imdb, tmdbId);
        return imdb;
      }
    } catch {
      /* a title whose id can't be found is left out of the list */
    }
    return null;
  }

  private remember(imdb: string, tmdbId: number): void {
    if (this.tmdbIdByImdb.size > 20_000) this.tmdbIdByImdb.clear();
    this.tmdbIdByImdb.set(imdb, tmdbId);
  }

  /** Previews for the titles that have a poster and an IMDb id. Titles whose id isn't known within the time budget are left out this time (they fill in on the next request). */
  private async previews(kind: Kind, items: TmdbListItem[]): Promise<unknown[]> {
    const candidates = items.filter((item) => item.poster_path);
    const found = new Map<number, string | null>();
    const work = Promise.allSettled(candidates.map(async (item) => void found.set(item.id, await this.imdbId(kind, item.id))));
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([work, new Promise<void>((resolve) => (timer = setTimeout(resolve, this.options.resolveBudgetMs ?? 6000)))]);
    if (timer) clearTimeout(timer);

    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of candidates) {
      const imdb = found.get(item.id);
      if (!imdb || seen.has(imdb)) continue;
      seen.add(imdb);
      const genres = (item.genre_ids ?? []).map(genreName).filter((g): g is string => !!g);
      out.push({
        id: imdb,
        type: kind === "movie" ? "movie" : "series",
        name: (kind === "movie" ? item.title : item.name) ?? "",
        poster: this.tmdb.image(item.poster_path, "w500"),
        posterShape: "poster",
        background: this.tmdb.image(item.backdrop_path, "w1280"),
        description: item.overview || undefined,
        releaseInfo: year(kind === "movie" ? item.release_date : item.first_air_date),
        imdbRating: rating(item.vote_average),
        genres: genres.length ? Array.from(new Set(genres)) : undefined,
      });
    }
    return out;
  }

  // ── details ─────────────────────────────────────────────────────────────────

  private async tmdbIdFor(kind: Kind, imdb: string): Promise<number | null> {
    const known = this.tmdbIdByImdb.get(imdb);
    if (known) return known;
    const found = await this.tmdb.get<{ movie_results?: Array<{ id: number }>; tv_results?: Array<{ id: number }> }>(`/find/${imdb}`, { external_source: "imdb_id" }, 7 * DAY);
    const id = (kind === "movie" ? found.movie_results : found.tv_results)?.[0]?.id ?? null;
    if (id) this.remember(imdb, id);
    return id;
  }

  /** Stremio `meta` resource. Returns null when the title is unknown. */
  async meta(type: string, imdb: string): Promise<{ meta: unknown } | null> {
    const kind = kindOf(type);
    if (!kind || !IMDB_ID.test(imdb)) return null;
    const tmdbId = await this.tmdbIdFor(kind, imdb);
    if (!tmdbId) return null;
    const detail = await this.tmdb.get<TmdbDetail>(`/${kind}/${tmdbId}`, { append_to_response: "credits,images,external_ids", include_image_language: "en,null", language: "en-US" }, 6 * 3600_000);

    const logos = (detail.images?.logos ?? []).slice().sort((a, b) => Number(b.iso_639_1 === "en") - Number(a.iso_639_1 === "en") || (b.vote_average ?? 0) - (a.vote_average ?? 0));
    const minutes = kind === "movie" ? detail.runtime : detail.episode_run_time?.[0];
    const genres = (detail.genres ?? []).map((g) => genreName(g.id) ?? g.name);
    const directors = kind === "movie" ? (detail.credits?.crew ?? []).filter((c) => c.job === "Director").map((c) => c.name) : (detail.created_by ?? []).map((c) => c.name);
    const date = kind === "movie" ? detail.release_date : detail.first_air_date;
    const cast = (detail.credits?.cast ?? []).slice(0, 15);

    const meta: Record<string, unknown> = {
      id: imdb,
      type,
      name: (kind === "movie" ? detail.title : detail.name) ?? "",
      poster: this.tmdb.image(detail.poster_path, "w500"),
      posterShape: "poster",
      background: this.tmdb.image(detail.backdrop_path, "w1280"),
      logo: this.tmdb.image(logos[0]?.file_path, "w500"),
      description: detail.overview || undefined,
      releaseInfo: year(date),
      released: isoDate(date),
      runtime: minutes ? `${minutes} min` : undefined,
      imdbRating: rating(detail.vote_average),
      genres: genres.length ? Array.from(new Set(genres)) : undefined,
      cast: cast.map((c) => c.name),
      // Stremio's extended cast, which the web app shows as round photos with the character's name
      app_extras: { cast: cast.map((c) => ({ name: c.name, character: c.character || undefined, photo: this.tmdb.image(c.profile_path, "w185") })) },
      director: directors.length ? directors : undefined,
    };
    if (kind === "tv") meta.videos = await this.episodes(imdb, tmdbId, detail);
    return { meta };
  }

  private async episodes(imdb: string, tmdbId: number, detail: TmdbDetail): Promise<unknown[]> {
    const numbers = (detail.seasons ?? []).map((s) => s.season_number).filter((n) => n > 0).slice(0, SEASON_LIMIT);
    const seasons = await Promise.allSettled(numbers.map((n) => this.tmdb.get<TmdbSeason>(`/tv/${tmdbId}/season/${n}`, { language: "en-US" }, 6 * 3600_000)));
    const videos: unknown[] = [];
    seasons.forEach((answer, i) => {
      if (answer.status !== "fulfilled") return;
      for (const ep of answer.value.episodes ?? []) {
        videos.push({
          id: `${imdb}:${numbers[i]}:${ep.episode_number}`,
          title: ep.name || `Episode ${ep.episode_number}`,
          season: numbers[i],
          episode: ep.episode_number,
          overview: ep.overview || undefined,
          thumbnail: this.tmdb.image(ep.still_path, "w300"),
          released: isoDate(ep.air_date),
        });
      }
    });
    return videos;
  }
}

export { GENRE_NAMES };
