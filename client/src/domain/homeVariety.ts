import { seededRandom } from "./recommend/rotation";

/**
 * Keeping Home fresh without making it irrelevant. A catalogue row that always shows the first 100 titles shows the same films to everyone, every
 * day. Instead each row draws from a few pages deep into the same ranking (so everything is still popular / new / well rated), and the order within
 * it is a gentle, seeded shuffle that favours the higher ranks. The seed is the account plus the day, so a row is steady while you use the app and
 * different tomorrow.
 */

/** A stable 32-bit number from text (FNV-1a), used to seed the shuffles. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Today's date (local) as YYYY-MM-DD, so the rows change at the person's own midnight. */
export const dayStamp = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Which catalogue page (0 = the top 100) a row reads today. [weights] is the chance of each page; the first is the likeliest. */
export function pickPage(seed: string, rowKey: string, weights: readonly number[]): number {
  const random = seededRandom(hashSeed(`${seed}|${rowKey}|page`))();
  const total = weights.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]! / total;
    if (random < acc) return i;
  }
  return weights.length - 1;
}

/**
 * A gentle shuffle: every item keeps a chance to land near the top but a better-ranked one is likelier to. Weight falls with rank
 * (1 / (1 + rank / 25)), and the order is a weighted random draw (Efraimidis-Spirakis keys) from a generator seeded by [seed] + [rowKey].
 */
export function varyOrder<T>(items: readonly T[], seed: string, rowKey: string): T[] {
  const random = seededRandom(hashSeed(`${seed}|${rowKey}|order`));
  return items
    .map((item, rank) => ({ item, key: Math.pow(random(), 1 / (1 / (1 + rank / 25))) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}

/** The genres Home shows as rows, in this order: wide appeal. Every other genre stays on the Movies and TV Shows pages. */
export const HOME_GENRES = ["Action", "Comedy", "Drama", "Thriller", "Horror", "Sci-Fi", "Crime", "Animation", "Documentary"];

/** Which of an addon's declared genres become Home rows: the curated ones it declares, in curated order (case-insensitive). */
export function homeGenresFor(declared: readonly string[]): string[] {
  const byLower = new Map(declared.map((g) => [g.toLowerCase(), g]));
  return HOME_GENRES.map((g) => byLower.get(g.toLowerCase())).filter((g): g is string => !!g);
}
