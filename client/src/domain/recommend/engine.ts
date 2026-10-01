import { CANDIDATE_DETAIL_FETCH_LIMIT, CATEGORY_WEIGHTS, INTERACTION_DETAIL_FETCH_LIMIT, MAX_RESULTS, MIN_INTERACTIONS_FOR_PERSONALISATION } from "./config";
import { explainCandidate } from "./explain";
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
 *  2. pre-rank the eligible candidates by genre alone (their listing already carries genres), keeping a bounded shortlist;
 *  3. fetch the shortlist's directors and cast (cached, bounded concurrency) and score each with the full weighted cosine;
 *  4. sort by score (ties: rating, then id) and keep the top 20.
 * Diversity re-ranking is deliberately not applied here; if it is ever wanted it should be a separate step after this one.
 */
export async function recommend(input: EngineInput): Promise<EngineResult> {
  const pool = eligible(input.pool, input.excludeIds);
  const signalled = input.interactions.filter((i) => i.weight !== 0);
  if (signalled.length < MIN_INTERACTIONS_FOR_PERSONALISATION || !signalled.some((i) => i.weight > 0)) return popularFallback(pool, input.excludeIds);

  const own = signalled.slice(0, INTERACTION_DETAIL_FETCH_LIMIT).map((i) => input.interactionRefs.get(i.id) ?? { id: i.id });
  const ownFeatures = await input.loadFeatures(own, INTERACTION_DETAIL_FETCH_LIMIT);
  const prefs = buildPreferences(signalled, ownFeatures);

  // step 2: genre-only pre-rank from the catalogue listing
  const preScored = pool
    .map((candidate) => ({ candidate, pre: scoreCandidate({ genres: normaliseGenres(candidate.genres), directors: [], cast: [] }, prefs, CATEGORY_WEIGHTS)?.score ?? -Infinity }))
    .sort((a, b) => b.pre - a.pre || byRatingThenId(a.candidate, b.candidate));
  const shortlist = preScored.slice(0, CANDIDATE_DETAIL_FETCH_LIMIT).map((p) => p.candidate);

  // step 3: full features for the shortlist
  const details = await input.loadFeatures(
    shortlist.map((c) => ({ id: c.id, providerId: c.providerId })),
    CANDIDATE_DETAIL_FETCH_LIMIT,
  );

  const scored: Array<{ candidate: Candidate; score: number; reason: string | null }> = [];
  for (const candidate of shortlist) {
    const fetched = details.get(candidate.id);
    const features: Features = { genres: fetched?.genres.length ? fetched.genres : normaliseGenres(candidate.genres), directors: fetched?.directors ?? [], cast: fetched?.cast ?? [] };
    const result = scoreCandidate(features, prefs);
    if (!result) continue;
    scored.push({ candidate, score: result.score, reason: result.score > 0 ? explainCandidate(features, prefs) : null });
  }
  if (scored.length === 0) return popularFallback(pool, input.excludeIds);

  scored.sort((a, b) => b.score - a.score || byRatingThenId(a.candidate, b.candidate));
  return { mode: "personal", items: scored.slice(0, MAX_RESULTS).map((s) => ({ id: s.candidate.id, score: s.score, reason: s.reason })) };
}

const normaliseGenres = (genres: string[]): string[] => [...new Set(genres.map((g) => g.trim().toLowerCase()).filter(Boolean))];
