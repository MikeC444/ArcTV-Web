import { assessStream } from "./playability";
import type { Stream } from "./types";

/**
 * "Can THIS browser play THIS source?" — answered before you press play.
 *
 * Two halves: what the browser can decode (asked of the browser itself, not guessed from its name) and what the
 * source contains (read from the release name and the link, e.g. "Movie.2024.2160p.BluRay.x265.DDP5.1.Atmos.mkv").
 * The second half is a best-effort reading of text, so a verdict is a strong hint rather than a guarantee, and the
 * wording says so ("Should play", never "Will play").
 */

export type ContainerKind = "mp4" | "webm" | "mkv" | "hls" | "dash" | "avi" | "ts" | "wmv" | "flv";
export type VideoCodec = "h264" | "hevc" | "av1" | "vp9" | "xvid";
export type AudioCodec = "aac" | "ac3" | "eac3" | "dts" | "truehd" | "opus" | "flac" | "mp3";

export interface DeviceCaps {
  /** Friendly name for messages: "Chrome", "Edge", "Firefox", "Safari" or "This browser". */
  browser: string;
  containers: Record<ContainerKind, boolean>;
  video: Record<VideoCodec, boolean>;
  audio: Record<AudioCodec, boolean>;
}

export const CONTAINER_NAMES: Record<ContainerKind, string> = { mp4: "MP4", webm: "WebM", mkv: "MKV", hls: "HLS streams", dash: "DASH streams", avi: "AVI", ts: "TS", wmv: "WMV", flv: "FLV" };
export const VIDEO_NAMES: Record<VideoCodec, string> = { h264: "H.264", hevc: "HEVC (x265)", av1: "AV1", vp9: "VP9", xvid: "XviD / DivX" };
export const AUDIO_NAMES: Record<AudioCodec, string> = { aac: "AAC", ac3: "Dolby Digital", eac3: "Dolby Digital Plus", dts: "DTS", truehd: "Dolby TrueHD", opus: "Opus", flac: "FLAC", mp3: "MP3" };

// ── what the browser can do ─────────────────────────────────────────────────

export interface CapsEnvironment {
  canPlayType(type: string): string;
  hasMediaSource: boolean;
  userAgent: string;
}

export function browserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Firefox\/|FxiOS\//.test(userAgent)) return "Firefox";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/Chrome\/|CriOS\/|Chromium\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "This browser";
}

/** True for the Chromium engine (Chrome, Edge, Opera, Brave …) but not for iOS browsers, which all use WebKit. */
const isChromiumEngine = (userAgent: string) => /Chrome\/|Chromium\/|Edg\//.test(userAgent) && !/CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent);

export function detectDeviceCaps(env: CapsEnvironment): DeviceCaps {
  const can = (...types: string[]) => types.some((type) => {
    try {
      return env.canPlayType(type) !== "";
    } catch {
      return false;
    }
  });
  const chromium = isChromiumEngine(env.userAgent);
  return {
    browser: browserName(env.userAgent),
    containers: {
      mp4: can('video/mp4; codecs="avc1.42E01E"', "video/mp4"),
      webm: can("video/webm"),
      // Chromium plays Matroska (H.264/VP9/AV1 + AAC/Opus/…); Firefox and Safari don't open it at all.
      mkv: can("video/x-matroska", "video/mkv") || chromium,
      hls: can("application/vnd.apple.mpegurl", "application/x-mpegURL") || env.hasMediaSource, // native (Safari) or through hls.js
      dash: env.hasMediaSource, // dash.js
      avi: can("video/x-msvideo", "video/avi"),
      ts: can("video/mp2t"),
      wmv: can("video/x-ms-wmv"),
      flv: can("video/x-flv"),
    },
    video: {
      h264: can('video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="avc1.42E01E"'),
      hevc: can('video/mp4; codecs="hvc1.1.6.L93.B0"', 'video/mp4; codecs="hev1.1.6.L93.B0"'),
      av1: can('video/mp4; codecs="av01.0.08M.08"', 'video/webm; codecs="av01.0.08M.08"'),
      vp9: can('video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"'),
      xvid: false,
    },
    audio: {
      aac: can('audio/mp4; codecs="mp4a.40.2"'),
      ac3: can('audio/mp4; codecs="ac-3"'),
      eac3: can('audio/mp4; codecs="ec-3"'),
      dts: can('audio/mp4; codecs="dtsc"', 'audio/mp4; codecs="dtse"'),
      truehd: can('audio/mp4; codecs="mlpa"'),
      opus: can('audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"'),
      flac: can("audio/flac", 'audio/mp4; codecs="flac"'),
      mp3: can("audio/mpeg", 'audio/mp4; codecs="mp3"'),
    },
  };
}

let cached: DeviceCaps | null = null;
/** Capabilities of the browser we are running in (asked once). */
export function getDeviceCaps(): DeviceCaps {
  if (cached) return cached;
  const video = typeof document !== "undefined" ? document.createElement("video") : null;
  cached = detectDeviceCaps({
    canPlayType: (type) => video?.canPlayType?.(type) ?? "",
    hasMediaSource: typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  });
  return cached;
}

// ── what the source contains ────────────────────────────────────────────────

export interface StreamFacts {
  container: ContainerKind | null;
  video: VideoCodec | null;
  /** 10-bit H.264 ("Hi10P") is not decodable by any mainstream browser. */
  tenBit: boolean;
  audio: AudioCodec[];
}

const EXTENSIONS: Record<string, ContainerKind> = { mkv: "mkv", mp4: "mp4", m4v: "mp4", mov: "mp4", webm: "webm", avi: "avi", wmv: "wmv", flv: "flv", ts: "ts", m2ts: "ts", m3u8: "hls", mpd: "dash" };

const containerOf = (stream: Pick<Stream, "url" | "descriptor" | "releaseTitle">): ContainerKind | null => {
  const path = (stream.url ?? "").split(/[?#]/)[0]!.toLowerCase();
  const fromUrl = /\.([a-z0-9]{2,4})$/.exec(path)?.[1];
  if (fromUrl && EXTENSIONS[fromUrl]) return EXTENSIONS[fromUrl]!;
  if (/\/hls\b|master\.m3u8/.test(path)) return "hls";
  const text = `${stream.descriptor ?? ""} ${stream.releaseTitle}`;
  const fromText = /\.(mkv|mp4|m4v|webm|avi|wmv|flv|m2ts)\b/i.exec(text)?.[1]?.toLowerCase();
  return fromText ? (EXTENSIONS[fromText] ?? null) : null;
};

// Tokens in release names are separated by dots, dashes and spaces; a letter on either side means it is part of a longer word.
const T = "(?<![A-Za-z])";
const E = "(?![A-Za-z])";
const AUDIO_PATTERNS: Array<[AudioCodec, RegExp]> = [
  ["eac3", new RegExp(`${T}(?:DDP|DD\\+|E-?AC-?3)(?:[ .\\-]?\\d(?:\\.\\d)?)?${E}`, "i")],
  ["ac3", new RegExp(`${T}(?:DD|AC-?3|Dolby[ .]?Digital)(?:[ .\\-]?\\d(?:\\.\\d)?)?${E}`, "i")],
  ["truehd", /True[ .-]?HD/i],
  ["dts", new RegExp(`${T}DTS`, "i")],
  ["aac", new RegExp(`${T}AAC`, "i")],
  ["opus", new RegExp(`${T}Opus${E}`, "i")],
  ["flac", new RegExp(`${T}FLAC${E}`, "i")],
  ["mp3", new RegExp(`${T}MP3${E}`, "i")],
];

export function parseStreamFacts(stream: Pick<Stream, "url" | "descriptor" | "releaseTitle" | "codec" | "audioTag">): StreamFacts {
  const text = [stream.descriptor ?? "", stream.releaseTitle, stream.codec ?? "", stream.audioTag ?? ""].join("\n");
  const has = (pattern: RegExp) => pattern.test(text);

  let video: VideoCodec | null = null;
  if (has(/x265|HEVC|H\.?265/i)) video = "hevc";
  else if (has(/x264|H\.?264|\bAVC\b/i)) video = "h264";
  else if (has(new RegExp(`${T}AV1${E}`, "i"))) video = "av1";
  else if (has(new RegExp(`${T}VP9${E}`, "i"))) video = "vp9";
  else if (has(/XviD|DivX/i)) video = "xvid";

  const audio = AUDIO_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([codec]) => codec);
  if (audio.length === 0 && /Atmos/i.test(text)) audio.push("eac3"); // streaming-service Atmos is carried in Dolby Digital Plus

  return { container: containerOf(stream), video, tenBit: has(/10[ .-]?bit|Hi10P?/i), audio };
}

// ── the verdict ─────────────────────────────────────────────────────────────

export type DeviceLevel = "yes" | "unknown" | "audio" | "no";

export interface DeviceVerdict {
  level: DeviceLevel;
  /** Short badge text. */
  label: string;
  /** A few words on why, for the row ("HEVC (x265) video isn't supported"). */
  detail: string;
  /** A full sentence for tooltips and for the player's error message. */
  reason: string;
}

const KIND_DETAIL = { torrent: "Torrent source", youtube: "YouTube-only source", headers: "Needs special headers", insecure: "Insecure http link", external: "External link", unknown: "No playable link" } as const;

export function deviceVerdict(stream: Stream, caps: DeviceCaps = getDeviceCaps(), pageProtocol?: string): DeviceVerdict {
  const kind = assessStream(stream, pageProtocol);
  if (kind.level === "no") return { level: "no", label: "Can't play here", detail: KIND_DETAIL[kind.kind], reason: kind.reason };

  const facts = parseStreamFacts(stream);
  const who = caps.browser;

  if (facts.container && !caps.containers[facts.container]) {
    const name = CONTAINER_NAMES[facts.container];
    const streamKind = facts.container === "hls" || facts.container === "dash";
    return { level: "no", label: "Can't play here", detail: `${name} not supported`, reason: streamKind ? `${who} on this device can't play ${name}. Try another source.` : `${who} on this device can't open ${name} files. Try a source that is an MP4 or WebM file.` };
  }
  if (facts.video && !caps.video[facts.video]) {
    const name = VIDEO_NAMES[facts.video];
    return { level: "no", label: "Can't play here", detail: `${name} video not supported`, reason: `This source uses ${name} video, which ${who} on this device can't decode. Try an H.264 source, or the MangoTV app.` };
  }
  if (facts.video === "h264" && facts.tenBit) {
    return { level: "no", label: "Can't play here", detail: "10-bit H.264 not supported", reason: "This source uses 10-bit H.264 video, which browsers can't decode. Try another source." };
  }
  if (facts.audio.length > 0 && !facts.audio.some((codec) => caps.audio[codec])) {
    const names = facts.audio.map((codec) => AUDIO_NAMES[codec]).join(" / ");
    return { level: "audio", label: "No sound here", detail: `${names} audio not supported`, reason: `The picture should play, but its audio (${names}) isn't supported by ${who} on this device, so there will probably be no sound. Try a source with AAC audio.` };
  }
  if (stream.notWebReady) return { level: "unknown", label: "Might not play", detail: "Addon says not web-ready", reason: "The addon marks this source as not ready for web players; it may not play in a browser." };

  const known = facts.container !== null || facts.video !== null || facts.audio.length > 0;
  return known
    ? { level: "yes", label: "Should play here", detail: "", reason: "Its format is one this browser can play." }
    : { level: "unknown", label: "Format unknown", detail: "May play", reason: "The source doesn't say what format it is, so it's worth a try." };
}

/** Lower plays first: sources this device can play, then unknowns, then picture-only, then the ones it can't. */
export const DEVICE_RANK: Record<DeviceLevel, number> = { yes: 0, unknown: 1, audio: 2, no: 3 };

/** A one-line list of what this browser supports, for the "This device" panel. */
export function describeCaps(caps: DeviceCaps): Array<{ label: string; supported: boolean }> {
  return [
    { label: "MP4", supported: caps.containers.mp4 },
    { label: "MKV", supported: caps.containers.mkv },
    { label: "HLS", supported: caps.containers.hls },
    { label: "H.264", supported: caps.video.h264 },
    { label: "HEVC (x265)", supported: caps.video.hevc },
    { label: "AV1", supported: caps.video.av1 },
    { label: "VP9", supported: caps.video.vp9 },
    { label: "AAC", supported: caps.audio.aac },
    { label: "Dolby Digital", supported: caps.audio.ac3 },
    { label: "Dolby Digital Plus", supported: caps.audio.eac3 },
    { label: "DTS", supported: caps.audio.dts },
  ];
}
