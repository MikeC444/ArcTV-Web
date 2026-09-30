import type { ContentType } from "../domain/types";
import { COMPLETION_THRESHOLD, MIN_REPORTABLE_POSITION_MS } from "./continueWatching";

/** PlayerViewModel.reportProgress rules, isolated so they can be unit-tested. */
export interface ProgressDecision {
  report: boolean;
  /** movies past 85 % also become "watched" and drop out of Continue Watching */
  markWatched: boolean;
  rememberSource: boolean;
}

export function decideProgress(type: ContentType, positionMs: number, durationMs: number, completed: boolean): ProgressDecision {
  if (!(durationMs > 0)) return { report: false, markWatched: false, rememberSource: false };
  if (!completed && positionMs < MIN_REPORTABLE_POSITION_MS) return { report: false, markWatched: false, rememberSource: false };
  const crossed = type === "MOVIE" && positionMs / durationMs > COMPLETION_THRESHOLD;
  return { report: true, markWatched: type === "MOVIE" && (completed || crossed), rememberSource: !completed };
}

/** Accelerating hold-to-seek (PlayerScreen.beginOrContinueHoldSeek): 10 s steps, then 30 s, then 60 s, capped at ±2 min. */
export function nextHoldSeekDelta(pendingMs: number, direction: 1 | -1, isFreshPress: boolean): number {
  if (isFreshPress) return 10_000 * direction;
  const magnitude = Math.abs(pendingMs);
  const step = magnitude < 30_000 ? 10_000 : magnitude < 90_000 ? 30_000 : 60_000;
  return Math.min(120_000, Math.max(-120_000, pendingMs + step * direction));
}

export function nextEpisodeAfter(seasons: Array<{ seasonNumber: number; episodes: Array<{ episodeNumber: number; title: string }> }>, season: number | null, episode: number | null): { season: number; episode: number; title: string } | null {
  if (season == null || episode == null) return null;
  const s = seasons.findIndex((x) => x.seasonNumber === season);
  if (s < 0) return null;
  const eps = seasons[s]!.episodes;
  const e = eps.findIndex((x) => x.episodeNumber === episode);
  if (e < 0) return null;
  const nextInSeason = eps[e + 1];
  if (nextInSeason) return { season, episode: nextInSeason.episodeNumber, title: nextInSeason.title };
  const nextSeason = seasons[s + 1]?.episodes[0];
  return nextSeason ? { season: seasons[s + 1]!.seasonNumber, episode: nextSeason.episodeNumber, title: nextSeason.title } : null;
}
