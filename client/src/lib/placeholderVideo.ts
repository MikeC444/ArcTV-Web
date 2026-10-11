/** A "video" shorter than this, for a title that runs much longer, is not the title. */
export const PLACEHOLDER_MAX_SECONDS = 120;

export const PLACEHOLDER_MESSAGE =
  "This source isn't ready yet. Its debrid service may still be preparing the file. Try again in a few minutes, or choose another source.";

/**
 * Whether a source that turned out to be [durationSeconds] long is really a placeholder: debrid addons (AIOStreams on ElfHosted, for one)
 * answer a title that isn't cached yet with a short video that says "Not ready yet", which plays like any other video. A film or episode
 * with a known runtime of at least 10 minutes that comes back as under two minutes, and under a tenth of that runtime, is such a slate.
 * Without a known runtime nothing is assumed, so a genuinely short film is never turned away.
 */
export function isPlaceholderVideo(durationSeconds: number, runtimeMinutes: number | null | undefined): boolean {
  if (runtimeMinutes == null || runtimeMinutes < 10 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;
  return durationSeconds < PLACEHOLDER_MAX_SECONDS && durationSeconds < (runtimeMinutes * 60) / 10;
}
