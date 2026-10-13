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

/** What the Downloads view's detail endpoint returns (GET /admin/downloads): the last 7 days, per day, per person and the latest events. */
export type DownloadKind = "popup" | "opened" | "file";
export interface DownloadDay {
  date: string;
  popups: number;
  opens: number;
  files: number;
}
export interface DownloadPerson {
  userId: string;
  email: string;
  displayName: string | null;
  plan: string | null;
  popups: number;
  opens: number;
  files: number;
  episodeFiles: number;
  lastAt: string;
  lastKind: DownloadKind;
  topQuality: string | null;
}
export interface DownloadRecent {
  kind: DownloadKind;
  contentType: "MOVIE" | "TV_SHOW";
  episode: boolean;
  resolution: string | null;
  cached: boolean | null;
  at: string;
  userId: string;
  email: string;
  displayName: string | null;
}
export interface DownloadDetail {
  days: DownloadDay[];
  byType: Array<{ type: "MOVIE" | "TV_SHOW"; popups: number; opens: number; files: number }>;
  cached: { cached: number; uncached: number; unknown: number };
  people: DownloadPerson[];
  recent: DownloadRecent[];
}

/** How far a person got: pressed a file, only opened the list, or was stopped by the Plus popup. */
export type DownloadStatus = "downloaded" | "opened" | "blocked";
export const personStatus = (p: Pick<DownloadPerson, "files" | "opens">): DownloadStatus => (p.files > 0 ? "downloaded" : p.opens > 0 ? "opened" : "blocked");

export const STATUS_LABEL: Record<DownloadStatus, string> = { downloaded: "Pressed a file", opened: "Opened the list only", blocked: "Stopped by the Plus popup" };

/** One event in plain words: "Pressed a 4K file for an episode (not cached)", "Opened the file list for a movie", "Saw the Plus popup for a show". */
export function describeEvent(e: Pick<DownloadRecent, "kind" | "contentType" | "episode" | "resolution" | "cached">): string {
  const what = e.contentType === "MOVIE" ? "a movie" : e.episode ? "an episode" : "a show";
  if (e.kind === "popup") return `Saw the Plus popup for ${what}`;
  if (e.kind === "opened") return `Opened the file list for ${what}`;
  const quality = e.resolution ? `${e.resolution} ` : "";
  const cache = e.cached === true ? " (cached)" : e.cached === false ? " (not cached)" : "";
  return `Pressed a ${quality}file for ${what}${cache}`;
}
