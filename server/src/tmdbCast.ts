/**
 * Cast photos and characters from TMDB, for titles whose addon (Cinemeta) sends names only.
 *
 * The browser asks THIS server (`GET /api/cast?imdbId=tt…&type=MOVIE|TV_SHOW`); this server asks TMDB with the key from TMDB_API_KEY,
 * which never leaves it. Only api.themoviedb.org is ever called, with ids that were checked first, so there is nothing for a visitor
 * to steer (no SSRF). Answers are kept for a day, and a lookup already in flight is shared. No key → the lookup is simply off.
 */
export interface CastEntry {
  name: string;
  character: string | null;
  photo: string | null;
}

type Fetch = typeof fetch;

const TMDB = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w185";
const TTL_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 1000;
const MAX_CAST = 20;
const TIMEOUT_MS = 8_000;

export const IMDB_ID = /^tt\d{1,10}$/;

export function createTmdbCast(key: string | undefined, fetchImpl: Fetch = fetch) {
  const cache = new Map<string, { at: number; value: CastEntry[] }>();
  const pending = new Map<string, Promise<CastEntry[]>>();
  // A v4 token is a long JWT ("eyJ…"); a v3 key is 32 hex characters. Either works.
  const bearer = key?.startsWith("eyJ") === true;

  async function get(path: string): Promise<unknown> {
    const url = new URL(`${TMDB}${path}`);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${key}`;
    else url.searchParams.set("api_key", key!);
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`TMDB answered ${response.status}`);
    return response.json();
  }

  async function lookup(imdbId: string, type: "MOVIE" | "TV_SHOW"): Promise<CastEntry[]> {
    const found = (await get(`/find/${imdbId}?external_source=imdb_id`)) as { movie_results?: Array<{ id: number }>; tv_results?: Array<{ id: number }> };
    const id = (type === "MOVIE" ? found.movie_results?.[0]?.id : found.tv_results?.[0]?.id) ?? (type === "MOVIE" ? found.tv_results?.[0]?.id : found.movie_results?.[0]?.id);
    if (typeof id !== "number") return [];
    const credits = (await get(type === "MOVIE" && found.movie_results?.[0] ? `/movie/${id}/credits` : `/tv/${id}/aggregate_credits`)) as {
      cast?: Array<{ name?: string; character?: string; roles?: Array<{ character?: string }>; profile_path?: string | null; order?: number }>;
    };
    return (credits.cast ?? [])
      .filter((member) => typeof member.name === "string" && member.name.trim() !== "")
      .slice(0, MAX_CAST)
      .map((member) => ({
        name: member.name!.trim(),
        character: (member.character || member.roles?.[0]?.character || "").trim() || null,
        photo: member.profile_path && /^\/[\w.-]+$/.test(member.profile_path) ? `${IMAGE}${member.profile_path}` : null,
      }));
  }

  return {
    enabled: Boolean(key),
    async cast(imdbId: string, type: "MOVIE" | "TV_SHOW"): Promise<CastEntry[]> {
      if (!key || !IMDB_ID.test(imdbId)) return [];
      const cacheKey = `${type}:${imdbId}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
      let run = pending.get(cacheKey);
      if (!run) {
        run = lookup(imdbId, type).then(
          (value) => {
            if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
            cache.set(cacheKey, { at: Date.now(), value });
            pending.delete(cacheKey);
            return value;
          },
          (error) => {
            pending.delete(cacheKey);
            throw error; // not cached: the next visit tries again
          },
        );
        pending.set(cacheKey, run);
      }
      return run;
    },
  };
}
