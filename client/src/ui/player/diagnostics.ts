import { parseStreamFacts, type DeviceVerdict } from "../../domain/deviceSupport";
import type { Stream } from "../../domain/types";

/**
 * A short, copy-pasteable account of what the browser's video element was doing when playback failed — the events it
 * fired, its network/ready state and its error — plus what we detected about the source. It deliberately contains only the
 * server's host name and the file extension: never the path or query of the link, which can carry an account key.
 */

const NETWORK_STATES = ["EMPTY", "IDLE", "LOADING", "NO_SOURCE"];
const READY_STATES = ["HAVE_NOTHING", "HAVE_METADATA", "HAVE_CURRENT_DATA", "HAVE_FUTURE_DATA", "HAVE_ENOUGH_DATA"];
const ERROR_CODES: Record<number, string> = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };

export interface TrailEntry {
  at: number; // ms since the source was requested
  name: string;
}

export interface VideoSnapshot {
  networkState: number;
  readyState: number;
  error: { code: number; message: string } | null;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  paused: boolean;
  buffered: Array<[number, number]>;
}

export const EVENTS_WORTH_KEEPING = ["loadstart", "durationchange", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "stalled", "suspend", "abort", "emptied", "error", "seeking", "seeked", "ended"] as const;

export function snapshotVideo(video: HTMLVideoElement): VideoSnapshot {
  const buffered: Array<[number, number]> = [];
  for (let i = 0; i < video.buffered.length && i < 4; i++) buffered.push([video.buffered.start(i), video.buffered.end(i)]);
  return {
    networkState: video.networkState,
    readyState: video.readyState,
    error: video.error ? { code: video.error.code, message: video.error.message } : null,
    duration: video.duration,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    paused: video.paused,
    buffered,
  };
}

/** Host and file extension only. */
export function safeSourceLabel(url: string | null | undefined): { host: string; ext: string } {
  try {
    const parsed = new URL(url ?? "");
    const ext = /\.([a-z0-9]{2,5})$/i.exec(parsed.pathname)?.[1]?.toLowerCase() ?? "none";
    return { host: parsed.host, ext };
  } catch {
    return { host: "unknown", ext: "none" };
  }
}

export function describeDiagnostics(input: { stream: Stream; snapshot: VideoSnapshot | null; engine: string; trail: TrailEntry[]; verdict: DeviceVerdict; browser: string; userAgent: string }): string {
  const { stream, snapshot, engine, trail, verdict, browser, userAgent } = input;
  const { host, ext } = safeSourceLabel(stream.url);
  const facts = parseStreamFacts(stream);
  const lines = [
    "MangoTV player diagnostics",
    `Browser: ${browser} (${/(Chrome|Edg|Firefox|Version)\/[\d.]+/.exec(userAgent)?.[0] ?? "unknown version"})`,
    `Source: server ${host}, file type .${ext}, engine ${engine}`,
    `Detected: container ${facts.container ?? "?"}, video ${facts.video ?? "?"}${facts.tenBit ? " 10-bit" : ""}, audio ${facts.audio.join("+") || "?"}`,
    `This device: ${verdict.label}${verdict.detail ? ` (${verdict.detail})` : ""}`,
  ];
  if (snapshot) {
    lines.push(
      `Video element: network ${NETWORK_STATES[snapshot.networkState] ?? snapshot.networkState}, ready ${READY_STATES[snapshot.readyState] ?? snapshot.readyState}, ` +
        `${snapshot.paused ? "paused" : "not paused"}, duration ${Number.isFinite(snapshot.duration) ? `${Math.round(snapshot.duration)}s` : String(snapshot.duration)}, picture ${snapshot.videoWidth}×${snapshot.videoHeight}`,
      `Buffered: ${snapshot.buffered.length ? snapshot.buffered.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}s`).join(", ") : "nothing"}`,
      `Media error: ${snapshot.error ? `${ERROR_CODES[snapshot.error.code] ?? snapshot.error.code}${snapshot.error.message ? ` — ${snapshot.error.message.slice(0, 160)}` : ""}` : "none reported"}`,
    );
  }
  lines.push(`Events: ${trail.length ? trail.slice(-24).map((e) => `+${e.at}ms ${e.name}`).join(", ") : "none — the browser never reported anything for this source"}`);
  return lines.join("\n");
}
