/** Port of data/model/{Content,Stream,Addon,PlayerPreferences}.kt — the one shape every screen reads. */
export type ContentType = "MOVIE" | "TV_SHOW";

export interface Genre {
  id: string;
  name: string;
}
export interface CastMember {
  name: string;
  role?: string | null;
  photoUrl?: string | null;
}
export interface WatchProgress {
  positionMs: number;
  durationMs: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
}
export interface Episode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  runtimeMinutes: number | null;
}
export interface Season {
  seasonNumber: number;
  name: string;
  episodes: Episode[];
}
export interface Content {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl?: string | null;
  year?: number | null;
  ageRating?: string | null;
  runtimeMinutes?: number | null;
  rating?: number | null;
  genres: Genre[];
  cast: CastMember[];
  director?: string | null;
  providerId?: string | null;
  watchProgress?: WatchProgress | null;
  seasons: Season[];
  /** My-List entry with watched=true. Never comes from an addon; screens stamp it from My List. */
  watched: boolean;
}

export type RowStyle = "STANDARD" | "CONTINUE_WATCHING";
export interface HomeSection {
  id: string;
  title: string;
  items: Content[];
  style: RowStyle;
}

/** Order matters: it is the sort order for "Quality" (ordinal in Kotlin). */
export const RESOLUTION_ORDER = ["UHD_4K", "FHD_1080P", "HD_720P", "OTHER"] as const;
export type ResolutionTier = (typeof RESOLUTION_ORDER)[number];
export const resolutionOrdinal = (tier: ResolutionTier): number => RESOLUTION_ORDER.indexOf(tier);

export type SourceHealth = "VERY_HIGH" | "HIGH" | "GOOD" | "LOW";
export const SOURCE_HEALTH_LABEL: Record<SourceHealth, string> = {
  VERY_HIGH: "Excellent Health",
  HIGH: "Good Health",
  GOOD: "Fair Health",
  LOW: "Poor Health",
};

export interface Stream {
  id: string;
  providerId: string;
  providerLabel: string;
  resolutionTier: ResolutionTier;
  qualityBadge: string;
  releaseTitle: string;
  sourceTag?: string | null;
  codec?: string | null;
  audioTag?: string | null;
  /** The addon's raw title/name/description text — only used to work out the file's format (see deviceSupport). */
  descriptor?: string | null;
  sizeLabel?: string | null;
  sizeBytes?: number | null;
  seeders?: number | null;
  seedersLabel?: string | null;
  sourceHealth?: SourceHealth | null;
  url?: string | null;
  infoHash?: string | null;
  ytId?: string | null;
  /** Stremio `behaviorHints` the browser cares about. */
  notWebReady?: boolean;
  proxyHeaders?: Record<string, string> | null;
}

// ── Addons (Stremio manifest.json) ────────────────────────────────────────────
export interface AddonCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[] | null;
  optionsLimit?: number | null;
}
export interface AddonCatalogDef {
  type: string;
  id: string;
  name?: string | null;
  extra: AddonCatalogExtra[];
  /** Older manifests list genres here instead of in extra. */
  genres?: string[];
  extraRequired?: string[];
  extraSupported?: string[];
}
export interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  logo?: string | null;
  background?: string | null;
  types: string[];
  resources: unknown[];
  catalogs: AddonCatalogDef[];
  idPrefixes: string[];
}
export interface InstalledAddon {
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
}

export interface PlayerPreferences {
  autoplayNextEpisode: boolean;
  skipIntroEnabled: boolean;
  subtitlesEnabled: boolean;
  defaultSubtitleLanguage: string | null;
}
export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  autoplayNextEpisode: true,
  skipIntroEnabled: true,
  subtitlesEnabled: true,
  defaultSubtitleLanguage: null,
};

export interface HomeRowPreferences {
  order: string[];
  hiddenRowIds: string[];
}
export const DEFAULT_HOME_ROW_PREFERENCES: HomeRowPreferences = { order: [], hiddenRowIds: [] };

export function emptyContent(partial: Partial<Content> & Pick<Content, "id" | "type" | "title">): Content {
  return {
    description: "",
    posterUrl: null,
    backdropUrl: null,
    genres: [],
    cast: [],
    seasons: [],
    watched: false,
    ...partial,
  };
}
