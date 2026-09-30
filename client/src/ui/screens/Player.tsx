import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MdArrowBack, MdFastForward, MdForward10, MdFullscreen, MdFullscreenExit, MdGraphicEq, MdHighQuality, MdPause, MdPlayArrow, MdReplay10, MdSettings, MdSkipNext, MdSubtitles, MdSwapHoriz, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { useNavigate, useParams } from "react-router-dom";
import { DEBRID_NAMES, deviceVerdict, getDeviceCaps } from "../../domain/deviceSupport";
import { buildRelayUrl, needsRelay, playbackUrl } from "../../domain/relay";
import { assessStream, engineFor } from "../../domain/playability";
import { activeProviders } from "../../domain/registry";
import type { Content, ContentType, Episode, Stream } from "../../domain/types";
import { formatTimestamp } from "../../lib/format";
import { parseOptionalInt, routes } from "../../lib/routes";
import { playSound } from "../../lib/sounds";
import { useAuth } from "../../state/auth";
import { useAddonsReady } from "../../state/hooks";
import { useContinueWatching } from "../../state/continueWatching";
import { setLastStreamId } from "../../state/lastSource";
import { useMyList } from "../../state/myList";
import { decideProgress, nextEpisodeAfter, nextHoldSeekDelta } from "../../state/progress";
import { useSettings } from "../../state/settings";
import { IconButton, MangoButton } from "../components/Buttons";
import { MangoLogo } from "../components/Logo";
import { FullScreenError, Spinner } from "../components/States";
import { describeDiagnostics, EVENTS_WORTH_KEEPING, probeSource, snapshotVideo, type TrailEntry } from "../player/diagnostics";
import { createEngine, mediaErrorToPlaybackError, pickDefaultSubtitle, type EngineTracks, type PlaybackError, type PlayerEngine } from "../player/engine";
import { AdvancedPanel, PlaybackErrorOverlay, SettingsPanel, SourceInfoPanel, SpeedMenu, TrackMenu } from "../player/overlays";

type Screen = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; content: Content; episode: Episode | null; stream: Stream };

/** PlayerScreen.kt + PlayerViewModel.kt: load the title and the chosen source, then play it. */
export function PlayerScreen() {
  const p = useParams<{ providerId: string; type: string; id: string; season: string; episode: string; streamId: string }>();
  const navigate = useNavigate();
  const providerId = p.providerId ?? "";
  const id = p.id ?? "";
  const streamId = p.streamId ?? "";
  const type: ContentType = p.type === "TV_SHOW" ? "TV_SHOW" : "MOVIE";
  const season = parseOptionalInt(p.season);
  const episodeNumber = parseOptionalInt(p.episode);
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const ready = useAddonsReady();

  useEffect(() => {
    let cancelled = false;
    setScreen({ kind: "loading" });
    if (!ready) return;
    void (async () => {
      const providers = activeProviders();
      const owner = providers.find((x) => x.id === providerId);
      const content = owner ? await owner.getDetails(type, id).catch(() => null) : null;
      if (cancelled) return;
      if (!content) return setScreen({ kind: "error", message: "Couldn't load details for this title." });
      const streams = (await Promise.all(providers.map((x) => x.getStreams(type, id, season, episodeNumber).catch(() => [] as Stream[])))).flat();
      if (cancelled) return;
      const stream = streams.find((s) => s.id === streamId);
      if (!stream) return setScreen({ kind: "error", message: "This source is no longer available." });
      const episode = season != null && episodeNumber != null ? (content.seasons.find((s) => s.seasonNumber === season)?.episodes.find((e) => e.episodeNumber === episodeNumber) ?? null) : null;
      setScreen({ kind: "ready", content: { ...content, providerId: content.providerId ?? providerId }, episode, stream });
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId, type, id, season, episodeNumber, streamId, tick, ready]);

  const changeSource = useCallback(() => navigate(routes.sources(providerId, type, id, season, episodeNumber, true), { replace: true }), [navigate, providerId, type, id, season, episodeNumber]);
  const back = useCallback(() => navigate(-1), [navigate]);

  if (screen.kind === "loading") return <div className="player player--center"><Spinner white /></div>;
  if (screen.kind === "error") return <div className="player"><FullScreenError message={screen.message} onRetry={() => setTick((t) => t + 1)} secondaryLabel="Choose a Different Source" onSecondary={changeSource} /></div>;
  return (
    <Playback
      key={screen.stream.id}
      content={screen.content}
      episode={screen.episode}
      stream={screen.stream}
      providerId={providerId}
      type={type}
      season={season}
      episodeNumber={episodeNumber}
      onBack={back}
      onChangeSource={changeSource}
      onNextEpisode={(next) => navigate(`${routes.sources(providerId, type, id, next.season, next.episode)}?auto=1`, { replace: true })}
    />
  );
}

type Overlay = "settings" | "subtitles" | "audio" | "quality" | "speed" | "advanced" | "info";
const HIDE_AFTER_MS = 4000;
/** A source that hasn't produced a picture yet: reassure after this long, give up (with a reason) after the second. */
const SLOW_START_MS = 15_000;
const START_TIMEOUT_MS = 45_000;
/** Still no video this long after asking the host directly → ask again through this site's stream relay (Stremio's answer to hosts that don't play well with browsers: proxy them). */
const RELAY_AFTER_MS = 12_000;
type Route = "direct" | "relay";

/** When we already knew this device can't handle the file, say so in the error instead of a generic failure. */
function withDeviceHint(stream: Stream, error: PlaybackError): PlaybackError {
  const verdict = deviceVerdict(stream);
  return verdict.level === "yes" || verdict.level === "unknown" ? error : { ...error, message: `${error.message} ${verdict.reason}` };
}

/** Plain-language reason for a source that never started, using what the <video> element reports and the server's host (never the full link, which can carry a key). */
function startTimeoutError(stream: Stream, video: HTMLVideoElement | null, fellBack: boolean): PlaybackError {
  let host = "";
  try {
    host = new URL(stream.url ?? "").host;
  } catch {
    /* not a URL */
  }
  const where = host ? ` (${host})` : "";
  const seconds = START_TIMEOUT_MS / 1000;
  const waiting = video?.networkState === HTMLMediaElement.NETWORK_LOADING;
  const notCached = stream.debrid && !stream.debrid.cached ? DEBRID_NAMES[stream.debrid.service] ?? stream.debrid.service : null;
  if (notCached) return { type: "network", message: `This source isn't cached on ${notCached} yet, so ${notCached} has to fetch it first — that can take several minutes and nothing plays until it's ready. Try again later, or choose a source marked "Cached".` };
  if (fellBack) return { type: "network", message: `No video arrived from this source${where} — neither when your browser asked directly nor through this site's relay. The host may be busy, blocking requests, or still preparing the file. Try again in a few minutes, or choose another source.` };
  return {
    type: "network",
    message: waiting
      ? `This source didn't start playing within ${seconds} seconds. Its server${where} is either very slow to prepare the file (some debrid links are) or is sending something your browser can't open. Try again, or choose another source.`
      : `This source didn't start playing within ${seconds} seconds — its server${where} didn't send any video. Try again, or choose another source.`,
  };
}
const REPORT_EVERY_MS = 30_000;
const EMPTY_TRACKS: EngineTracks = { audio: [], subtitles: [], quality: [] };
const KNOWN_NATIVE_EXT = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv)(\?|#|$)/i;

interface PlaybackProps {
  content: Content;
  episode: Episode | null;
  stream: Stream;
  providerId: string;
  type: ContentType;
  season: number | null;
  episodeNumber: number | null;
  onBack(): void;
  onChangeSource(): void;
  onNextEpisode(next: { season: number; episode: number; title: string }): void;
}

function Playback({ content, episode, stream, providerId, type, season, episodeNumber, onBack, onChangeSource, onNextEpisode }: PlaybackProps) {
  const userId = useAuth((s) => s.user?.id);
  const prefs = useSettings((s) => s.player);
  const setPlayer = useSettings((s) => s.setPlayer);
  const reportProgress = useContinueWatching((s) => s.reportProgress);
  const markWatched = useMyList((s) => s.markWatched);

  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<PlayerEngine | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const trail = useRef<TrailEntry[]>([]);
  const trailStart = useRef(0);
  const startedAt = useRef(Date.now());

  const [phase, setPhase] = useState<"loading" | "playing" | "paused" | "buffering" | "ended">("loading");
  const [error, setError] = useState<PlaybackError | null>(null);
  const [slowStart, setSlowStart] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** How the media is fetched: straight from the host, or through this site's relay (needed for header-locked / plain-http links; also the fallback when a direct request never delivers video). */
  const [route, setRoute] = useState<Route>(() => (needsRelay(stream) ? "relay" : "direct"));
  const [fellBack, setFellBack] = useState(false);
  const fallBackToRelay = useCallback(
    (): boolean => {
      if (route !== "direct" || fellBack || !stream.url) return false;
      setFellBack(true);
      setRoute("relay");
      return true;
    },
    [route, fellBack, stream.url],
  );
  /** Every playback failure goes through here: adds what we knew about this device, and a technical account of what the video element did. */
  const fail = useCallback(
    (e: PlaybackError) => {
      const v = video.current;
      const details = describeDiagnostics({ stream, snapshot: v ? snapshotVideo(v) : null, engine: engine.current?.kind ?? "native", trail: trail.current, verdict: deviceVerdict(stream), browser: getDeviceCaps().browser, userAgent: navigator.userAgent, route: fellBack ? "direct, then relay" : route });
      const hinted = withDeviceHint(stream, e);
      setError({ ...hinted, message: fellBack && !hinted.message.includes("relay") ? `${hinted.message} (Tried directly and through this site's relay.)` : hinted.message, details });
    },
    [stream, route, fellBack],
  );
  const [tracks, setTracks] = useState<EngineTracks>(EMPTY_TRACKS);
  const [speed, setSpeed] = useState(1);
  const [controls, setControls] = useState(true);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [time, setTime] = useState({ pos: 0, dur: 0, buffered: 0 });
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pill, setPill] = useState<string | null>(null);
  const [flash, setFlash] = useState<"play" | "pause" | null>(null);
  const [upNext, setUpNext] = useState<{ season: number; episode: number; title: string } | null>(null);
  const interaction = useRef(0);
  const [tickInteraction, setTickInteraction] = useState(0);
  const bump = useCallback(() => {
    interaction.current++;
    setControls(true);
    setTickInteraction(interaction.current);
  }, []);

  const overlay = overlays.at(-1) ?? null;
  const next = useMemo(() => nextEpisodeAfter(content.seasons, season, episodeNumber), [content.seasons, season, episodeNumber]);
  const resumeMs = useRef<number | null>(
    (() => {
      const entry = useContinueWatching.getState().findResumePoint(providerId, content.id, type);
      return entry && (entry.seasonNumber ?? null) === season && (entry.episodeNumber ?? null) === episodeNumber ? entry.positionMs : null;
    })(),
  );

  // ── progress reporting ──────────────────────────────────────────────────────
  const report = useCallback(
    (completed: boolean, keepalive = false) => {
      const v = video.current;
      if (!v || !Number.isFinite(v.duration)) return;
      const durationMs = Math.round(v.duration * 1000);
      const positionMs = completed ? durationMs : Math.round(v.currentTime * 1000);
      const decision = decideProgress(type, positionMs, durationMs, completed);
      if (!decision.report) return;
      if (decision.rememberSource && userId) setLastStreamId(userId, providerId, content.id, type, season, episodeNumber, stream.id);
      if (decision.markWatched) markWatched(content);
      reportProgress(
        { providerId, contentId: content.id, contentType: type, seasonNumber: season, episodeNumber, episodeTitle: episode?.title ?? null, title: content.title, posterUrl: content.posterUrl, backdropUrl: content.backdropUrl, positionMs, durationMs, completed },
        { keepalive },
      );
    },
    [type, userId, providerId, content, season, episodeNumber, stream.id, episode, markWatched, reportProgress],
  );
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => reportRef.current(false), REPORT_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && reportRef.current(false, true);
    const onHide = () => reportRef.current(false, true);
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", onHide);
      reportRef.current(false); // leaving the player: final position (PlayerScreen's DisposableEffect)
    };
  }, []);

  // ── media pipeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    setError(null);
    setPhase("loading");
    setTracks(EMPTY_TRACKS);
    const verdict = assessStream(stream);
    if (verdict.level === "no") {
      setError({ type: "unsupported", message: verdict.reason });
      return;
    }
    const url = playbackUrl(stream, route);
    let cancelled = false;
    let subtitleChosen = false;
    let triedHls = false;
    /** A relay can fix blocked / unreachable / header-locked fetches, not a file the device can't decode. */
    const shouldTryRelay = (e: PlaybackError): boolean => route === "direct" && e.type !== "decode" && ["yes", "unknown"].includes(deviceVerdict(stream).level);

    const start = async (kind: ReturnType<typeof engineFor>) => {
      engine.current?.destroy();
      engine.current = null;
      const created = await createEngine(kind, v, url, {
        onTracks: (t) => {
          if (cancelled) return;
          if (!subtitleChosen && t.subtitles.length > 0) {
            subtitleChosen = true;
            const pick = pickDefaultSubtitle(t.subtitles, prefsRef.current);
            engine.current?.selectSubtitle(pick);
            return setTracks({ ...t, subtitles: t.subtitles.map((o) => ({ ...o, selected: o.id === pick })) });
          }
          setTracks(t);
        },
        onError: (e) => {
          if (cancelled) return;
          // A URL without a recognisable extension may still be HLS: try hls.js once before giving up.
          if (kind === "native" && e.type === "unsupported" && !triedHls && !KNOWN_NATIVE_EXT.test(url)) {
            triedHls = true;
            void start("hls");
            return;
          }
          if (shouldTryRelay(e) && fallBackToRelay()) return;
          fail(e);
        },
      });
      if (cancelled) return created.destroy();
      engine.current = created;
      v.playbackRate = speed;
      v.play().catch(() => !cancelled && setPhase("paused")); // autoplay blocked (e.g. page reloaded) → the big play button
    };

    const onMeta = () => {
      const r = resumeMs.current;
      if (r && r > 0 && Number.isFinite(v.duration) && v.duration * 1000 - r > 10_000) v.currentTime = r / 1000;
      resumeMs.current = null;
    };
    const onTime = () => setTime((t) => ({ pos: v.currentTime, dur: Number.isFinite(v.duration) ? v.duration : 0, buffered: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : t.buffered }));
    const onPlaying = () => setPhase("playing");
    const onPause = () => !v.ended && setPhase("paused");
    const onWaiting = () => setPhase((p) => (p === "paused" ? p : "buffering"));
    const onEnded = () => setPhase("ended");
    const onVolume = () => {
      setVolume(v.volume);
      setMuted(v.muted);
    };
    const onNativeError = () => {
      if (engine.current?.kind === "native" || !engine.current) return; // native engine reports its own errors
      if (!v.error) return;
      const e = mediaErrorToPlaybackError(v.error);
      if (shouldTryRelay(e) && fallBackToRelay()) return;
      fail(e);
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onTime);
    v.addEventListener("progress", onTime);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("ended", onEnded);
    v.addEventListener("volumechange", onVolume);
    v.addEventListener("error", onNativeError);
    // a fresh trail for this route — but say when it only exists because the direct request delivered nothing
    trail.current = fellBack ? [{ at: 0, name: "relay-fallback (the direct request delivered no video)" }] : [];
    trailStart.current = performance.now();
    let progressSeen = 0;
    const noteEvent = (e: Event) => {
      if (e.type === "progress" && ++progressSeen > 5) return; // bytes arriving is the point, not every packet
      if (trail.current.length < 80) trail.current.push({ at: Math.round(performance.now() - trailStart.current), name: e.type });
    };
    EVENTS_WORTH_KEEPING.forEach((name) => v.addEventListener(name, noteEvent));
    void start(engineFor(url));
    return () => {
      cancelled = true;
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onTime);
      v.removeEventListener("progress", onTime);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("volumechange", onVolume);
      v.removeEventListener("error", onNativeError);
      EVENTS_WORTH_KEEPING.forEach((name) => v.removeEventListener(name, noteEvent));
      engine.current?.destroy();
      engine.current = null;
    };
    // `speed` is applied once at start; later changes go through changeSpeed().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, attempt, route]);

  useEffect(() => {
    startedAt.current = Date.now(); // a new source or "Try Again" restarts the start-up budget; a route switch does not
  }, [stream, attempt]);

  // A source that never starts must not spin forever: reassure first, then say why it gave up. "Started" = the browser
  // has learned anything about the file (metadata, a frame, playback); a video that is merely paused or buffering later doesn't count.
  useEffect(() => {
    const stalled = () => (video.current?.readyState ?? 0) === 0 && !video.current?.error;
    // The budget (note after 15 s, give up after 45 s) runs from the first request, so switching to the relay never makes the wait longer.
    const left = (budget: number) => Math.max(0, budget - (Date.now() - startedAt.current));
    setSlowStart(left(SLOW_START_MS) === 0 && stalled());
    // no video yet from a direct request → ask again through the relay (once)
    const relay = route === "direct" ? window.setTimeout(() => stalled() && fallBackToRelay(), left(RELAY_AFTER_MS)) : null;
    const slow = window.setTimeout(() => stalled() && setSlowStart(true), left(SLOW_START_MS));
    const giveUp = window.setTimeout(() => stalled() && fail(startTimeoutError(stream, video.current, fellBack)), left(START_TIMEOUT_MS));
    return () => {
      if (relay !== null) window.clearTimeout(relay);
      window.clearTimeout(slow);
      window.clearTimeout(giveUp);
    };
  }, [stream, attempt, fail, route, fellBack, fallBackToRelay]);

  // pause → report; end → report completed + up-next
  useEffect(() => {
    if (phase === "paused") reportRef.current(false);
    if (phase === "ended") {
      reportRef.current(true);
      if (next && prefs.autoplayNextEpisode) setUpNext(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // keep the screen awake while playing (PlayerScreen keepScreenOn)
  useEffect(() => {
    if (phase !== "playing" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [phase]);

  // hardware media keys / lock-screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({ title: episode ? `${content.title} — S${episode.seasonNumber}E${episode.episodeNumber}` : content.title, artist: "Mango TV", artwork: content.posterUrl ? [{ src: content.posterUrl }] : [] });
    ms.setActionHandler("play", () => void video.current?.play());
    ms.setActionHandler("pause", () => video.current?.pause());
    ms.setActionHandler("seekbackward", () => seekBy(-10));
    ms.setActionHandler("seekforward", () => seekBy(10));
    return () => {
      (["play", "pause", "seekbackward", "seekforward"] as const).forEach((a) => ms.setActionHandler(a, null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, episode]);

  // controls auto-hide after 4 s of no interaction, while playing and no overlay is open
  useEffect(() => {
    if (!controls || overlay || phase !== "playing") return;
    const t = window.setTimeout(() => setControls(false), HIDE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [controls, overlay, phase, tickInteraction]);

  useEffect(() => {
    const t = pill ? window.setTimeout(() => setPill(null), 900) : undefined;
    return () => window.clearTimeout(t);
  }, [pill]);
  useEffect(() => {
    const t = flash ? window.setTimeout(() => setFlash(null), 700) : undefined;
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── actions ─────────────────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play();
      setFlash("play");
    } else {
      v.pause();
      setFlash("pause");
    }
    bump();
  }, [bump]);

  function seekBy(deltaSeconds: number) {
    const v = video.current;
    if (!v) return;
    const target = v.currentTime + deltaSeconds;
    v.currentTime = Number.isFinite(v.duration) ? Math.min(Math.max(target, 0), v.duration) : Math.max(target, 0);
    setPill(deltaSeconds < 0 ? `«« ${Math.abs(deltaSeconds)} seconds` : `${deltaSeconds} seconds »»`);
    bump();
  }
  const seekTo = (seconds: number) => {
    const v = video.current;
    if (v && Number.isFinite(v.duration)) v.currentTime = Math.min(Math.max(seconds, 0), v.duration);
    bump();
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (video.current) video.current.playbackRate = s;
    setOverlays((o) => o.slice(0, -1));
    bump();
  };
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (container.current?.requestFullscreen?.() ?? Promise.resolve());
  }, []);
  const setVolumeTo = useCallback(
    (value: number) => {
      const v = video.current;
      if (!v) return;
      v.volume = Math.min(1, Math.max(0, value));
      v.muted = value <= 0;
      bump();
    },
    [bump],
  );
  const push = (o: Overlay) => {
    setOverlays((s) => [...s, o]);
    bump();
  };
  const pop = useCallback(() => setOverlays((s) => s.slice(0, -1)), []);
  const closeAll = () => setOverlays([]);

  const handleBack = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    onBack();
  }, [onBack]);

  // ── keyboard (Space/K, arrows, F, M, Esc …) ─────────────────────────────────
  const hold = useRef<{ anchor: number; delta: number } | null>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (overlay || error || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return; // the volume slider etc. handle their own keys
      const v = video.current;
      if (!v) return;
      switch (e.key) {
        case "Tab":
          // hidden controls are inert, so bring them back and put focus on the first one instead of losing the key
          if (!e.shiftKey && document.querySelector(".pctl")?.hasAttribute("inert")) {
            e.preventDefault();
            bump();
            window.setTimeout(() => document.querySelector<HTMLElement>(".pctl[data-visible='true'] button:not([disabled])")?.focus(), 60);
          }
          break;
        case " ":
        case "k":
        case "K":
          if (target?.tagName === "BUTTON" && e.key === " ") return; // Space on a focused button activates it
          e.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          if (document.querySelector('[data-spatial-trap="true"]')) return; // e.g. the Up-next card: arrows move between its buttons
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          if (!Number.isFinite(v.duration)) return;
          if (!e.repeat && !hold.current) hold.current = { anchor: v.currentTime, delta: 0 };
          const h = hold.current!;
          h.delta = nextHoldSeekDelta(h.delta * 1000, dir, !e.repeat) / 1000;
          setPill(h.delta < 0 ? `«« ${Math.abs(h.delta)} seconds` : `${h.delta} seconds »»`);
          bump();
          break;
        }
        case "ArrowUp":
        case "ArrowDown":
          if (document.querySelector('[data-spatial-trap="true"]')) return;
          e.preventDefault();
          setVolumeTo(v.volume + (e.key === "ArrowUp" ? 0.05 : -0.05));
          break;
        case "m":
        case "M":
          v.muted = !v.muted;
          bump();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "Enter":
          if (target?.tagName === "BUTTON") return;
          e.preventDefault();
          if (!controls) bump();
          else toggle();
          break;
        case "Escape":
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else if (controls && phase === "playing") setControls(false);
          else handleBack();
          break;
        case "Backspace":
          e.preventDefault();
          handleBack();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && hold.current) {
        const v = video.current;
        if (v && Number.isFinite(v.duration)) v.currentTime = Math.min(Math.max(hold.current.anchor + hold.current.delta, 0), v.duration);
        hold.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [overlay, error, controls, phase, toggle, toggleFullscreen, bump, handleBack, setVolumeTo]);

  // ── pointer ─────────────────────────────────────────────────────────────────
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const onSurfaceClick = () => {
    if (overlay) return closeAll();
    if (coarse) return setControls((c) => !c);
    toggle();
  };

  const playing = phase === "playing";
  const showControls = controls || phase === "paused" || phase === "ended" || !!overlay;
  const pct = time.dur > 0 ? (time.pos / time.dur) * 100 : 0;
  const bufPct = time.dur > 0 ? (time.buffered / time.dur) * 100 : 0;
  const subtitle = [content.year, content.ageRating, episode && content.seasons.length ? `${content.seasons.length} Season${content.seasons.length === 1 ? "" : "s"}` : content.runtimeMinutes ? `${Math.floor(content.runtimeMinutes / 60)}h ${content.runtimeMinutes % 60}m` : null].filter(Boolean).join("  •  ");

  return (
    <div ref={container} className="player" data-spatial="off" data-hidden={!showControls && playing} onPointerMove={(e) => e.pointerType !== "touch" && bump()}>
      <video ref={video} className="player__video" playsInline crossOrigin={undefined} onClick={onSurfaceClick} onDoubleClick={() => !coarse && toggleFullscreen()} aria-label={`${content.title} video`} />

      {(phase === "loading" || phase === "buffering") && !error ? <div className="player__spinner"><Spinner white /></div> : null}
      {(phase === "loading" || phase === "buffering") && slowStart && !error && (video.current?.readyState ?? 0) === 0 ? (
        <div className="player__slow" role="status">
          <p className="t-title-md" style={{ margin: 0 }}>Still trying to start this source…</p>
          <p className="t-body-md c-text-2" style={{ margin: 0 }}>{stream.debrid && !stream.debrid.cached ? `This source isn't cached on ${DEBRID_NAMES[stream.debrid.service] ?? stream.debrid.service} yet, so it can take several minutes. Sources marked “Cached” start straight away.` : "Some sources take a while to prepare. You can keep waiting or pick another one."}</p>
          <MangoButton text="Choose a Different Source" icon={<MdSwapHoriz />} compact borderColor="#fff" onClick={onChangeSource} />
        </div>
      ) : null}
      {phase === "paused" && !showControls ? null : null}
      {pill ? <div className="ppill t-title-md" role="status">{pill}</div> : null}
      {flash ? <div className="pflash" aria-hidden="true">{flash === "play" ? <MdPlayArrow /> : <MdPause />}</div> : null}
      {phase === "paused" && time.pos === 0 && !error ? (
        <button type="button" className="pbig" aria-label="Play" onClick={toggle}><MdPlayArrow /></button>
      ) : null}

      <div className="pctl" data-visible={showControls} {...(showControls ? {} : { inert: "" as unknown as boolean })}>
        <div className="pctl__scrim" />
        <div className="ptop">
          <IconButton icon={<MdArrowBack />} label="Back" showBackground={false} borderColor="#fff" clickSound="back" onClick={handleBack} />
          <div className="ptop__title">
            <div className="t-title-lg ellipsis">{content.title}</div>
            {subtitle ? <div className="t-label-md c-text-2 ellipsis">{subtitle}</div> : null}
            {episode ? <div className="t-label-md c-text-2 ellipsis" style={{ fontWeight: 700 }}>{`S${episode.seasonNumber} E${episode.episodeNumber} • ${episode.title}`}</div> : null}
          </div>
          <MangoLogo size={16} />
        </div>

        <div className="pbottom">
          <IconButton icon={playing ? <MdPause /> : <MdPlayArrow />} label={playing ? "Pause" : "Play"} showBackground={false} borderColor="#fff" onClick={toggle} />
          <IconButton icon={<MdReplay10 />} label="Rewind 10 seconds" compact showBackground={false} borderColor="#fff" onClick={() => seekBy(-10)} />
          <IconButton icon={<MdForward10 />} label="Forward 10 seconds" compact showBackground={false} borderColor="#fff" onClick={() => seekBy(10)} />
          <span className="ptime t-label-md c-text-2" aria-label="Elapsed">{formatTimestamp(time.pos * 1000)}</span>
          <Timeline pct={pct} bufPct={bufPct} duration={time.dur} position={time.pos} onSeek={seekTo} />
          <span className="ptime t-label-md c-text-2" aria-label="Duration">{formatTimestamp(time.dur * 1000)}</span>
          <div className="pvol">
            <IconButton icon={muted || volume === 0 ? <MdVolumeOff /> : <MdVolumeUp />} label={muted ? "Unmute" : "Mute"} compact showBackground={false} borderColor="#fff" onClick={() => { const v = video.current; if (v) v.muted = !v.muted; bump(); }} />
            <input className="range pvol__range" type="range" min={0} max={100} value={Math.round((muted ? 0 : volume) * 100)} style={{ ["--fill" as string]: `${Math.round((muted ? 0 : volume) * 100)}%` }} onChange={(e) => setVolumeTo(Number(e.target.value) / 100)} aria-label="Volume" />
          </div>
          {tracks.subtitles.length > 0 ? <IconButton icon={<MdSubtitles />} label="Subtitles" compact showBackground={false} borderColor="#fff" onClick={() => push("subtitles")} /> : null}
          {tracks.audio.length > 1 ? <IconButton icon={<MdGraphicEq />} label="Audio" compact showBackground={false} borderColor="#fff" onClick={() => push("audio")} /> : null}
          {tracks.quality.length > 1 ? <IconButton icon={<MdHighQuality />} label="Quality" compact showBackground={false} borderColor="#fff" onClick={() => push("quality")} /> : null}
          <IconButton icon={<MdSettings />} label="Player settings" compact showBackground={false} borderColor="#fff" onClick={() => push("settings")} />
          {next ? <IconButton icon={<MdSkipNext />} label={`Next episode: S${next.season} E${next.episode}`} compact showBackground={false} borderColor="#fff" onClick={() => onNextEpisode(next)} /> : null}
          <IconButton icon={fullscreen ? <MdFullscreenExit /> : <MdFullscreen />} label={fullscreen ? "Exit full screen" : "Full screen"} compact showBackground={false} borderColor="#fff" onClick={toggleFullscreen} />
        </div>
      </div>

      {overlay === "settings" ? <SettingsPanel tracks={tracks} speed={speed} autoplayNext={prefs.autoplayNextEpisode} onAutoplayChange={(v) => setPlayer({ autoplayNextEpisode: v })} onOpen={push} onClose={pop} /> : null}
      {overlay === "advanced" ? <AdvancedPanel skipIntro={prefs.skipIntroEnabled} onSkipIntro={(v) => setPlayer({ skipIntroEnabled: v })} onSourceInfo={() => push("info")} onChangeSource={onChangeSource} onClose={pop} /> : null}
      {overlay === "info" ? <SourceInfoPanel stream={stream} tracks={tracks} engine={engine.current?.kind ?? "native"} onClose={pop} /> : null}
      {overlay === "subtitles" ? <TrackMenu title="Subtitles" options={tracks.subtitles} offLabel="Off" onClose={pop} onSelect={(id) => { engine.current?.selectSubtitle(id); setTracks((t) => ({ ...t, subtitles: t.subtitles.map((o) => ({ ...o, selected: o.id === id })) })); pop(); }} /> : null}
      {overlay === "audio" ? <TrackMenu title="Audio" options={tracks.audio} onClose={pop} onSelect={(id) => { if (id) engine.current?.selectAudio(id); setTracks((t) => ({ ...t, audio: t.audio.map((o) => ({ ...o, selected: o.id === id })) })); pop(); }} /> : null}
      {overlay === "quality" ? <TrackMenu title="Quality" options={tracks.quality} onClose={pop} onSelect={(id) => { if (id) engine.current?.selectQuality(id); setTracks((t) => ({ ...t, quality: t.quality.map((o) => ({ ...o, selected: o.id === id })) })); pop(); }} /> : null}
      {overlay === "speed" ? <SpeedMenu speed={speed} onSelect={changeSpeed} onClose={pop} /> : null}

      {upNext ? <UpNext next={upNext} onCancel={() => setUpNext(null)} onGo={() => onNextEpisode(upNext)} /> : null}
      {error ? (
        <PlaybackErrorOverlay
          message={error.message}
          details={error.details}
          onProbe={stream.url ? (onLine) => probeSource(stream.url as string, { onLine, relayUrl: buildRelayUrl(stream.url as string, stream.proxyHeaders ?? {}, stream.proxyResponseHeaders ?? {}) }) : undefined}
          ytId={stream.ytId}
          onTryAgain={() => {
            setFellBack(false);
            setRoute(needsRelay(stream) ? "relay" : "direct"); // start over the way a first attempt would
            setAttempt((a) => a + 1);
          }}
          onChangeSource={onChangeSource}
          onBack={handleBack}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">{phase === "buffering" ? "Buffering" : phase === "playing" ? "Playing" : phase === "paused" ? "Paused" : ""}</span>
    </div>
  );
}

/** The seek bar (PlayerTimeline.kt): buffered + played fills and a thumb; drag, click, or use the arrow keys. */
function Timeline({ pct, bufPct, duration, position, onSeek }: { pct: number; bufPct: number; duration: number; position: number; onSeek(seconds: number): void }) {
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const fractionAt = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(fractionAt(e.clientX) * duration);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    setHover(fractionAt(e.clientX));
    if (dragging.current) onSeek(fractionAt(e.clientX) * duration);
  };
  return (
    <div
      ref={bar}
      className="ptl"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${formatTimestamp(position * 1000)} of ${formatTimestamp(duration * 1000)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => setHover(null)}
    >
      <div className="ptl__track">
        <div className="ptl__buf" style={{ width: `${bufPct}%` }} />
        <div className="ptl__played" style={{ width: `${pct}%` }} />
      </div>
      <div className="ptl__thumb" style={{ left: `${pct}%` }} />
      {hover !== null && duration > 0 ? <div className="ptl__tip t-label-sm" style={{ left: `${hover * 100}%` }}>{formatTimestamp(hover * duration * 1000)}</div> : null}
    </div>
  );
}

/** Autoplay-next-episode: a 5-second countdown you can cancel or skip. */
function UpNext({ next, onCancel, onGo }: { next: { season: number; episode: number; title: string }; onCancel(): void; onGo(): void }) {
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (left <= 0) return onGo();
    const t = window.setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  useEffect(() => playSound("nav"), []);
  return (
    <div className="pupnext" role="alertdialog" aria-label="Up next" data-spatial-trap="true">
      <div className="t-label-md c-text-2">Up next in {left}s</div>
      <div className="t-title-md ellipsis">{`S${next.season} E${next.episode} • ${next.title}`}</div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <MangoButton text="Play now" icon={<MdFastForward />} variant="light" compact onClick={onGo} dataAttrs={{ autofocus: true }} />
        <MangoButton text="Cancel" icon={<MdArrowBack />} compact onClick={onCancel} />
      </div>
    </div>
  );
}
