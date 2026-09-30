import type Hls from "hls.js";
import type { EngineKind } from "../../domain/playability";

/**
 * Browser media pipelines behind one interface (PlayerEngine.kt's ExoPlayer, replaced by what a browser has):
 *  · hls   — hls.js over Media Source Extensions (Safari uses its native HLS)
 *  · dash  — dash.js over MSE
 *  · native — the <video> element itself (MP4 / WebM / …)
 * Each reports quality / audio / subtitle tracks in the same shape the menus expect.
 */
export interface TrackOption {
  id: string;
  label: string;
  selected: boolean;
  height?: number;
  language?: string | null;
  isDefault?: boolean;
}
export interface EngineTracks {
  audio: TrackOption[];
  subtitles: TrackOption[];
  quality: TrackOption[];
}
export type PlaybackErrorType = "unsupported" | "network" | "cors" | "decode" | "mixed" | "unknown";
export interface PlaybackError {
  type: PlaybackErrorType;
  message: string;
  /** Copy-pasteable technical account for the "Technical details" section (never contains the link's path or query). */
  details?: string;
}
export interface EngineCallbacks {
  onTracks(tracks: EngineTracks): void;
  onError(error: PlaybackError): void;
}
export interface PlayerEngine {
  readonly kind: EngineKind;
  selectAudio(id: string): void;
  selectSubtitle(id: string | null): void;
  selectQuality(id: string): void;
  destroy(): void;
}

const LANGUAGE_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;
export function languageLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return LANGUAGE_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

const channelLabel = (channels?: number | string | null): string | null => {
  const n = Number(channels);
  if (!n) return null;
  return n === 1 ? "Mono" : n === 2 ? "Stereo" : n === 6 || n === 8 ? "5.1" : null;
};

export function mediaErrorToPlaybackError(error: MediaError | null): PlaybackError {
  switch (error?.code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return { type: "network", message: "The video couldn't be downloaded. The connection dropped, or the server refused the request." };
    case MediaError.MEDIA_ERR_DECODE:
      return { type: "decode", message: "Your browser couldn't decode this video (its codec or encoding isn't supported here). Try another source, or the MangoTV app." };
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return { type: "unsupported", message: "This source's format isn't supported by your browser (or the server blocks web playback). Try another source." };
    default:
      return { type: "unknown", message: error?.message || "The selected stream could not be played." };
  }
}

// ── native <video> ─────────────────────────────────────────────────────────────

function nativeTracks(video: HTMLVideoElement): EngineTracks {
  const audioList = (video as unknown as { audioTracks?: ArrayLike<{ id: string; label: string; language: string; enabled: boolean }> }).audioTracks;
  const audio: TrackOption[] = audioList ? Array.from(audioList).map((t, i) => ({ id: String(i), label: t.label || languageLabel(t.language) || `Track ${i + 1}`, selected: t.enabled, language: t.language })) : [];
  const subtitles: TrackOption[] = [];
  for (let i = 0; i < video.textTracks.length; i++) {
    const t = video.textTracks[i]!;
    if (t.kind !== "subtitles" && t.kind !== "captions") continue;
    subtitles.push({ id: String(i), label: t.label || languageLabel(t.language) || `Track ${i + 1}`, selected: t.mode === "showing", language: t.language });
  }
  return { audio, subtitles, quality: [] };
}

function createNativeEngine(video: HTMLVideoElement, url: string, cb: EngineCallbacks): PlayerEngine {
  const publish = () => cb.onTracks(nativeTracks(video));
  const onError = () => cb.onError(mediaErrorToPlaybackError(video.error));
  video.addEventListener("error", onError);
  video.addEventListener("loadedmetadata", publish);
  video.textTracks.addEventListener("addtrack", publish);
  video.src = url;
  video.load();
  return {
    kind: "native",
    selectAudio(id) {
      const list = (video as unknown as { audioTracks?: ArrayLike<{ enabled: boolean }> }).audioTracks;
      if (list) Array.from(list).forEach((t, i) => (t.enabled = String(i) === id));
      publish();
    },
    selectSubtitle(id) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i]!;
        if (t.kind === "subtitles" || t.kind === "captions") t.mode = String(i) === id ? "showing" : "disabled";
      }
      publish();
    },
    selectQuality() {},
    destroy() {
      video.removeEventListener("error", onError);
      video.removeEventListener("loadedmetadata", publish);
      video.textTracks.removeEventListener("addtrack", publish);
      video.removeAttribute("src");
      video.load();
    },
  };
}

// ── HLS ────────────────────────────────────────────────────────────────────────

async function createHlsEngine(video: HTMLVideoElement, url: string, cb: EngineCallbacks): Promise<PlayerEngine> {
  const { default: HlsCtor } = await import("hls.js");
  if (!HlsCtor.isSupported()) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) return createNativeEngine(video, url, cb); // Safari / iOS: native HLS
    cb.onError({ type: "unsupported", message: "This browser can't play HLS streams." });
    return { kind: "hls", selectAudio() {}, selectSubtitle() {}, selectQuality() {}, destroy() {} };
  }
  const hls: Hls = new HlsCtor({ enableWorker: true, maxBufferLength: 40, backBufferLength: 60 });
  let recoveredMedia = false;
  let retriedNetwork = 0;

  const publish = () => {
    cb.onTracks({
      quality: [
        { id: "auto", label: "Auto", selected: hls.autoLevelEnabled },
        ...hls.levels
          .map((level, index) => ({ id: String(index), label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`, selected: !hls.autoLevelEnabled && hls.currentLevel === index, height: level.height || 0 }))
          .sort((a, b) => b.height - a.height),
      ],
      audio: hls.audioTracks.map((t) => ({ id: String(t.id), label: t.name || languageLabel(t.lang) || `Track ${t.id + 1}`, selected: hls.audioTrack === t.id, language: t.lang ?? null, isDefault: t.default })),
      subtitles: hls.subtitleTracks.map((t) => ({ id: String(t.id), label: t.name || languageLabel(t.lang) || `Track ${t.id + 1}`, selected: hls.subtitleTrack === t.id, language: t.lang ?? null, isDefault: t.default || t.forced })),
    });
  };

  const { Events, ErrorTypes } = HlsCtor;
  hls.on(Events.MANIFEST_PARSED, publish);
  hls.on(Events.LEVEL_SWITCHED, publish);
  hls.on(Events.AUDIO_TRACKS_UPDATED, publish);
  hls.on(Events.AUDIO_TRACK_SWITCHED, publish);
  hls.on(Events.SUBTITLE_TRACKS_UPDATED, publish);
  hls.on(Events.SUBTITLE_TRACK_SWITCH, publish);
  hls.on(Events.ERROR, (_event, data) => {
    if (!data.fatal) return;
    if (data.type === ErrorTypes.NETWORK_ERROR) {
      const status = data.response?.code;
      // Manifest/segment requests that never get an HTTP status are almost always the browser blocking a cross-origin
      // response (CORS) — the same stream plays fine in an app because apps aren't subject to CORS.
      if (status === 0 || status === undefined) {
        if (retriedNetwork++ < 1) return void hls.startLoad();
        return cb.onError({ type: "cors", message: "This source's server doesn't allow playback from a web page (blocked by the browser's cross-origin rules), or it isn't reachable. It may work in the MangoTV app; try another source here." });
      }
      if (status === 401 || status === 403) return cb.onError({ type: "network", message: "The source's server refused access (HTTP " + status + "). The link may have expired." });
      if (status === 404) return cb.onError({ type: "network", message: "The source couldn't be found any more (HTTP 404)." });
      if (retriedNetwork++ < 2) return void hls.startLoad();
      return cb.onError({ type: "network", message: `The source's server returned an error (HTTP ${status}).` });
    }
    if (data.type === ErrorTypes.MEDIA_ERROR) {
      if (!recoveredMedia) {
        recoveredMedia = true;
        return void hls.recoverMediaError();
      }
      return cb.onError({ type: "decode", message: "Your browser couldn't decode this stream (unsupported codec). Try another source, or the MangoTV app." });
    }
    cb.onError({ type: "unknown", message: data.error?.message || "The selected stream could not be played." });
  });
  hls.subtitleDisplay = true;
  hls.attachMedia(video);
  hls.loadSource(url);

  return {
    kind: "hls",
    selectAudio(id) {
      hls.audioTrack = Number(id);
    },
    selectSubtitle(id) {
      hls.subtitleTrack = id === null ? -1 : Number(id);
      publish();
    },
    selectQuality(id) {
      hls.currentLevel = id === "auto" ? -1 : Number(id);
      publish();
    },
    destroy() {
      hls.destroy();
    },
  };
}

// ── DASH ───────────────────────────────────────────────────────────────────────

async function createDashEngine(video: HTMLVideoElement, url: string, cb: EngineCallbacks): Promise<PlayerEngine> {
  const dashjs = await import("dashjs");
  const player = dashjs.MediaPlayer().create();
  player.updateSettings({ streaming: { text: { defaultEnabled: false } } });
  let manualQuality: number | null = null;

  const publish = () => {
    try {
      const bitrates = player.getBitrateInfoListFor("video") ?? [];
      const audioTracks = player.getTracksFor("audio") ?? [];
      const currentAudio = player.getCurrentTrackFor("audio");
      const textTracks = player.getTracksFor("text") ?? [];
      const textIndex = player.getCurrentTextTrackIndex?.() ?? -1;
      cb.onTracks({
        quality: [
          { id: "auto", label: "Auto", selected: manualQuality === null },
          ...bitrates.map((b) => ({ id: String(b.qualityIndex), label: b.height ? `${b.height}p` : `${Math.round(b.bitrate / 1000)} kbps`, selected: manualQuality === b.qualityIndex, height: b.height ?? 0 })).sort((a, b) => b.height - a.height),
        ],
        audio: audioTracks.map((t, i) => ({ id: String(i), label: t.labels?.[0]?.text || languageLabel(t.lang) || `Track ${i + 1}${channelLabel(t.audioChannelConfiguration?.[0]) ? ` — ${channelLabel(t.audioChannelConfiguration?.[0])}` : ""}`, selected: currentAudio?.index === t.index && currentAudio?.id === t.id, language: t.lang ?? null })),
        subtitles: textTracks.map((t, i) => ({ id: String(i), label: t.labels?.[0]?.text || languageLabel(t.lang) || `Track ${i + 1}`, selected: textIndex === i, language: t.lang ?? null })),
      });
    } catch {
      /* the menus simply stay empty */
    }
  };
  const { MediaPlayer } = dashjs;
  player.on(MediaPlayer.events.STREAM_INITIALIZED, publish);
  player.on(MediaPlayer.events.TEXT_TRACKS_ADDED, publish);
  player.on(MediaPlayer.events.QUALITY_CHANGE_RENDERED, publish);
  player.on(MediaPlayer.events.ERROR, (event: unknown) => {
    const error = (event as { error?: { code?: number; message?: string } }).error;
    const code = error?.code ?? 0;
    // 25–34: manifest/content download problems; 10–13: MSE / codec problems (dash.js ErrorsBase)
    if (code >= 25 && code <= 34) cb.onError({ type: "cors", message: "This source's server doesn't allow playback from a web page, or isn't reachable. It may work in the MangoTV app; try another source here." });
    else if (code >= 10 && code <= 24) cb.onError({ type: "decode", message: "Your browser couldn't decode this stream (unsupported codec or protection). Try another source, or the MangoTV app." });
    else cb.onError({ type: "unknown", message: error?.message || "The selected stream could not be played." });
  });
  player.initialize(video, url, false);

  return {
    kind: "dash",
    selectAudio(id) {
      const track = (player.getTracksFor("audio") ?? [])[Number(id)];
      if (track) player.setCurrentTrack(track);
      publish();
    },
    selectSubtitle(id) {
      if (id === null) player.enableText(false);
      else {
        player.enableText(true);
        player.setTextTrack(Number(id));
      }
      publish();
    },
    selectQuality(id) {
      if (id === "auto") {
        manualQuality = null;
        player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
      } else {
        manualQuality = Number(id);
        player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
        player.setQualityFor("video", manualQuality);
      }
      publish();
    },
    destroy() {
      player.destroy();
    },
  };
}

export async function createEngine(kind: EngineKind, video: HTMLVideoElement, url: string, cb: EngineCallbacks): Promise<PlayerEngine> {
  if (kind === "hls") return createHlsEngine(video, url, cb);
  if (kind === "dash") return createDashEngine(video, url, cb);
  return createNativeEngine(video, url, cb);
}

/** Picks the initially selected subtitle track from the account's defaults (PlayerEngine.buildExoPlayer). */
export function pickDefaultSubtitle(tracks: TrackOption[], prefs: { subtitlesEnabled: boolean; defaultSubtitleLanguage: string | null }): string | null {
  if (!prefs.subtitlesEnabled || tracks.length === 0) return null;
  if (prefs.defaultSubtitleLanguage) {
    const wanted = prefs.defaultSubtitleLanguage.toLowerCase();
    const match = tracks.find((t) => (t.language ?? "").toLowerCase().startsWith(wanted));
    if (match) return match.id;
    return null;
  }
  return tracks.find((t) => t.isDefault)?.id ?? null;
}
