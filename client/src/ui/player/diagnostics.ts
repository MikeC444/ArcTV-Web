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

export const EVENTS_WORTH_KEEPING = ["loadstart", "progress", "durationchange", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "waiting", "stalled", "suspend", "abort", "emptied", "error", "seeking", "seeked", "ended"] as const;

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

/**
 * "Test connection": asks the source's server the same two questions a browser tab and the video player ask, and says how long
 * each took to answer. Responses are opaque (the server's status can't be read across sites) — the point is whether, and how
 * fast, the server answers at all. Nothing but timing is reported, and the link itself is never shown.
 */
export async function probeSource(url: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number; onLine?: (line: string) => void } = {}): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? (() => performance.now());

  const run = async (label: string, headers: Record<string, string>): Promise<string> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const started = now();
    try {
      await doFetch(url, { method: "GET", headers, mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "follow", signal: controller.signal });
      const ms = Math.round(now() - started);
      controller.abort(); // only the answer mattered, not the video — stop the download
      return `${label}: the server answered after ${ms} ms`;
    } catch (error) {
      if (timedOut) return `${label}: no answer within ${Math.round(timeoutMs / 1000)} s`;
      return `${label}: failed after ${Math.round(now() - started)} ms (${error instanceof Error ? error.message : "network error"})`;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Reads the server's actual answer — possible only when the server (and any redirect target) lets web pages read it. */
  const inspect = async (): Promise<string> => {
    const label = "Reading the answer (only possible if the server allows it)";
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const started = now();
    try {
      const response = await doFetch(url, { method: "GET", headers: { Range: "bytes=0-65535" }, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "follow", signal: controller.signal });
      const headersAfter = Math.round(now() - started);
      const header = (name: string) => response.headers.get(name);
      const facts = [
        `HTTP ${response.status}`,
        `type ${header("content-type") ?? "none"}`,
        `length ${header("content-length") ?? "unknown"}`,
        `ranges ${header("accept-ranges") ?? "not advertised"}`,
        header("content-range") ? `content-range ${header("content-range")}` : null,
        header("content-disposition") ? "sent as attachment" : null,
        response.redirected ? "redirected" : null,
      ].filter(Boolean);
      let bytes = 0;
      const readStarted = now();
      const reader = response.body?.getReader();
      while (reader && bytes < 65_536) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
      }
      const bodyMs = Math.round(now() - readStarted);
      controller.abort();
      return `${label}: ${facts.join(", ")}; headers after ${headersAfter} ms, then ${bytes} bytes in ${bodyMs} ms`;
    } catch (error) {
      if (timedOut) return `${label}: no answer within ${Math.round(timeoutMs / 1000)} s`;
      if (error instanceof TypeError) return `${label}: not possible — the server doesn't let web pages read its answer (normal for video hosts; it doesn't stop the video player from using it)`;
      return `${label}: failed (${error instanceof Error ? error.message : "network error"})`;
    } finally {
      clearTimeout(timer);
    }
  };

  const lines: string[] = [];
  const steps: Array<() => Promise<string>> = [() => run("Plain GET (what opening the link in a tab does)", {}), () => run("Range GET bytes=0-1 (what the video player does)", { Range: "bytes=0-1" }), inspect];
  for (const step of steps) {
    const line = await step();
    lines.push(line);
    options.onLine?.(line); // show each answer as soon as it is known
  }
  return lines;
}
