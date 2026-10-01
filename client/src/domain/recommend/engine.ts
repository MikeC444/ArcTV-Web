import { CANDIDATE_DETAIL_FETCH_LIMIT, CATEGORY_WEIGHTS, INTERACTION_DETAIL_FETCH_LIMIT, MAX_RESULTS, MIN_INTERACTIONS_FOR_PERSONALISATION, SHORTLIST_BY_SCORE, SHORTLIST_SOURCE_MOVIES } from "./config";
import { diversify } from "./diversity";
import { rankSources, reasonFor, type Source } from "./explain";
import { type Features } from "./features";
import { buildPreferences } from "./preferences";
import { scoreCandidate } from "./score";
import type { Interaction } from "./signals";

/** A catalogue entry that could be recommended. `genres` come from the catalogue listing itself (no extra request). */
export interface Candidate {
  id: string;
  title: string;
  providerId?: string | null;
  genres: string[];
  rating?: number | null;
}

export interface MovieRef {
  id: string;
  providerId?: string | null;
}

/** Fetches (or reads from cache) the features of up to `limit` movies not yet known. Unknown or failed lookups come back as null. Must never throw. */
export type FeatureLoader = (refs: MovieRef[], limit: number) => Promise<Map<string, Features | null>>;

export interface EngineInput {
  interactions: Interaction[];
  /** Never recommended: finished, disliked / dismissed, or already in Continue Watching. */
  excludeIds: ReadonlySet<string>;
  pool: Candidate[];
  /** providerId for each of the profile's own movies, so their metadata can be looked up. */
  interactionRefs: ReadonlyMap<string, MovieRef>;
  loadFeatures: FeatureLoader;
}

export interface Picked {
  id: string;
  /** Internal ranking value; null in the popular fallback. Never shown as a percentage. */
  score: number | null;
  reason: string | null;
}

export type EngineResult = { mode: "personal"; items: Picked[] } | { mode: "popular"; items: Picked[] };

const byRatingThenId = (a: Candidate, b: Candidate): number => (b.rating ?? -1) - (a.rating ?? -1) || a.id.localeCompare(b.id);

/** Distinct, eligible candidates, in a deterministic order. */
function eligible(pool: Candidate[], excludeIds: ReadonlySet<string>): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const candidate of pool) {
    if (excludeIds.has(candidate.id) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    out.push(candidate);
  }
  return out;
}

/** Cold start / nothing scorable: the best-rated eligible movies, plainly labelled as popular, never as personalised. */
export function popularFallback(pool: Candidate[], excludeIds: ReadonlySet<string>): EngineResult {
  const items = eligible(pool, excludeIds)
    .sort(byRatingThenId)
    .slice(0, MAX_RESULTS)
    .map((c) => ({ id: c.id, score: null, reason: null }));
  return { mode: "popular", items };
}

/**
 * Ranking in four plain steps:
 *  1. look up the profile's own movies' features and turn the stored signals into genre / director / cast preference vectors;
 *  2. shortlist the eligible candidates from their catalogue genres alone: some by overall genre match, the rest round-robin over each of the
 *     profile's own movies (so every taste in the list is represented), within a bounded size;
 *  3. fetch the shortlist's directors and cast (cached, bounded concurrency) and score each with the full weighted cosine;
 *  4. sort by score (ties: rating, then id), then the separate diversity step (`diversity.ts`) keeps the top 20 while stopping any one of the
 *     profile's movies from explaining more than MAX_PICKS_PER_SOURCE of them.
 */
export async function recommend(input: EngineInput): Promise<EngineResult> {
  const pool = eligible(input.pool, input.excludeIds);
  const signalled = input.interactions.filter((i) => i.weight !== 0);
  if (signalled.length < MIN_INTERACTIONS_FOR_PERSONALISATION || !signalled.some((i) => i.weight > 0)) return popularFallback(pool, input.excludeIds);

  const own = signalled.slice(0, INTERACTION_DETAIL_FETCH_LIMIT).map((i) => input.interactionRefs.get(i.id) ?? { id: i.id });
  const ownFeatures = await input.loadFeatures(own, INTERACTION_DETAIL_FETCH_LIMIT);
  const prefs = buildPreferences(signalled, ownFeatures);

  // step 2: shortlist from the catalogue listing alone (its genres). Part by overall genre match; the rest round-robin over the profile's own movies,
  // so every taste in the list gets candidates, not only the biggest cluster.
  const preScored = pool
    .map((candidate) => ({ candidate, pre: scoreCandidate({ genres: normaliseGenres(candidate.genres), directors: [], cast: [] }, prefs, CATEGORY_WEIGHTS)?.score ?? -Infinity }))
    .sort((a, b) => b.pre - a.pre || byRatingThenId(a.candidate, b.candidate));
  const picked = new Set<string>();
  const shortlist: Candidate[] = [];
  const take = (candidate: Candidate): void => {
    if (picked.has(candidate.id) || shortlist.length >= CANDIDATE_DETAIL_FETCH_LIMIT) return;
    picked.add(candidate.id);
    shortlist.push(candidate);
  };
  preScored.slice(0, SHORTLIST_BY_SCORE).forEach((p) => take(p.candidate));
  const owners = signalled.filter((i) => i.weight > 0).slice(0, SHORTLIST_SOURCE_MOVIES);
  const perOwner = owners.map((owner) => {
    const own = new Set(ownFeatures.get(owner.id)?.genres ?? []);
    const overlap = (c: Candidate): number => {
      const genres = normaliseGenres(c.genres);
      const shared = genres.filter((g) => own.has(g)).length;
      return shared === 0 ? 0 : shared / (own.size + genres.length - shared);
    };
    return pool
      .map((candidate) => ({ candidate, similarity: overlap(candidate) }))
      .filter((x) => x.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity || byRatingThenId(a.candidate, b.candidate))
      .map((x) => x.candidate);
  });
  for (let round = 0; shortlist.length < CANDIDATE_DETAIL_FETCH_LIMIT && round < pool.length; round++) {
    let progressed = false;
    for (const list of perOwner) {
      const next = list.find((c) => !picked.has(c.id));
      if (next) {
        take(next);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  // anything still free is filled by overall match
  preScored.forEach((p) => take(p.candidate));

  // step 3: full features for the shortlist
  const details = await input.loadFeatures(
    shortlist.map((c) => ({ id: c.id, providerId: c.providerId })),
    CANDIDATE_DETAIL_FETCH_LIMIT,
  );

  const scored: Array<{ id: string; candidate: Candidate; score: number; sources: Source[] }> = [];
  for (const candidate of shortlist) {
    const fetched = details.get(candidate.id);
    const features: Features = { genres: fetched?.genres.length ? fetched.genres : normaliseGenres(candidate.genres), directors: fetched?.directors ?? [], cast: fetched?.cast ?? [] };
    const result = scoreCandidate(features, prefs);
    if (!result) continue;
    scored.push({ id: candidate.id, candidate, score: result.score, sources: result.score > 0 ? rankSources(features, prefs) : [] });
  }
  if (scored.length === 0) return popularFallback(pool, input.excludeIds);

  scored.sort((a, b) => b.score - a.score || byRatingThenId(a.candidate, b.candidate));
  const items = diversify(scored, MAX_RESULTS).map(({ pick, source }) => ({ id: pick.id, score: pick.score, reason: source ? reasonFor(source) : null }));
  return { mode: "personal", items };
}

const normaliseGenres = (genres: string[]): string[] => [...new Set(genres.map((g) => g.trim().toLowerCase()).filter(Boolean))];
