/** The developer panel's playback health: how viewings of the last 7 days ended (see the backend's playbackOutcomeService). */
export interface PlaybackGroup {
  label: string;
  plays: number;
  short: number;
  errors: number;
  neverStarted: number;
}

export interface PlaybackSummary {
  plays7d: number;
  users7d: number;
  short7d: number;
  errors7d: number;
  neverStarted7d: number;
  /** Median milliseconds from pressing Play to the first picture (only viewings that started); null with none. */
  medianStartMs: number | null;
  /** Viewings that were not the first source opened for that title. */
  multiSource7d: number;
  byDevice: PlaybackGroup[];
  byEngine: PlaybackGroup[];
  byResolution: PlaybackGroup[];
}

/** Viewings that ended badly: left within seconds, a player error, or nothing ever appeared. */
export const leftEarly = (g: Pick<PlaybackGroup, "short" | "errors" | "neverStarted">): number => g.short + g.errors + g.neverStarted;

/** Whole-number percent, 0 when there is nothing to divide by. */
export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "2.4 s", "850 ms" or "—". */
export function formatStart(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Player names as people know them. */
export const engineName = (engine: string): string => (engine === "vlc" ? "VLC" : engine === "builtin" ? "Built-in player" : engine);

/** A group worth a second look: enough viewings to mean something, and clearly more early exits than the overall rate. */
export function standsOut(group: PlaybackGroup, overall: PlaybackSummary): boolean {
  const rate = percent(leftEarly(group), group.plays);
  const base = percent(overall.short7d + overall.errors7d + overall.neverStarted7d, overall.plays7d);
  return group.plays >= 10 && rate >= base + 15;
}
