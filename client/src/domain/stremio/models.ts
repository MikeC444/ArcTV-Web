/** Wire-format models of the Stremio addon protocol (data/addon/StremioModels.kt). */
export interface StremioMetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string | null;
  background?: string | null;
  logo?: string | null;
  description?: string | null;
  releaseInfo?: string | null;
  imdbRating?: string | number | null;
  genres?: string[] | null;
  runtime?: string | null;
}
export interface StremioVideo {
  id: string;
  title?: string | null;
  name?: string | null;
  season?: number | null;
  episode?: number | null;
  overview?: string | null;
  description?: string | null;
  thumbnail?: string | null;
}
/** Stremio's extended cast (Cinemeta sends it): names with the character played and a photo. */
export interface StremioCastExtra {
  name?: string | null;
  character?: string | null;
  photo?: string | null;
}
export interface StremioMeta extends StremioMetaPreview {
  director?: string[] | null;
  cast?: string[] | null;
  app_extras?: { cast?: StremioCastExtra[] | null } | null;
  videos?: StremioVideo[] | null;
}
export interface StremioBehaviorHints {
  notWebReady?: boolean;
  proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> };
  [key: string]: unknown;
}
export interface StremioStream {
  url?: string | null;
  ytId?: string | null;
  infoHash?: string | null;
  externalUrl?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  behaviorHints?: StremioBehaviorHints | null;
}
