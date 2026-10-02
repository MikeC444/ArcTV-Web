import type { Features } from "./features";
import type { Preferences } from "./preferences";
import type { Interaction } from "./signals";

/**
 * The genre a movie "stands for" in this profile: of its own genres, the one the profile likes most overall (ties: alphabetical).
 * Null when none of its genres has a positive weight in the profile. Used on both the profile's own movies and on candidates, so the two
 * are bucketed the same way.
 */
export function primaryGenre(genres: readonly string[], prefs: Preferences): string | null {
  let best: string | null = null;
  let bestWeight = 0;
  for (const genre of [...new Set(genres)].sort()) {
    const weight = prefs.genre.get(genre) ?? 0;
    if (weight > bestWeight) {
      best = genre;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * How the profile's taste splits across genres: each of its own movies with a positive signal counts, by its signal weight, towards that movie's
 * primary genre. So a profile that is three quarters horror (by signal) gets a share of about 0.75 for horror and the rest spread over what else it likes.
 * Shares sum to 1; empty when there is nothing positive to go on.
 */
export function tasteShares(signalled: readonly Interaction[], ownFeatures: ReadonlyMap<string, Features | null>, prefs: Preferences): Map<string, number> {
  const raw = new Map<string, number>();
  let total = 0;
  for (const interaction of signalled) {
    if (interaction.weight <= 0) continue;
    const genre = primaryGenre(ownFeatures.get(interaction.id)?.genres ?? [], prefs);
    if (!genre) continue;
    raw.set(genre, (raw.get(genre) ?? 0) + interaction.weight);
    total += interaction.weight;
  }
  const shares = new Map<string, number>();
  if (total <= 0) return shares;
  for (const [genre, weight] of raw) shares.set(genre, weight / total);
  return shares;
}
