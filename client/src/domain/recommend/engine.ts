import { CANDIDATE_DETAIL_FETCH_LIMIT, CATEGORY_WEIGHTS, INTERACTION_DETAIL_FETCH_LIMIT, MAX_RESULTS, MIN_INTERACTIONS_FOR_PERSONALISATION, SHORTLIST_BY_SCORE, SHORTLIST_GENRE_BUDGET, SHORTLIST_GENRE_MIN, SHORTLIST_SOURCE_MOVIES } from "./config";
import type { ContentType } from "../types";
import { diversify } from "./diversity";
import { rankSources, reasonFor, type Source } from "./explain";
import { compose } from "./rotation";
import { primaryGenre, tasteShares } from "./taste";
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
  /** Movie or TV show, so its details are looked up the right way. Missing means a movie. */
  type?: ContentType;
}

/** A title (movie or TV show) whose features are looked up. */
export interface MovieRef {
  id: string;
  providerId?: string | null;
  type?: ContentType;
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
  /** When set, a refresh swaps most of the row (see rotation.ts): the strongest picks stay, the rest are drawn with this seed. Absent = fully deterministic. */
  seed?: number;
  /** Ids shown by the previous page load; they are less likely to be drawn again. */
  previousShown?: ReadonlySet<string>;
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
 *  4. sort by score (ties: rating, then id), then the composition step (`rotation.ts`: the strongest picks stay, the other places follow the profile's genre split and, with a seed, are drawn so a refresh changes most of them), then the separate diversity step (`diversity.ts`) keeps the top 20 while stopping any one of the
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
  // Every genre the profile likes gets candidates to score, in proportion to its share of the profile's taste, so a minority taste (say 25% of the
  // profile) isn't left with nothing to be picked from just because the biggest taste scores higher on genre alone.
  const shares = tasteShares(signalled, ownFeatures, prefs);
  for (const [genre, share] of [...shares.entries()].sort((a, b) => b[1] - a[1])) {
    const quota = Math.max(SHORTLIST_GENRE_MIN, Math.ceil(share * SHORTLIST_GENRE_BUDGET));
    preScored
      .filter((p) => primaryGenre(normaliseGenres(p.candidate.genres), prefs) === genre)
      .slice(0, quota)
      .forEach((p) => take(p.candidate));
  }
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
    shortlist.map((c) => ({ id: c.id, providerId: c.providerId, type: c.type })),
    CANDIDATE_DETAIL_FETCH_LIMIT,
  );

  // A candidate that is itself one of the profile's movies (saved or liked but not finished) is judged against the profile WITHOUT that movie, so it
  // can neither boost its own score nor be named as its own reason.
  const ownIds = new Set(signalled.map((i) => i.id));
  const withoutSelf = new Map<string, ReturnType<typeof buildPreferences>>();
  const prefsFor = (id: string) => {
    if (!ownIds.has(id)) return prefs;
    let p = withoutSelf.get(id);
    if (!p) {
      p = buildPreferences(
        signalled.filter((i) => i.id !== id),
        ownFeatures,
      );
      withoutSelf.set(id, p);
    }
    return p;
  };
  const scored: Array<{ id: string; candidate: Candidate; score: number; sources: Source[]; genre: string | null }> = [];
  for (const candidate of shortlist) {
    const fetched = details.get(candidate.id);
    const features: Features = { genres: fetched?.genres.length ? fetched.genres : normaliseGenres(candidate.genres), directors: fetched?.directors ?? [], cast: fetched?.cast ?? [] };
    const candidatePrefs = prefsFor(candidate.id);
    const result = scoreCandidate(features, candidatePrefs);
    if (!result) continue;
    scored.push({ id: candidate.id, candidate, score: result.score, sources: result.score > 0 ? rankSources(features, candidatePrefs) : [], genre: primaryGenre(features.genres, prefs) });
  }
  if (scored.length === 0) return popularFallback(pool, input.excludeIds);

  scored.sort((a, b) => b.score - a.score || byRatingThenId(a.candidate, b.candidate));
  // The row is composed from the scored candidates: the strongest stay, the other places follow the profile's genre split, and (with a seed) are
  // drawn so a refresh changes most of them. What is not in the row follows in score order, so the source cap can still pull in a next-best pick
  // when it has to skip one. Without a seed the order is fully deterministic.
  const composed = compose(scored, MAX_RESULTS, { shares, seed: input.seed, previous: input.previousShown });
  const ordered = [...composed, ...scored.filter((p) => !composed.includes(p))];
  const items = diversify(ordered, MAX_RESULTS).map(({ pick, source }) => ({ id: pick.id, score: pick.score, reason: source ? reasonFor(source) : null }));
  return { mode: "personal", items };
}

const normaliseGenres = (genres: string[]): string[] => [...new Set(genres.map((g) => g.trim().toLowerCase()).filter(Boolean))];
