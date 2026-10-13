import type { EngineKind } from "./playability";
import { assessStream, engineFor } from "./playability";
import type { Stream } from "./types";

/** The catalogue types the Live TV tab reads: channels ("tv") and sports or other live events ("events"). The movie and show tabs ignore them. */
export const LIVE_TYPES = ["tv", "events"] as const;
export type LiveType = (typeof LIVE_TYPES)[number];
export const isLiveType = (type: string): type is LiveType => (LIVE_TYPES as readonly string[]).includes(type);

/** One channel or live event, as a TV addon's catalogue lists it. */
export interface LiveChannel {
  id: string;
  name: string;
  /** The addon's own type for it ("tv" or "events"): it is what the addon is asked for streams by. */
  type: LiveType;
  logoUrl: string | null;
  /** The addon's preferred picture shape; most TV addons send square logos. */
  shape: "square" | "landscape" | "poster";
  description: string;
  genres: string[];
  providerId: string;
  providerName: string;
}

const MEDIA_FILE = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv)(\?|#|$)/i;

/**
 * Which pipeline to try first for a live link. Live links are nearly always HLS and often have no ".m3u8" in them, so anything that is
 * not plainly a video file starts with hls.js (which fails fast on a non-HLS answer, and then the player tries the plain video element).
 */
export function liveEngineFor(url: string): EngineKind {
  const guess = engineFor(url);
  if (guess !== "native") return guess;
  return MEDIA_FILE.test(url) ? "native" : "hls";
}

/** What the player may try, best first: playable links before doubtful ones, then HLS and DASH before plain files, keeping the addon's own order otherwise. */
export function playableLiveStreams(streams: Stream[]): Stream[] {
  const rank = (stream: Stream): number | null => {
    const verdict = assessStream(stream);
    if (verdict.level === "no") return null;
    const adaptive = stream.url ? engineFor(stream.url) !== "native" : false;
    return (verdict.level === "ok" ? 0 : 2) + (adaptive ? 0 : 1);
  };
  return streams
    .map((stream, index) => ({ stream, index, rank: rank(stream) }))
    .filter((row): row is { stream: Stream; index: number; rank: number } => row.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.stream);
}

/** "Sports" and "sports" are one category in the chips. */
export const categoryKey = (genre: string): string => genre.trim().toLowerCase();
