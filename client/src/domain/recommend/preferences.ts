import { CATEGORIES, featureList, type Category, type Features } from "./features";
import type { Interaction, SignalKind } from "./signals";

export type Vector = Map<string, number>;

export interface Contribution {
  id: string;
  title: string;
  kind: SignalKind;
  amount: number;
}

export interface Preferences {
  genre: Vector;
  director: Vector;
  cast: Vector;
  /** Which movies pushed each feature, for honest explanations ("genre|drama" → [...]). */
  contributions: Map<string, Contribution[]>;
}

export const contributionKey = (category: Category, feature: string): string => `${category}|${feature}`;

export const vectorOf = (prefs: Preferences, category: Category): Vector => prefs[category];

/**
 * One preference map per category. A movie's signal weight is split equally among its unique features within each category,
 * so a film with a long cast list doesn't count for more than one with a short one. Movies without metadata for a category add nothing there.
 */
export function buildPreferences(interactions: Interaction[], featuresById: ReadonlyMap<string, Features | null>): Preferences {
  const prefs: Preferences = { genre: new Map(), director: new Map(), cast: new Map(), contributions: new Map() };
  for (const interaction of interactions) {
    const features = featuresById.get(interaction.id);
    if (!features) continue;
    for (const category of CATEGORIES) {
      const list = featureList(features, category);
      if (list.length === 0) continue;
      const share = interaction.weight / list.length;
      const vector = vectorOf(prefs, category);
      for (const feature of list) {
        vector.set(feature, (vector.get(feature) ?? 0) + share);
        const key = contributionKey(category, feature);
        const entries = prefs.contributions.get(key) ?? [];
        entries.push({ id: interaction.id, title: interaction.title, kind: interaction.kind, amount: share });
        prefs.contributions.set(key, entries);
      }
    }
  }
  return prefs;
}

/** True when the profile has any nonzero preference in this category. */
export const hasPreference = (prefs: Preferences, category: Category): boolean => {
  for (const value of vectorOf(prefs, category).values()) if (value !== 0) return true;
  return false;
};
