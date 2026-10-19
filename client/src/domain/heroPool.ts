import { shuffled } from "../lib/format";
import type { Content } from "./types";

/** A real, landscape background — not the poster that stands in for one when an addon has none. */
export const hasWideBackdrop = (content: Pick<Content, "backdropUrl" | "posterUrl">): boolean => Boolean(content.backdropUrl) && content.backdropUrl !== content.posterUrl;

/**
 * The titles the Home hero rotates through. The hero is a full-width picture, so a title whose only image is a portrait poster
 * is mostly cropped away (a 2:3 poster in a 2.4:1 box shows about a quarter of itself): prefer titles with a real landscape
 * background, and only fill up with the others (images first, blank ones last) when there aren't enough.
 */
export function pickHeroPool<T extends Pick<Content, "backdropUrl" | "posterUrl">>(pool: readonly T[], size: number, random: () => number = Math.random): T[] {
  const wide = shuffled(pool.filter(hasWideBackdrop), random);
  if (wide.length >= size) return wide.slice(0, size);
  const rest = pool.filter((c) => !hasWideBackdrop(c));
  const withImage = shuffled(rest.filter((c) => c.backdropUrl || c.posterUrl), random);
  const blank = shuffled(rest.filter((c) => !c.backdropUrl && !c.posterUrl), random);
  return [...wide, ...withImage, ...blank].slice(0, size);
}

/**
 * The Home hero's titles: `size` random ones from the rows the person has enabled (`enabled`). Only when those rows hold fewer
 * than `size` titles in total is the rest made up with random titles from the other rows (`backup`) — never a title twice.
 */
export function pickHeroTitles<T extends Pick<Content, "id" | "backdropUrl" | "posterUrl">>(enabled: readonly T[], backup: readonly T[], size: number, random: () => number = Math.random): T[] {
  const own = pickHeroPool(enabled, size, random);
  if (own.length >= size) return own;
  const taken = new Set(own.map((c) => c.id));
  const extra = pickHeroPool(backup.filter((c) => !taken.has(c.id)), size - own.length, random);
  return shuffled([...own, ...extra], random);
}

/** How many titles with a real landscape background the hero needs before it is shown: it doesn't wait for the slowest addon. */
export const HERO_READY_WIDE = 3;

/**
 * The hero's titles as Home's rows arrive. `current` is what the hero already shows (kept, in order, so the slide on screen never
 * changes under the viewer); new titles are added at the end, up to `size`.
 *  - Nothing shown yet: as soon as the enabled rows hold HERO_READY_WIDE titles with a real background, start with those; failing that,
 *    once they hold `size` titles of any kind (addons with posters only), pick as `pickHeroTitles` always has.
 *  - Shown, while addons are still answering (`final` false): add titles with a real background as they arrive.
 *  - Every addon has answered (`final` true): fill up the way `pickHeroTitles` does, poster-only titles and other rows (`backup`) included.
 * Returns `current` itself when nothing is added.
 */
export function growHeroTitles<T extends Pick<Content, "id" | "backdropUrl" | "posterUrl">>(
  current: readonly T[],
  enabled: readonly T[],
  backup: readonly T[],
  size: number,
  final: boolean,
  random: () => number = Math.random,
): readonly T[] {
  if (current.length >= size) return current;
  const taken = new Set(current.map((c) => c.id));
  const fresh = enabled.filter((c) => !taken.has(c.id));
  if (final) {
    const more = pickHeroTitles(fresh, backup.filter((c) => !taken.has(c.id)), size - current.length, random);
    return more.length > 0 ? [...current, ...more] : current;
  }
  const wide = shuffled(fresh.filter(hasWideBackdrop), random);
  if (current.length === 0) {
    if (wide.length >= HERO_READY_WIDE) return wide.slice(0, size);
    return enabled.length >= size ? pickHeroTitles(enabled, [], size, random) : current;
  }
  return wide.length > 0 ? [...current, ...wide.slice(0, size - current.length)] : current;
}
