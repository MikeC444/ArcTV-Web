import type { HomeRowPreferences, HomeSection } from "./types";

/** Rows keep the addon's order unless the user has reordered them; unranked rows sink below these well-known names. */
const DEFAULT_ROW_PRIORITY = [
  "featured", "popular", "trending", "trending now", "new releases", "top 10 movies", "top 10 tv shows", "recently added",
  "action", "comedy", "horror", "romance", "thriller", "drama", "sci-fi", "science fiction", "fantasy", "mystery", "crime",
  "family", "kids", "children", "anime", "animation", "documentary", "music", "musical", "adventure",
];

function defaultRank(section: HomeSection): number {
  if (section.id.endsWith("_base")) return -1;
  const rank = DEFAULT_ROW_PRIORITY.indexOf(section.title.trim().toLowerCase());
  return rank >= 0 ? rank : DEFAULT_ROW_PRIORITY.length;
}

/** HomeRowPreferences.applyOrder: the user's explicit order first, then everything else by default rank (stable). */
export function applyRowOrder(sections: HomeSection[], preferences: HomeRowPreferences): HomeSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered = preferences.order.map((id) => byId.get(id)).filter((s): s is HomeSection => !!s);
  const explicit = new Set(preferences.order);
  const remaining = sections
    .filter((section) => !explicit.has(section.id))
    .map((section, index) => ({ section, index, rank: defaultRank(section) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.section);
  return [...ordered, ...remaining];
}

export function moveRow(displayOrder: string[], rowId: string, delta: number): string[] | null {
  const ids = displayOrder.slice();
  const index = ids.indexOf(rowId);
  if (index < 0) return null;
  const newIndex = Math.min(Math.max(index + delta, 0), ids.length - 1);
  if (newIndex === index) return null;
  ids.splice(index, 1);
  ids.splice(newIndex, 0, rowId);
  return ids;
}
