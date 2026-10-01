import cinemeta from "../assets/cinemeta_manifest.json";
import type { ContentType } from "./types";

/**
 * The genres of the Movies / TV Shows drop-down: exactly the genres Cinemeta's catalogue lists for each (no years), in its order.
 * TV Shows has three more than Movies (Reality-TV, Talk-Show, Game-Show).
 */
const genresOf = (type: "movie" | "series"): string[] => {
  const catalogs = cinemeta.catalogs as Array<{ id: string; type: string; genres?: string[] }>;
  return catalogs.find((c) => c.id === "top" && c.type === type)?.genres ?? [];
};

export const GENRE_OPTIONS: Record<ContentType, string[]> = { MOVIE: genresOf("movie"), TV_SHOW: genresOf("series") };
