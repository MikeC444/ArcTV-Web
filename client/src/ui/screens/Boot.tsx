import { useEffect, useRef, useState } from "react";
import bootVideo from "../../assets/video/newboot1.mp4";

const READY_TIMEOUT_MS = 10_000;
const VIDEO_TIMEOUT_MS = 20_000;
const SESSION_FLAG = "mtv:booted";

/** Show the branded boot video once per browser tab, and only when landing on Home (deep links open straight away). */
export function shouldShowBoot(pathname: string): boolean {
  if (pathname !== "/") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return sessionStorage.getItem(SESSION_FLAG) !== "1";
  } catch {
    return false;
  }
}

/**
 * BootVideoScreen.kt — the boot video plays (muted: browsers block autoplaying sound) until BOTH it has ended and the
 * Home data is ready, each with a timeout, exactly like the TV. Click, Enter, Space or Esc skips it.
 */
export function BootSplash({ dataReady, onDone }: { dataReady: boolean; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [videoDone, setVideoDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [videoTimedOut, setVideoTimedOut] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const skip = () => setVideoDone(true);

  useEffect(() => {
    const ready = window.setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    const vt = window.setTimeout(() => setVideoTimedOut(true), VIDEO_TIMEOUT_MS);
    const onKey = (e: KeyboardEvent) => ["Enter", " ", "Escape"].includes(e.key) && skip();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(ready);
      window.clearTimeout(vt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const finished = (videoDone || videoTimedOut) && (dataReady || timedOut);
  useEffect(() => {
    if (!finished) return;
    try {
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* private mode — fine */
    }
    onDone();
  }, [finished, onDone]);

  return (
    <div className="boot" role="presentation" onClick={skip} aria-hidden="true">
      <video ref={video} className="boot__video" src={bootVideo} autoPlay muted playsInline preload="auto" data-shown={showVideo} onPlaying={() => setShowVideo(true)} onEnded={() => setVideoDone(true)} onError={() => setVideoDone(true)} />
    </div>
  );
}
