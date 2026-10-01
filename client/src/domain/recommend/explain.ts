import { CATEGORY_WEIGHTS } from "./config";
import { CATEGORIES, featureList, type Category, type Features } from "./features";
import { contributionKey, type Preferences } from "./preferences";
import type { SignalKind } from "./signals";

const VERB: Record<SignalKind, string> = { like: "liked", completed: "watched", watchlist: "saved", dislike: "" };
const STRENGTH: Record<SignalKind, number> = { like: 3, completed: 2, watchlist: 1, dislike: 0 };

/** One of the profile's movies and how much of a candidate's score it accounts for. */
export interface Source {
  id: string;
  title: string;
  kind: SignalKind;
  /** Weighted sum over the candidate's genres / directors / cast of what this movie added to each feature. */
  total: number;
  /** The part of `total` that came through directors. */
  director: number;
}

/**
 * Every movie the profile has a positive signal for, credited with the part of this candidate's score it contributed (weighted over the candidate's
 * genres, directors and cast), biggest first; ties go to the stronger signal (like, finished, saved), then id. Disliked movies are never sources.
 */
export function rankSources(features: Features | null | undefined, prefs: Preferences, weights: Readonly<Record<Category, number>> = CATEGORY_WEIGHTS): Source[] {
  if (!features) return [];
  const credit = new Map<string, Source>();
  for (const category of CATEGORIES) {
    for (const feature of featureList(features, category)) {
      for (const c of prefs.contributions.get(contributionKey(category, feature)) ?? []) {
        if (c.amount <= 0 || c.kind === "dislike") continue;
        const entry = credit.get(c.id) ?? { id: c.id, title: c.title, kind: c.kind, total: 0, director: 0 };
        const part = weights[category] * c.amount;
        entry.total += part;
        if (category === "director") entry.director += part;
        credit.set(c.id, entry);
      }
    }
  }
  return [...credit.values()].sort((a, b) => b.total - a.total || STRENGTH[b.kind] - STRENGTH[a.kind] || a.id.localeCompare(b.id));
}

/** The reason line for a source: "Because you liked X", or "More from directors you enjoy" when it mostly matches through a shared director. */
export const reasonFor = (source: Source): string => (source.director > source.total / 2 ? "More from directors you enjoy" : `Because you ${VERB[source.kind]} ${source.title}`);

/** The reason for the single best source, or null when nothing positive matched (no reason is ever invented). */
export function explainCandidate(features: Features | null | undefined, prefs: Preferences, weights: Readonly<Record<Category, number>> = CATEGORY_WEIGHTS): string | null {
  const top = rankSources(features, prefs, weights)[0];
  return top ? reasonFor(top) : null;
}
