import { CATEGORY_WEIGHTS } from "./config";
import { CATEGORIES, featureList, type Category, type Features } from "./features";
import { contributionKey, vectorOf, type Preferences } from "./preferences";
import type { SignalKind } from "./signals";

const VERB: Record<SignalKind, string> = { like: "liked", completed: "watched", watchlist: "saved", dislike: "" };

/**
 * A reason taken from what actually raised the score: the matching feature with the biggest positive pull, and the movie that most strengthened it.
 * Returns null when nothing positive matched, so no reason is ever invented.
 */
export function explainCandidate(features: Features | null | undefined, prefs: Preferences, weights: Readonly<Record<Category, number>> = CATEGORY_WEIGHTS): string | null {
  if (!features) return null;
  let best: { category: Category; feature: string; strength: number } | null = null;
  for (const category of CATEGORIES) {
    const vector = vectorOf(prefs, category);
    for (const feature of featureList(features, category)) {
      const preference = vector.get(feature) ?? 0;
      if (preference <= 0) continue;
      const strength = weights[category] * preference;
      if (!best || strength > best.strength) best = { category, feature, strength };
    }
  }
  if (!best) return null;
  if (best.category === "director") return "More from directors you enjoy";
  const sources = (prefs.contributions.get(contributionKey(best.category, best.feature)) ?? []).filter((c) => c.amount > 0 && c.kind !== "dislike").sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const top = sources[0];
  if (!top) return null;
  return `Because you ${VERB[top.kind]} ${top.title}`;
}
