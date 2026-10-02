import { ROTATION_ANCHORS, ROTATION_FLOOR, ROTATION_REPEAT_WEIGHT } from "./config";

/** Small seeded generator (mulberry32): the same seed always gives the same sequence, so one page load is stable and the step is testable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ComposePick {
  id: string;
  score: number;
  /** The genre the pick stands for in the profile (see taste.ts); null when it matches none of the profile's genres. */
  genre: string | null;
}

export interface ComposeOptions {
  /** The profile's taste split across genres, summing to 1. Empty = no genre targets, the row is just the best scores (with rotation). */
  shares?: ReadonlyMap<string, number>;
  /** Picks that are always kept: the strongest recommendations. */
  anchors?: number;
  /** A pick drawn into the row must score at least this share of the best score within its own genre. */
  floor?: number;
  /** Weight multiplier for a pick that was in the previous row. */
  repeatWeight?: number;
  /** Ids shown by the previous page load. */
  previous?: ReadonlySet<string>;
  /** Without a seed nothing is drawn: each place simply takes the best-scoring pick of its genre. */
  seed?: number;
}

/**
 * Composition step: applied after scoring and before the diversity step; it only CHOOSES and ORDERS picks that were genuinely scored, it never scores.
 *
 *  1. The `anchors` best-scoring picks overall are always kept: a strong recommendation is there on every refresh.
 *  2. Every other place is given to a genre by the profile's own taste split (Sainte-Laguë proportional apportionment: a place goes to the genre
 *     with the highest share ÷ (2 × places it already holds + 1)), so a profile that is 75% horror and 25% other gets about three quarters horror and a quarter
 *     the other genres it likes, instead of the biggest cluster filling every place. A profile with one taste gets a one-genre row.
 *  3. Within a genre, the pick is drawn with a seeded weighted draw over that genre's other scored picks (score > 0 and at least `floor` of that
 *     genre's best), higher scores likelier, and a pick shown in the previous row `repeatWeight` times as likely, so a refresh swaps most of
 *     the row. With no seed, the genre's best-scoring pick is taken.
 *  4. If a genre runs out, its place goes to the next genre; if all run out, the best remaining scores fill the row.
 *
 * Scores and reasons are never touched and nothing that wasn't scored is added. The row is the anchors (best first), then the rest in the order
 * the places were given out, so the genres are mixed through the row rather than saved for the end.
 */
export function compose<T extends ComposePick>(sortedByScore: T[], limit: number, options: ComposeOptions = {}): T[] {
  const { shares = new Map<string, number>(), anchors = ROTATION_ANCHORS, floor = ROTATION_FLOOR, repeatWeight = ROTATION_REPEAT_WEIGHT, previous = new Set<string>(), seed } = options;
  if (sortedByScore.length <= Math.min(anchors, limit)) return sortedByScore.slice(0, limit);
  const random = seed === undefined ? null : seededRandom(seed);

  const row: T[] = sortedByScore.slice(0, Math.min(anchors, limit));
  const used = new Set(row.map((p) => p.id));
  const count = new Map<string, number>();
  for (const p of row) if (p.genre) count.set(p.genre, (count.get(p.genre) ?? 0) + 1);

  // each genre's remaining scored picks, best first (null-genre picks only ever fill at the end)
  const buckets = new Map<string, T[]>();
  for (const p of sortedByScore) {
    if (used.has(p.id) || !p.genre || p.score <= 0) continue;
    const list = buckets.get(p.genre);
    if (list) list.push(p);
    else buckets.set(p.genre, [p]);
  }

  // the floor is measured against each genre's best scored pick overall, not against whatever is left of it
  const genreBest = new Map<string, number>();
  for (const p of sortedByScore) if (p.genre && p.score > 0 && !genreBest.has(p.genre)) genreBest.set(p.genre, p.score);

  const drawFrom = (bucket: T[]): T | null => {
    const best = bucket[0] ? (genreBest.get(bucket[0].genre ?? "") ?? bucket[0].score) : 0;
    const eligible = bucket.filter((p) => p.score >= best * floor);
    if (eligible.length === 0) return null;
    if (!random) return eligible[0]!;
    // weighted draw of one: Efraimidis–Spirakis key = u^(1/weight), largest wins
    let winner = eligible[0]!;
    let winnerKey = -1;
    for (const p of eligible) {
      const weight = Math.max(1e-6, (p.score / best) ** 2 * (previous.has(p.id) ? repeatWeight : 1));
      const key = random() ** (1 / weight);
      if (key > winnerKey) {
        winner = p;
        winnerKey = key;
      }
    }
    return winner;
  };

  while (row.length < limit) {
    // Genres in order of Sainte-Laguë priority, share / (2 × places already held + 1): a proportional split of the places that also mixes the
    // genres through the row (a minority taste gets its places early, not after the biggest taste has used up the first half).
    const wanted = [...buckets.entries()]
      .filter(([, list]) => list.length > 0)
      .map(([genre]) => ({ genre, priority: (shares.get(genre) ?? 0) / (2 * (count.get(genre) ?? 0) + 1) }))
      .sort((a, b) => b.priority - a.priority || (shares.get(b.genre) ?? 0) - (shares.get(a.genre) ?? 0) || a.genre.localeCompare(b.genre));
    let chosen: T | null = null;
    for (const { genre } of wanted) {
      chosen = drawFrom(buckets.get(genre)!);
      if (chosen) break;
    }
    if (!chosen) break;
    row.push(chosen);
    used.add(chosen.id);
    if (chosen.genre) {
      count.set(chosen.genre, (count.get(chosen.genre) ?? 0) + 1);
      buckets.set(chosen.genre, buckets.get(chosen.genre)!.filter((p) => p.id !== chosen!.id));
    }
  }
  // nothing left that clears the bar: the best remaining scores fill the row
  for (const p of sortedByScore) {
    if (row.length >= limit) break;
    if (!used.has(p.id)) {
      row.push(p);
      used.add(p.id);
    }
  }
  return row;
}
