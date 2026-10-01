import { DETAIL_FETCH_CONCURRENCY, FEATURE_CACHE_MAX_ENTRIES, FEATURE_CACHE_TTL_MS } from "./config";
import type { MovieRef } from "./engine";
import type { Features } from "./features";
import { globalKey, readJson, writeJson } from "../../state/persist";

/** Movie features outlive a refresh: a small persistent cache in this browser (Cinemeta's own in-memory cache only lasts five minutes). */
const KEY = globalKey("recFeatures");
type Entry = { g: string[]; d: string[]; c: string[]; at: number };
type Store = Record<string, Entry>;

let memory: Store | null = null;
const load = (): Store => (memory ??= readJson<Store>(KEY, {}));

export function cachedFeatures(id: string, now = Date.now()): Features | null {
  const entry = load()[id];
  if (!entry || now - entry.at > FEATURE_CACHE_TTL_MS) return null;
  return { genres: entry.g, directors: entry.d, cast: entry.c };
}

function remember(id: string, features: Features, now = Date.now()): void {
  const store = load();
  store[id] = { g: features.genres, d: features.directors, c: features.cast, at: now };
  const ids = Object.keys(store);
  if (ids.length > FEATURE_CACHE_MAX_ENTRIES) {
    ids
      .sort((a, b) => store[a]!.at - store[b]!.at)
      .slice(0, ids.length - FEATURE_CACHE_MAX_ENTRIES)
      .forEach((old) => delete store[old]);
  }
}

export const clearFeatureCache = (): void => {
  memory = {};
  writeJson(KEY, {});
};

/**
 * Features for the given movies: cache first, then at most `limit` lookups through `fetchOne`, DETAIL_FETCH_CONCURRENCY at a time.
 * A failed or empty lookup yields null and is not cached, so a later refresh can try again.
 */
export async function loadFeaturesCached(refs: MovieRef[], limit: number, fetchOne: (ref: MovieRef) => Promise<Features | null>, concurrency = DETAIL_FETCH_CONCURRENCY): Promise<Map<string, Features | null>> {
  const out = new Map<string, Features | null>();
  const missing: MovieRef[] = [];
  for (const ref of refs) {
    if (out.has(ref.id)) continue;
    const hit = cachedFeatures(ref.id);
    if (hit) out.set(ref.id, hit);
    else if (missing.length < limit) {
      out.set(ref.id, null);
      missing.push(ref);
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const ref = missing[next++]!;
      try {
        const features = await fetchOne(ref);
        if (features && (features.genres.length || features.directors.length || features.cast.length)) {
          out.set(ref.id, features);
          remember(ref.id, features);
        }
      } catch {
        /* leave null */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  if (missing.length > 0) writeJson(KEY, load());
  return out;
}
