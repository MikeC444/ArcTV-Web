/**
 * "Picked for you" — every number that shapes the recommendation lives here, named, so tuning never means hunting through logic.
 * The score is an internal ranking value only. It is not the IMDb rating, a star rating, or a probability that someone will enjoy a film.
 */

/** What one movie says about a profile's taste. The strongest applicable signal wins; explicit feedback always takes precedence. */
export const SIGNAL_WEIGHTS = {
  like: 5,
  dislike: -5,
  /** Finished the movie (the app's own completion rule), with no explicit feedback. */
  completed: 2,
  /** On the watchlist, with no explicit feedback and not finished. */
  watchlist: 1,
} as const;

/** How the three similarities combine. A category with no usable data is left out and the rest are renormalised. */
export const CATEGORY_WEIGHTS = {
  genre: 0.6,
  director: 0.25,
  cast: 0.15,
} as const;

export const MAX_RESULTS = 20;

/** Diversity step (applied after scoring, separate from it): one movie of the profile's can be the stated reason for at most this many picks, and the shortlist is drawn from across the whole list. */
export const MAX_PICKS_PER_SOURCE = 3;
/** Shortlist: this many by overall genre match, the rest taken round-robin from the best matches of each of the profile's own movies. */
export const SHORTLIST_BY_SCORE = 20;
/** How many of the profile's own movies take a turn in the round-robin (strongest signals first). */
export const SHORTLIST_SOURCE_MOVIES = 12;

/** Fewer than this many interactions (with at least one positive) and the row is the labelled popular-movies fallback instead. */
export const MIN_INTERACTIONS_FOR_PERSONALISATION = 3;

/** Billing-order cast beyond this adds noise, not taste. */
export const CAST_FEATURE_LIMIT = 12;

/** Network budget: how many candidates get a detail lookup per refresh, how many of the profile's own movies are looked up, and how many run at once. */
export const CANDIDATE_DETAIL_FETCH_LIMIT = 40;
export const INTERACTION_DETAIL_FETCH_LIMIT = 60;
export const DETAIL_FETCH_CONCURRENCY = 4;

/** Persistent per-browser cache of movie features (genres / directors / cast) so a refresh rarely touches the network. */
export const FEATURE_CACHE_MAX_ENTRIES = 800;
export const FEATURE_CACHE_TTL_MS = 30 * 24 * 3600_000;

export const PICKED_ROW_ID = "picked_for_you";
export const PICKED_ROW_TITLE = "Picked for you";
export const POPULAR_ROW_TITLE = "Popular movies — not personalised yet";
