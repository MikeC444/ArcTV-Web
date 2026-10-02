import { VARIETY_BAND } from "./config";

/** Small seeded generator (mulberry32): the same seed always gives the same sequence, so a given page load is stable and testable. */
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

/**
 * Variety step: applied after scoring and before the diversity step, and only reorders. Picks are cut into bands of `band` score points counted
 * down from the best pick; a pick in a higher band is ALWAYS ahead of every pick in a lower band, and only picks whose scores are
 * within one band of each other (effectively tied) are put in a seeded order instead of the fixed tie order. Scores and reasons are
 * never touched, nothing is added, and a pick that scored clearly lower can never overtake one that scored clearly higher. So a refresh can
 * show a different (still genuinely scored) selection among near-equal candidates, but never a made-up one.
 */
export function freshen<T extends { score: number }>(sortedByScore: T[], seed: number, band: number = VARIETY_BAND): T[] {
  if (sortedByScore.length < 2 || band <= 0) return sortedByScore;
  const random = seededRandom(seed);
  const top = sortedByScore[0]!.score;
  const bands = new Map<number, T[]>();
  for (const pick of sortedByScore) {
    const key = Math.floor((top - pick.score) / band);
    const members = bands.get(key);
    if (members) members.push(pick);
    else bands.set(key, [pick]);
  }
  const out: T[] = [];
  for (const key of [...bands.keys()].sort((a, b) => a - b)) {
    const members = bands.get(key)!;
    // Fisher–Yates with the seeded generator
    for (let i = members.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [members[i], members[j]] = [members[j]!, members[i]!];
    }
    out.push(...members);
  }
  return out;
}
