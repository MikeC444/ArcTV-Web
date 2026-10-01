import type { Content } from "./types";

const norm = (genre: string): string => genre.trim().toLowerCase();

/** True when a title carries any of the blocked genres (case-insensitive). Titles whose addon sent no genres can't be matched. */
export function isBlocked(content: Pick<Content, "genres">, blocked: ReadonlySet<string>): boolean {
  if (blocked.size === 0) return false;
  return content.genres.some((g) => blocked.has(norm(g.name)));
}

export function withoutBlocked<T extends Pick<Content, "genres">>(items: T[], blocked: ReadonlySet<string>): T[] {
  return blocked.size === 0 ? items : items.filter((c) => !isBlocked(c, blocked));
}

/** The set a store's genre list turns into (lower-cased for matching). */
export const blockedSet = (genres: readonly string[]): Set<string> => new Set(genres.map(norm));
