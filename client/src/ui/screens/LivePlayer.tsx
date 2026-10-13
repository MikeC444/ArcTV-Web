import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdArrowBack, MdFullscreen, MdFullscreenExit, MdHighQuality, MdPause, MdPlayArrow, MdSkipNext, MdSkipPrevious, MdSwapHoriz, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { liveEngineFor, playableLiveStreams, type LiveChannel, type LiveType } from "../../domain/live";
import { needsRelay, playbackUrl } from "../../domain/relay";
import { activeProviders } from "../../domain/registry";
import type { Stream } from "../../domain/types";
import { routes } from "../../lib/routes";
import { useAddonsReady } from "../../state/hooks";
import { findLiveChannel, neighbourChannel } from "../../state/liveLineup";
import { IconButton } from "../components/Buttons";
import { FullScreenError, Spinner } from "../components/States";
import { createEngine, type EngineTracks, type PlayerEngine, type PlaybackError } from "../player/engine";

/** A link that gives no picture within this long is given up on, and the next source is tried. */
export const LIVE_START_TIMEOUT_MS = 20_000;
const HIDE_AFTER_MS = 4_000;
const EMPTY_TRACKS: EngineTracks = { audio: [], subtitles: [], quality: [] };

type Route = "direct" | "relay";
interface Attempt {
  index: number;
  route: Route;
}
/** Which way to try a link first: the web server's relay when the browser could not fetch it itself, else directly. */
export const firstRoute = (stream: Stream): Route => (needsRelay(stream) ? "relay" : "direct");

/** What to try after a link failed: the same link through the relay (a blocked or header-locked host), else the next link, else nothing. */
export function nextAttempt(streams: Stream[], current: Attempt, error: Pick<PlaybackError, "type">): Attempt | null {
  const stream = streams[current.index];
  if (stream && current.route === "direct" && error.type !== "decode" && /^https?:\/\//i.test(stream.url ?? "")) return { index: current.index, route: "relay" };
  const next = current.index + 1;
  return next < streams.length ? { index: next, route: firstRoute(streams[next]!) } : null;
}

const asType = (value: string | undefined): LiveType => (value === "events" ? "events" : "tv");
const sourceLabel = (stream: Stream, index: number) => stream.releaseTitle?.trim() || stream.qualityBadge || `Source ${index + 1}`;

/** Watching one channel or live event, full screen. Streams come from the addon that listed it; nothing is saved to Continue Watching. */
export function LivePlayerScreen() {
  const p = useParams<{ providerId: string; type: string; id: string }>();
  const providerId = p.providerId ?? "";
  const type = asType(p.type);
  const id = p.id ?? "";
  return <LiveChannelPlayer key={`${providerId}|${type}|${id}`} providerId={providerId} type={type} id={id} />;
}

function LiveChannelPlayer({ providerId, type, id }: { providerId: string; type: LiveType; id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ready = useAddonsReady();
  const [fetched, setFetched] = useState<LiveChannel | null>(null);
  const remembered = findLiveChannel(providerId, type, id) ?? fetched;
  const channel: Pick<LiveChannel, "providerId" | "type" | "id" | "name" | "logoUrl"> = remembered ?? { providerId, type, id, name: "Live channel", logoUrl: null };
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt>({ index: 0, route: "direct" });
  const [phase, setPhase] = useState<"loading" | "playing" | "buffering" | "paused">("loading");
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<EngineTracks>(EMPTY_TRACKS);
  const [muted, setMuted] = useState(false);
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState<"quality" | "sources" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [tick, setTick] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<PlayerEngine | null>(null);
  const hideTimer = useRef<number>(0);

  // opened by address (a bookmark, a reload): ask the addon who this is
  useEffect(() => {
    if (!ready || findLiveChannel(providerId, type, id)) return undefined;
    let cancelled = false;
    void activeProviders().find((x) => x.id === providerId)?.getLiveChannel?.({ id, type }).then((c) => !cancelled && setFetched(c));
    return () => {
      cancelled = true;
    };
  }, [ready, providerId, type, id]);

  // 1. ask the addon that listed the channel what it offers to play
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    setStreams(null);
    setError(null);
    setLookupNote(null);
    void (async () => {
      const owner = activeProviders().find((x) => x.id === providerId);
      if (!owner?.getLiveStreamReport) return !cancelled && setError("The addon that lists this channel isn't installed any more.");
      const report = await owner.getLiveStreamReport({ id, type });
      if (cancelled) return;
      const playable = playableLiveStreams(report.streams);
      if (playable.length === 0) {
        setLookupNote(report.lookup.kind === "failed" ? report.lookup.reason : report.streams.length > 0 ? "Its streams are of a kind a browser can't play." : null);
        return setError("This channel isn't available right now.");
      }
      setAttempt({ index: 0, route: firstRoute(playable[0]!) });
      setStreams(playable);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, providerId, type, id, tick]);

  // 2. play the chosen link; on a failure go through the relay, then on to the next link
  useEffect(() => {
    const v = video.current;
    const stream = streams?.[attempt.index];
    if (!v || !streams || !stream) return undefined;
    setPhase("loading");
    setTracks(EMPTY_TRACKS);
    setError(null);
    const url = playbackUrl(stream, attempt.route);
    let cancelled = false;
    let triedNative = false;
    let timer = 0;
    const fail = (e: Pick<PlaybackError, "type">, message: string) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      const next = nextAttempt(streams, attempt, e);
      if (next) setAttempt(next);
      else setError(message);
    };
    const start = async (kind: ReturnType<typeof liveEngineFor>) => {
      engine.current?.destroy();
      engine.current = null;
      const created = await createEngine(kind, v, url, {
        onTracks: (t) => !cancelled && setTracks(t),
        onError: (e) => {
          if (cancelled) return;
          // not HLS after all: the plain video element may still play it
          if (kind === "hls" && !triedNative && (e.type === "unsupported" || e.type === "unknown" || e.type === "decode")) {
            triedNative = true;
            void start("native");
            return;
          }
          fail(e, "This channel isn't available right now. Its stream wouldn't start.");
        },
      });
      if (cancelled) return created.destroy();
      engine.current = created;
      v.muted = muted;
      v.play().catch(() => !cancelled && setPhase("paused"));
    };
    const onPlaying = () => {
      window.clearTimeout(timer);
      setPhase("playing");
    };
    const onWaiting = () => setPhase((now) => (now === "playing" ? "buffering" : now));
    const onPause = () => setPhase((now) => (now === "loading" ? now : "paused"));
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("pause", onPause);
    timer = window.setTimeout(() => fail({ type: "network" }, "This channel isn't available right now. Nothing arrived from its stream."), LIVE_START_TIMEOUT_MS);
    void start(liveEngineFor(url));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("pause", onPause);
      engine.current?.destroy();
      engine.current = null;
      v.removeAttribute("src");
      v.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, attempt]);

  const showControls = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), HIDE_AFTER_MS);
  }, []);
  useEffect(() => {
    showControls();
    return () => window.clearTimeout(hideTimer.current);
  }, [showControls]);

  const back = useCallback(() => (location.key === "default" ? navigate(routes.live, { replace: true }) : navigate(-1)), [navigate, location.key]);
  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);
  const toggleMute = useCallback(() => {
    const v = video.current;
    setMuted((m) => {
      if (v) v.muted = !m;
      return !m;
    });
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const go = useCallback(
    (step: 1 | -1) => {
      const next = neighbourChannel(channel, step);
      if (next) navigate(routes.liveChannel(next.providerId, next.type, next.id), { replace: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, providerId, type, id],
  );
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      showControls();
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        if (menu) setMenu(null);
        else back();
      } else if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        toggle();
      } else if (e.key === "m" || e.key === "M") toggleMute();
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "ChannelUp") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "ChannelDown") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, back, toggle, toggleMute, toggleFullscreen, go, showControls]);

  const hasNeighbours = useMemo(() => neighbourChannel(channel, 1) != null, [providerId, type, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const quality = tracks.quality.filter((q) => q.id !== "auto" || tracks.quality.length > 1);
  const label = streams?.[attempt.index] ? sourceLabel(streams[attempt.index]!, attempt.index) : "";

  if (error) {
    return (
      <main className="player" id="main">
        <FullScreenError title="Channel unavailable" message={lookupNote ? `${error} ${lookupNote}` : error} onRetry={() => setTick((t) => t + 1)} secondaryLabel="Back to channels" onSecondary={back} />
      </main>
    );
  }

  return (
    <main className="player liveplayer" id="main" data-hidden={!controls && phase === "playing"} onMouseMove={showControls} onTouchStart={showControls}>
      <video ref={video} className="liveplayer__video" playsInline autoPlay onClick={toggle} onDoubleClick={toggleFullscreen} />
      {phase === "loading" || phase === "buffering" ? (
        <div className="liveplayer__wait" role="status">
          <Spinner white />
          <span>{phase === "loading" ? `Tuning in to ${channel.name}…` : "Buffering…"}</span>
        </div>
      ) : null}
      <div className="liveplayer__ui" data-visible={controls || phase === "paused" || menu !== null}>
        <div className="liveplayer__top">
          <IconButton icon={<MdArrowBack />} label="Back" onClick={back} />
          {channel.logoUrl ? <img className="liveplayer__logo" src={channel.logoUrl} alt="" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} /> : null}
          <div className="liveplayer__title">
            <b>{channel.name}</b>
            <span><i className="liveplayer__live" /> {type === "events" ? "LIVE EVENT" : "LIVE"}{label && streams && streams.length > 1 ? ` · ${label}` : ""}</span>
          </div>
        </div>
        <div className="liveplayer__bottom">
          {hasNeighbours ? <IconButton icon={<MdSkipPrevious />} label="Previous channel (Arrow down)" onClick={() => go(-1)} /> : null}
          <IconButton icon={phase === "paused" ? <MdPlayArrow /> : <MdPause />} label={phase === "paused" ? "Play" : "Pause"} onClick={toggle} />
          {hasNeighbours ? <IconButton icon={<MdSkipNext />} label="Next channel (Arrow up)" onClick={() => go(1)} /> : null}
          <span className="liveplayer__sp" />
          {streams && streams.length > 1 ? <IconButton icon={<MdSwapHoriz />} label="Choose a source" onClick={() => setMenu(menu === "sources" ? null : "sources")} /> : null}
          {quality.length > 1 ? <IconButton icon={<MdHighQuality />} label="Quality" onClick={() => setMenu(menu === "quality" ? null : "quality")} /> : null}
          <IconButton icon={muted ? <MdVolumeOff /> : <MdVolumeUp />} label={muted ? "Unmute (M)" : "Mute (M)"} onClick={toggleMute} />
          <IconButton icon={fullscreen ? <MdFullscreenExit /> : <MdFullscreen />} label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen} />
        </div>
        {menu === "sources" && streams ? (
          <ul className="liveplayer__menu" role="menu" aria-label="Sources">
            {streams.map((s, i) => (
              <li key={s.id}>
                <button type="button" role="menuitemradio" aria-checked={i === attempt.index} onClick={() => { setMenu(null); setAttempt({ index: i, route: firstRoute(s) }); }}>{sourceLabel(s, i)}</button>
              </li>
            ))}
          </ul>
        ) : null}
        {menu === "quality" ? (
          <ul className="liveplayer__menu" role="menu" aria-label="Quality">
            {quality.map((q) => (
              <li key={q.id}>
                <button type="button" role="menuitemradio" aria-checked={q.selected} onClick={() => { engine.current?.selectQuality(q.id); setMenu(null); setTracks((t) => ({ ...t, quality: t.quality.map((o) => ({ ...o, selected: o.id === q.id })) })); }}>{q.label}</button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
