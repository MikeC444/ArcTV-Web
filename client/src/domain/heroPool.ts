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
