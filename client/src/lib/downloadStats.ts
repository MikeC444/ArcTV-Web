/** The developer panel's Downloads card: web Download use in the last 7 days (see the backend's downloadEventService). */
export interface DownloadQuality {
  label: string;
  files: number;
}

export interface DownloadSummary {
  /** People who opened the Downloads panel or were shown the Plus popup. */
  triedPeople: number;
  /** People who opened the panel (they have Plus). */
  openedPeople: number;
  /** People who pressed a file: the most the web app can know, since the browser does the download. */
  startedPeople: number;
  /** People without Plus who were shown the Plus popup. */
  popupPeople: number;
  popups: number;
  opens: number;
  files: number;
  episodeFiles: number;
  uncachedFiles: number;
  byQuality: DownloadQuality[];
}

/** Whole-number percent, 0 when there is nothing to divide by. */
export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
