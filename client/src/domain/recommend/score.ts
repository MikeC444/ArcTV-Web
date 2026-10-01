import { CATEGORY_WEIGHTS } from "./config";
import { CATEGORIES, featureList, type Category, type Features } from "./features";
import { hasPreference, vectorOf, type Preferences, type Vector } from "./preferences";

/** Cosine similarity of two sparse vectors; negative preferences stay negative. null when either vector has no magnitude. */
export function cosine(a: Vector, b: Vector): number | null {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [key, value] of a) {
    na += value * value;
    const other = b.get(key);
    if (other !== undefined) dot += value * other;
  }
  for (const value of b.values()) nb += value * value;
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Score {
  /** Internal ranking value in [-1, 1]. Not a probability and not a rating. */
  score: number;
  /** The per-category cosine similarities that went into it (only the categories that could be compared). */
  categories: Partial<Record<Category, number>>;
}

/** A candidate as a 0/1 feature vector per category (each unique feature counts once). */
const candidateVector = (features: Features, category: Category): Vector => new Map(featureList(features, category).map((f) => [f, 1]));

/**
 * Weighted mean of the category similarities. A category with no candidate metadata, or where the profile has no nonzero preference, is omitted
 * and the remaining weights are renormalised; if nothing can be compared the candidate is unscored (null).
 */
export function scoreCandidate(features: Features | null | undefined, prefs: Preferences, weights: Readonly<Record<Category, number>> = CATEGORY_WEIGHTS): Score | null {
  if (!features) return null;
  const categories: Partial<Record<Category, number>> = {};
  let weighted = 0;
  let total = 0;
  for (const category of CATEGORIES) {
    if (featureList(features, category).length === 0 || !hasPreference(prefs, category)) continue;
    const similarity = cosine(candidateVector(features, category), vectorOf(prefs, category));
    if (similarity === null) continue;
    categories[category] = similarity;
    weighted += weights[category] * similarity;
    total += weights[category];
  }
  if (total === 0) return null;
  return { score: weighted / total, categories };
}
