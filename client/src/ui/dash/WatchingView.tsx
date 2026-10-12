import { useCallback, useEffect, useState } from "react";
import { platformColor, platformName } from "../../lib/dash";
import { formatElapsed, timeAgo } from "../../lib/format";
import { fetchWatching, type WatchingList, type WatchingNow } from "../../state/admin";
import { Spinner } from "../components/States";
import { Card } from "./Primitives";

const REFRESH_MS = 10_000;

const sxe = (w: Pick<WatchingNow, "seasonNumber" | "episodeNumber">) => (w.seasonNumber != null && w.episodeNumber != null ? `S${w.seasonNumber} E${w.episodeNumber}` : null);
const progress = (w: Pick<WatchingNow, "positionMs" | "durationMs">): number | null => (w.positionMs != null && w.durationMs != null && w.durationMs > 0 ? Math.min(100, Math.max(0, (w.positionMs / w.durationMs) * 100)) : null);

/** People watching right now: one card per device that saved playback progress in the last minute, with the title, how far in, and which app. Refreshes every 10 seconds. */
export function WatchingView({ onOpenUser }: { onOpenUser(id: string): void }) {
  const [data, setData] = useState<WatchingList | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await fetchWatching());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!data) return error ? <p className="dash__error" role="alert">Couldn't load who is watching. The backend may need redeploying.</p> : <Spinner />;
  // One card per device, even if the backend were ever to repeat one.
  const watching = [...new Map(data.watching.map((w) => [w.deviceId, w])).values()];
  const people = new Set(watching.map((w) => w.userId)).size;
  const byPlatform = new Map<string, number>();
  for (const w of watching) byPlatform.set(w.platform, (byPlatform.get(w.platform) ?? 0) + 1);

  return (
    <div className="dd-scroll">
      <div className="dd-watchhead">
        <p className="dd-sub">
          <b>{people}</b> {people === 1 ? "person" : "people"} on <b>{watching.length}</b> {watching.length === 1 ? "device" : "devices"} · a device counts while it saves playback progress (within {data.windowSeconds} seconds) · refreshes every 10 s
        </p>
        <span className="dd-pills">
          {[...byPlatform.entries()].map(([p, n]) => (
            <span key={p} className="dd-tag"><i className="dd-swatch" style={{ background: platformColor(p) }} /> {platformName(p)} {n}</span>
          ))}
        </span>
        {error ? <p className="dash__error" role="alert">Couldn't refresh. Showing the last numbers.</p> : null}
      </div>
      {watching.length === 0 ? (
        <Card><p className="dd-sub dd-empty">Nobody is watching right now. This fills in as soon as someone presses play.</p></Card>
      ) : (
        <ul className="dd-watch" role="list">
          {watching.map((w) => {
            const pct = progress(w);
            return (
              <li key={w.deviceId}>
                <button type="button" className="dd-watchcard" onClick={() => onOpenUser(w.userId)} aria-label={`Open ${w.email}`}>
                  <span className="dd-watchcard__top">
                    <span className="dd-live-dot" aria-hidden="true" />
                    <span className="dd-watchcard__plat" style={{ color: platformColor(w.platform) }}>{platformName(w.platform)}{w.appVersion && w.appVersion !== "web" ? ` ${w.appVersion}` : ""}</span>
                    <span className="dd-watchcard__ago">{timeAgo(w.lastProgressAt)}</span>
                  </span>
                  <b className="dd-watchcard__title">{w.title ?? "Title not known"}</b>
                  <span className="dd-sub dd-watchcard__ep">{[sxe(w), w.episodeTitle].filter(Boolean).join(" · ") || (w.contentType === "MOVIE" ? "Movie" : "")}</span>
                  {pct != null ? (
                    <span className="dd-watchcard__bar" aria-label={`${Math.round(pct)}% watched`}>
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  ) : null}
                  {pct != null ? <span className="dd-sub">{formatElapsed(w.positionMs!)} of {formatElapsed(w.durationMs!)}</span> : null}
                  <span className="dd-watchcard__who"><b className="ellipsis">{w.profileName && w.profileName !== (w.displayName ?? w.email) ? `${w.profileName} · ` : ""}{w.displayName ?? w.email}</b><i className="ellipsis">{w.email} · {w.deviceName}</i></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
