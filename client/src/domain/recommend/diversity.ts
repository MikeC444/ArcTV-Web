import { MAX_PICKS_PER_SOURCE, MAX_RESULTS } from "./config";
import type { Source } from "./explain";

export interface ScoredPick {
  id: string;
  score: number;
  /** Movies of the profile's that contributed to this pick, best first (see `rankSources`). */
  sources: Source[];
}

export interface DiversifiedPick<T extends ScoredPick> {
  pick: T;
  /** The source movie this pick is explained by (null when none contributed positively). */
  source: Source | null;
}

/**
 * Diversity step — separate from scoring and applied after it. Walks the picks best score first and gives each the strongest of its
 * contributing movies that is not yet "used up" (a movie can explain at most `maxPerSource` picks); a pick whose contributors are all used up
 * waits and only fills spare places at the end. The order is therefore still score order, but one cluster of the profile's taste can't crowd
 * out the rest, and every stated reason names a movie that really contributed to that pick.
 */
export function diversify<T extends ScoredPick>(sortedByScore: T[], limit: number = MAX_RESULTS, maxPerSource: number = MAX_PICKS_PER_SOURCE): Array<DiversifiedPick<T>> {
  const used = new Map<string, number>();
  const chosen: Array<DiversifiedPick<T>> = [];
  const waiting: T[] = [];
  for (const pick of sortedByScore) {
    if (chosen.length >= limit) break;
    if (pick.sources.length === 0) {
      chosen.push({ pick, source: null });
      continue;
    }
    const source = pick.sources.find((s) => (used.get(s.id) ?? 0) < maxPerSource);
    if (!source) {
      waiting.push(pick);
      continue;
    }
    used.set(source.id, (used.get(source.id) ?? 0) + 1);
    chosen.push({ pick, source });
  }
  for (const pick of waiting) {
    if (chosen.length >= limit) break;
    chosen.push({ pick, source: pick.sources[0] ?? null });
  }
  return chosen;
}
