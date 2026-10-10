import { activeProviders } from "../domain/registry";
import { resolutionOrdinal, type ContentType, type Stream } from "../domain/types";
import { downloadInfo, type DownloadInfo } from "../lib/download";

/** A source that can be saved as a file, with the link and file name to save it under. */
export interface DownloadOption {
  stream: Stream;
  download: DownloadInfo;
}

/** A camera or telesync recording: tiny and poor, so it would otherwise win "smallest file" within its resolution. */
const isRecording = (s: Stream): boolean => /^(cam|hdcam|ts|hdts|telesync)$/i.test(s.sourceTag ?? "");

/**
 * The sources among [streams] that the browser can download (see downloadInfo), in the order the panel shows them, with no sort control:
 * the highest quality first and, within the same quality, the smallest file first (a file with no size listed comes last in its group).
 * Two things sit above quality: ones a debrid service has already stored come before ones it still has to fetch (those can take minutes to
 * start), and camera recordings go to the bottom. The same file offered twice (the same link) is listed once.
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
  const size = (s: Stream) => s.sizeBytes ?? Number.POSITIVE_INFINITY;
  return options.sort(
    (a, b) =>
      notCached(a.stream) - notCached(b.stream) ||
      Number(isRecording(a.stream)) - Number(isRecording(b.stream)) ||
      resolutionOrdinal(a.stream.resolutionTier) - resolutionOrdinal(b.stream.resolutionTier) ||
      (size(a.stream) === size(b.stream) ? 0 : size(a.stream) < size(b.stream) ? -1 : 1),
  );
}

/** Asks every installed addon for the sources of a movie or episode and keeps the downloadable ones. An addon that fails is skipped. */
export async function findDownloadOptions(type: ContentType, id: string, season: number | null, episode: number | null): Promise<DownloadOption[]> {
  const reports = await Promise.all(activeProviders().map((p) => p.getStreamReport(type, id, season, episode).catch(() => null)));
  return downloadOptions(reports.flatMap((r) => r?.streams ?? []));
}
