/** How viewings of the last 7 days went, as the backend's summary gives it (see its playbackOutcomeService). The panel shows the viewings count. */
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
