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

export interface RotationOptions {
  /** Picks that are always kept (the strongest recommendations). */
  anchors?: number;
  /** A swap-in must score at least this share of the best pick's score. */
  floor?: number;
  /** Weight multiplier for a pick that was in the previous row, so a refresh prefers ones that weren't. */
  repeatWeight?: number;
  /** Ids shown by the previous page load. */
  previous?: ReadonlySet<string>;
}

/**
 * Rotation step: applied after scoring and before the diversity step; it only chooses and orders, it never scores.
 *
 *  - The `anchors` best-scoring picks are always kept: a strong recommendation stays on every refresh.
 *  - The other `limit - anchors` places are drawn, with a seeded weighted draw, from the OTHER genuinely scored candidates that clear a floor
 *    (score > 0 and at least `floor` of the best score). Higher scores are likelier, and a candidate that was in the previous row is
 *    `repeatWeight` times as likely, so most of the row changes between loads while a pick that is clearly better still has the edge.
 *  - If too few candidates clear the floor, the next best by score fill the row, so it is never shorter than it would have been.
 *
 * Scores and reasons are never touched, nothing outside the scored candidates is ever shown, and a candidate that scored 0 or below is never swapped in.
 * The result is ordered by score, best first.
 */
export function rotate<T extends { id: string; score: number }>(sortedByScore: T[], limit: number, seed: number, options: RotationOptions = {}): T[] {
  const { anchors = ROTATION_ANCHORS, floor = ROTATION_FLOOR, repeatWeight = ROTATION_REPEAT_WEIGHT, previous = new Set<string>() } = options;
  if (sortedByScore.length <= anchors) return sortedByScore;
  const kept = sortedByScore.slice(0, Math.min(anchors, limit));
  const rest = sortedByScore.slice(kept.length);
  const best = sortedByScore[0]?.score ?? 0;
  const eligibleRest = rest.filter((p) => p.score > 0 && p.score >= best * floor);
  const places = Math.max(0, limit - kept.length);

  // Weighted draw without replacement (Efraimidis–Spirakis): key = u^(1/weight), keep the largest keys.
  const random = seededRandom(seed);
  const drawn = eligibleRest
    .map((pick) => {
      const weight = Math.max(1e-6, (pick.score / best) ** 2 * (previous.has(pick.id) ? repeatWeight : 1));
      return { pick, key: random() ** (1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, places)
    .map((x) => x.pick);

  const chosen = new Set(drawn.map((p) => p.id));
  const filler = rest.filter((p) => !chosen.has(p.id)).slice(0, Math.max(0, places - drawn.length));
  return [...kept, ...drawn, ...filler].sort((a, b) => b.score - a.score);
}
