import { CAST_FEATURE_LIMIT } from "./config";

export type Category = "genre" | "director" | "cast";
export const CATEGORIES: readonly Category[] = ["genre", "director", "cast"];

/** What Cinemeta tells us about a movie, normalised: lower-cased, trimmed, unique. Any list may be empty (metadata is often partial). */
export interface Features {
  genres: string[];
  directors: string[];
  cast: string[];
}

export const EMPTY_FEATURES: Features = { genres: [], directors: [], cast: [] };

/** The fields of a Stremio meta this needs (Cinemeta sends `genres`, `director`, `cast` and `app_extras.cast`). */
export interface MetaLike {
  genres?: string[] | null;
  director?: string[] | null;
  cast?: string[] | null;
  app_extras?: { cast?: Array<{ name?: string | null }> | null } | null;
}

export const normaliseName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

const unique = (names: ReadonlyArray<string | null | undefined>): string[] => {
  const out = new Set<string>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    const n = normaliseName(name);
    if (n !== "") out.add(n);
  }
  return [...out];
};

export function featuresFromMeta(meta: MetaLike): Features {
  const castNames = [...(meta.cast ?? []), ...(meta.app_extras?.cast ?? []).map((c) => c?.name)];
  return {
    genres: unique(meta.genres ?? []),
    directors: unique(meta.director ?? []),
    cast: unique(castNames).slice(0, CAST_FEATURE_LIMIT),
  };
}

export const featureList = (features: Features, category: Category): string[] => (category === "genre" ? features.genres : category === "director" ? features.directors : features.cast);

export const hasAnyFeature = (features: Features | null | undefined): boolean => !!features && (features.genres.length > 0 || features.directors.length > 0 || features.cast.length > 0);
