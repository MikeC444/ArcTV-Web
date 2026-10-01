import { CATEGORY_WEIGHTS } from "./config";
import { CATEGORIES, featureList, type Category, type Features } from "./features";
import { contributionKey, type Preferences } from "./preferences";
import type { SignalKind } from "./signals";

const VERB: Record<SignalKind, string> = { like: "liked", completed: "watched", watchlist: "saved", dislike: "" };
const STRENGTH: Record<SignalKind, number> = { like: 3, completed: 2, watchlist: 1, dislike: 0 };

/**
 * A reason taken from what actually raised this candidate's score. Every movie the profile has a positive signal for is credited with the part of
 * the candidate's score it contributed (the weighted sum, over the candidate's genres / directors / cast, of what that movie added to each feature).
 * The movie with the biggest total is cited, so each pick names the title it most resembles; ties go to the stronger signal (like, then finished, then saved), then id.
 * When that movie mostly matches through a shared director the reason says so instead. Returns null when nothing positive matched, so no reason is ever invented.
 */
export function explainCandidate(features: Features | null | undefined, prefs: Preferences, weights: Readonly<Record<Category, number>> = CATEGORY_WEIGHTS): string | null {
  if (!features) return null;
  const credit = new Map<string, { title: string; kind: SignalKind; total: number; director: number }>();
  for (const category of CATEGORIES) {
    for (const feature of featureList(features, category)) {
      for (const c of prefs.contributions.get(contributionKey(category, feature)) ?? []) {
        if (c.amount <= 0 || c.kind === "dislike") continue;
        const entry = credit.get(c.id) ?? { title: c.title, kind: c.kind, total: 0, director: 0 };
        const part = weights[category] * c.amount;
        entry.total += part;
        if (category === "director") entry.director += part;
        credit.set(c.id, entry);
      }
    }
  }
  const ranked = [...credit.entries()].sort(([ia, a], [ib, b]) => b.total - a.total || STRENGTH[b.kind] - STRENGTH[a.kind] || ia.localeCompare(ib));
  const top = ranked[0]?.[1];
  if (!top) return null;
  if (top.director > top.total / 2) return "More from directors you enjoy";
  return `Because you ${VERB[top.kind]} ${top.title}`;
}
