import type { Stream } from "../domain/types";

/** What kind of release a download is, in plain words ("UHD Blu-ray REMUX", "4K WEB-DL", "Blu-ray"), worked out from the release's name. */
export function sourceLabel(stream: Pick<Stream, "releaseTitle" | "resolutionTier" | "sourceTag" | "qualityBadge">): string {
  const text = `${stream.releaseTitle} ${stream.sourceTag ?? ""}`;
  const uhd = stream.resolutionTier === "UHD_4K";
  if (/remux/i.test(text)) return `${uhd ? "UHD " : ""}Blu-ray REMUX`;
  if (/blu-?ray|bdrip|brrip|\bbd(?:25|50)?\b/i.test(text)) return `${uhd ? "UHD " : ""}Blu-ray`;
  if (/web-?dl|web-?rip|\bweb\b/i.test(text)) return `${uhd ? "4K " : ""}WEB-DL`;
  if (/hdtv/i.test(text)) return "HDTV";
  if (/dvd/i.test(text)) return "DVD";
  if (/\b(?:cam|hdcam|ts|hdts|telesync)\b/i.test(text)) return "Camera recording";
  return stream.qualityBadge;
}

/** "Dolby Vision" or "HDR" when the release's name says so, else null. */
export function hdrLabel(stream: Pick<Stream, "releaseTitle" | "descriptor">): string | null {
  const text = `${stream.releaseTitle} ${stream.descriptor ?? ""}`;
  if (/dolby[ ._-]?vision|\bdovi\b|\bDV\b/i.test(text)) return "Dolby Vision";
  if (/\bhdr(?:10\+?)?\b/i.test(text)) return "HDR";
  return null;
}
