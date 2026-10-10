import { activeProviders } from "../domain/registry";
import { resolutionOrdinal, type ContentType, type Stream } from "../domain/types";
import { downloadInfo, type DownloadInfo } from "../lib/download";

/** A source that can be saved as a file, with the link and file name to save it under. */
export interface DownloadOption {
  stream: Stream;
  download: DownloadInfo;
}

/**
 * The sources among [streams] that the browser can download (see downloadInfo), best first: ones that start at once before ones a debrid
 * service still has to fetch, then the sharpest, then the biggest file. The same file offered twice (the same link) is listed once.
 */
export function downloadOptions(streams: Stream[]): DownloadOption[] {
  const seen = new Set<string>();
  const options: DownloadOption[] = [];
  for (const stream of streams) {
    const download = downloadInfo(stream);
    if (!download || seen.has(download.url)) continue;
    seen.add(download.url);
    options.push({ stream, download });
  }
  const notCached = (s: Stream) => (s.debrid && !s.debrid.cached ? 1 : 0);
  return options.sort(
    (a, b) =>
      notCached(a.stream) - notCached(b.stream) ||
      resolutionOrdinal(a.stream.resolutionTier) - resolutionOrdinal(b.stream.resolutionTier) ||
      (b.stream.sizeBytes ?? -1) - (a.stream.sizeBytes ?? -1),
  );
}

/** Asks every installed addon for the sources of a movie or episode and keeps the downloadable ones. An addon that fails is skipped. */
export async function findDownloadOptions(type: ContentType, id: string, season: number | null, episode: number | null): Promise<DownloadOption[]> {
  const reports = await Promise.all(activeProviders().map((p) => p.getStreamReport(type, id, season, episode).catch(() => null)));
  return downloadOptions(reports.flatMap((r) => r?.streams ?? []));
}
