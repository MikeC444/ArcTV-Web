import { distinctBy } from "../../lib/format";
import type { Content, Episode, ResolutionTier, Season, SourceHealth, Stream } from "../types";
import type { StremioMeta, StremioMetaPreview, StremioStream, StremioVideo } from "./models";

/** Java's String.hashCode — keeps stream ids compatible with the Android app's `"$providerId:${idSeed.hashCode()}"`. */
export function javaHashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(31, hash) + text.charCodeAt(i)) | 0;
  return hash;
}

export function parseYear(releaseInfo: string | null | undefined): number | null {
  const digits = /^\d+/.exec(releaseInfo ?? "")?.[0];
  return digits && digits.length === 4 ? Number(digits) : null;
}

/**
 * "142 min" → 142, "2h 22min" → 142. (The Android mapper concatenates every digit, which turns "2h 22min"
 * into 222; addons that report h/min pairs deserve the right answer.)
 */
export function parseRuntimeMinutes(runtime: string | null | undefined): number | null {
  if (!runtime) return null;
  const hm = /(\d+)\s*h(?:\D*?(\d+)\s*m)?/i.exec(runtime);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const digits = runtime.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function parseRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const genresOf = (names: string[] | null | undefined) => (names ?? []).map((name) => ({ id: name.toLowerCase(), name }));

export function previewToContent(meta: StremioMetaPreview, providerId: string): Content {
  return {
    id: meta.id,
    type: meta.type === "series" ? "TV_SHOW" : "MOVIE",
    title: meta.name,
    description: meta.description ?? "",
    posterUrl: meta.poster ?? null,
    backdropUrl: meta.background ?? meta.poster ?? null,
    logoUrl: meta.logo ?? null,
    year: parseYear(meta.releaseInfo),
    runtimeMinutes: parseRuntimeMinutes(meta.runtime),
    rating: parseRating(meta.imdbRating),
    genres: genresOf(meta.genres),
    cast: [],
    providerId,
    seasons: [],
    watched: false,
  };
}

function videoToEpisode(video: StremioVideo): Episode {
  return {
    id: video.id,
    seasonNumber: video.season ?? 0,
    episodeNumber: video.episode ?? 0,
    title: video.title ?? video.name ?? `Episode ${video.episode ?? 0}`,
    description: video.overview ?? video.description ?? "",
    thumbnailUrl: video.thumbnail ?? null,
    runtimeMinutes: null,
  };
}

/** Groups a flat video list into per-season, episode-ordered Seasons. Season 0 ("Specials") is dropped. */
export function videosToSeasons(videos: StremioVideo[] | null | undefined): Season[] {
  const valid = (videos ?? []).filter((v) => v.season != null && v.season !== 0 && v.episode != null);
  const bySeason = new Map<number, StremioVideo[]>();
  for (const video of valid) {
    const list = bySeason.get(video.season as number) ?? [];
    list.push(video);
    bySeason.set(video.season as number, list);
  }
  return [...bySeason.keys()]
    .sort((a, b) => a - b)
    .map((seasonNumber) => ({
      seasonNumber,
      name: `Season ${seasonNumber}`,
      episodes: (bySeason.get(seasonNumber) as StremioVideo[]).slice().sort((a, b) => (a.episode as number) - (b.episode as number)).map(videoToEpisode),
    }));
}

export function metaToContent(meta: StremioMeta, providerId: string): Content {
  const base = previewToContent(meta, providerId);
  const directors = (meta.director ?? []).filter(Boolean);
  return {
    ...base,
    cast: (meta.cast ?? []).map((name) => ({ name })),
    director: directors.length ? directors.join(", ") : null,
    seasons: videosToSeasons(meta.videos),
  };
}

// Real addons (Torrentio-style) embed quality/size/seeders as free text in title/name, e.g.
// "Movie.2024.2160p.WEB-DL.DDP5.1.Atmos.x265-GROUP\n👤 1200 💾 23.6 GB". Every pattern is independently optional.
const RESOLUTION_4K = /2160p|4K|UHD/i;
const RESOLUTION_1080P = /1080p/i;
const RESOLUTION_720P = /720p/i;
const RESOLUTION_GENERIC = /(\d{3,4})p/i;
const SOURCE_TAG = /BluRay|BDRip|BRRip|WEB-?DL|WEBRip|HDTV|DVDRip|REMUX|CAM|TS/i;
const CODEC_HEVC = /x265|HEVC|H\.?265/i;
const CODEC_H264 = /x264|H\.?264|AVC/i;
const CODEC_AV1 = /AV1/i;
const AUDIO_TAG = /Dual[- ]?Audio|Multi[- ]?Audio|DDP?7\.1(\.Atmos)?|DD7\.1|DDP?5\.1(\.Atmos)?|DD5\.1|DTS-?HD(\.MA)?|DTS:?X|DTS|TrueHD(\.Atmos)?|Atmos|EAC3|AC3|AAC(2\.0|5\.1|7\.1)?|\b7\.1\b|\b5\.1\b|\b2\.0\b/i;
const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s?(GB|MB)/i;
const SEEDERS_EMOJI = /👤\s?(\d+)/;
const SEEDERS_WORD = /(\d+)\s*(?:seeds?|peers?)\b/i;

function formatSeederCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}

/** "[RD+] Torrentio" → cached on Real-Debrid; "[RD download] Torrentio" → not cached (the service has to fetch it first). */
const DEBRID_TAG = /^\s*\[\s*([A-Za-z]{2,3})\s*(\+|download)\s*\]/i;
export function parseDebridTag(name: string | null | undefined): { service: string; cached: boolean } | null {
  const match = DEBRID_TAG.exec(name ?? "");
  return match ? { service: match[1]!.toUpperCase(), cached: match[2] === "+" } : null;
}

export function streamToStream(stream: StremioStream, providerId: string, providerLabel: string): Stream {
  const haystack = [stream.title, stream.name, stream.description].filter((s): s is string => !!s).join("\n");

  let resolutionTier: ResolutionTier;
  let qualityBadge: string;
  if (RESOLUTION_4K.test(haystack)) [resolutionTier, qualityBadge] = ["UHD_4K", "4K"];
  else if (RESOLUTION_1080P.test(haystack)) [resolutionTier, qualityBadge] = ["FHD_1080P", "1080p"];
  else if (RESOLUTION_720P.test(haystack)) [resolutionTier, qualityBadge] = ["HD_720P", "720p"];
  else {
    const generic = RESOLUTION_GENERIC.exec(haystack)?.[1];
    [resolutionTier, qualityBadge] = ["OTHER", generic ? `${generic}p` : "SD"];
  }

  const sourceTag = SOURCE_TAG.exec(haystack)?.[0] ?? null;
  const codec = CODEC_HEVC.test(haystack) ? "HEVC" : CODEC_H264.test(haystack) ? "H.264" : CODEC_AV1.test(haystack) ? "AV1" : null;
  const audioTag = AUDIO_TAG.exec(haystack)?.[0] ?? null;

  const sizeMatch = SIZE_PATTERN.exec(haystack);
  const sizeLabel = sizeMatch?.[0] ?? null;
  const sizeBytes = sizeMatch ? Math.trunc(Number(sizeMatch[1]) * (sizeMatch[2]!.toUpperCase() === "GB" ? 1_000_000_000 : 1_000_000)) : null;

  const seedMatch = SEEDERS_EMOJI.exec(haystack) ?? SEEDERS_WORD.exec(haystack);
  const seeders = seedMatch ? Number(seedMatch[1]) : null;
  const sourceHealth: SourceHealth | null = seeders === null ? null : seeders >= 500 ? "VERY_HIGH" : seeders >= 100 ? "HIGH" : seeders >= 20 ? "GOOD" : "LOW";

  const releaseTitle = stream.title?.split("\n").find((line) => line.trim() !== "") ?? (stream.name && stream.name.trim() !== "" ? stream.name : "Unknown Source");
  const idSeed = stream.infoHash ?? stream.url ?? (stream.title ?? "") + (stream.name ?? "");
  // Some addons prefix `name` with a bracketed tag ("[TB+] Torrentio") that reads as noise in a compact label.
  const cleanedName = stream.name?.replace(/^\[.*?\]\s*/, "");

  return {
    id: `${providerId}:${javaHashCode(idSeed)}`,
    providerId,
    providerLabel: cleanedName && cleanedName.trim() !== "" ? cleanedName : providerLabel,
    resolutionTier,
    qualityBadge,
    releaseTitle,
    sourceTag,
    codec,
    audioTag,
    debrid: parseDebridTag(stream.name),
    descriptor: haystack,
    sizeLabel,
    sizeBytes,
    seeders,
    seedersLabel: seeders === null ? null : formatSeederCount(seeders),
    sourceHealth,
    url: stream.url ?? null,
    infoHash: stream.infoHash ?? null,
    ytId: stream.ytId ?? null,
    notWebReady: stream.behaviorHints?.notWebReady === true,
    proxyHeaders: stream.behaviorHints?.proxyHeaders?.request ?? null,
    proxyResponseHeaders: stream.behaviorHints?.proxyHeaders?.response ?? null,
  };
}

export const uniqueById = <T extends { id: string }>(items: T[]): T[] => distinctBy(items, (item) => item.id);
