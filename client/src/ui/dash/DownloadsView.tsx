import { useCallback, useEffect, useMemo, useState } from "react";
import { describeEvent, percent, personStatus, STATUS_LABEL, type DownloadDetail, type DownloadPerson, type DownloadStatus } from "../../lib/downloadStats";
import { formatDay } from "../../lib/growth";
import { timeAgo } from "../../lib/format";
import { fetchDownloadDetail, type AdminSummary } from "../../state/admin";
import { Bar, Card, Stat } from "./Primitives";
import { ExternalPlayerSection } from "./ExternalPlayers";

const REFRESH_MS = 30_000;
type Filter = "all" | DownloadStatus;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "downloaded", label: "Pressed a file" },
  { id: "opened", label: "Opened the list only" },
  { id: "blocked", label: "Stopped by the Plus popup" },
];

const initial = (p: Pick<DownloadPerson, "email" | "displayName">) => (p.displayName ?? p.email).trim().charAt(0).toUpperCase() || "?";

/**
 * Downloads: what the Download button on the web app is doing. Pressing it either shows the Plus popup (no Plus) or opens the list of
 * files (Plus); pressing a file in that list is the last thing the web app can know, as the browser does the download itself.
 */
export function DownloadsView({ summary, onOpenUser }: { summary: AdminSummary; onOpenUser(id: string): void }) {
  const dl = summary.downloads;
  const [detail, setDetail] = useState<DownloadDetail | null>(null);
  const [detailMissing, setDetailMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setDetail(await fetchDownloadDetail());
      setDetailMissing(false);
    } catch {
      setDetailMissing(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const people = useMemo(() => (detail?.people ?? []).filter((p) => filter === "all" || personStatus(p) === filter), [detail, filter]);
  const counts = useMemo(() => {
    const c: Record<DownloadStatus, number> = { downloaded: 0, opened: 0, blocked: 0 };
    for (const p of detail?.people ?? []) c[personStatus(p)] += 1;
    return c;
  }, [detail]);

  if (!dl) return <div className="dd-scroll"><p className="dd-sub dd-empty">Downloads need the newer backend.</p></div>;

  return (
    <div className="dd-scroll">
      <p className="dd-sub dd-intro">
        Web app only, last 7 days. Pressing <b>Download</b> on a title does one of two things: without Plus it shows the <b>Plus popup</b>, with Plus it opens the <b>file list</b>.
        Pressing a file in the list is the last thing we can see: the browser does the download itself, so a cancelled one still counts. No titles are recorded.
      </p>

      <div className="dd-stats dd-stats--help">
        <Card>
          <Stat label="Pressed Download" value={dl.triedPeople} note={`${dl.popups + dl.opens} ${dl.popups + dl.opens === 1 ? "press" : "presses"}`} />
          <p className="dd-help">People who pressed a Download button on a title or an episode. Everyone below is part of this number.</p>
        </Card>
        <Card>
          <Stat label="Stopped by the Plus popup" value={dl.popupPeople} note={`${dl.popups} ${dl.popups === 1 ? "press" : "presses"}`} />
          <p className="dd-help">They don't have Plus, so they saw the upgrade popup instead of any files. These are the people who might upgrade.</p>
        </Card>
        <Card>
          <Stat label="Opened the file list" value={dl.openedPeople} note={`${dl.opens} ${dl.opens === 1 ? "time" : "times"}`} />
          <p className="dd-help">They have Plus (or are developers), so the list of files for the title opened.</p>
        </Card>
        <Card>
          <Stat label="Pressed a file" value={dl.startedPeople} note={`${percent(dl.startedPeople, dl.openedPeople)}% of those who opened the list · ${dl.files} ${dl.files === 1 ? "file" : "files"}`} />
          <p className="dd-help">They picked a source and the browser started the download. A cancelled or failed download still counts.</p>
        </Card>
      </div>

      {detail ? (
        <>
          <div className="dd-cols">
            <Card title="Day by day">
              <DayChart days={detail.days} />
            </Card>
            <div className="dd-colstack">
              <Card title="Movies and shows">
                <ul className="dd-bars dd-bars--wide">
                  {(["MOVIE", "TV_SHOW"] as const).map((t) => {
                    const row = detail.byType.find((r) => r.type === t) ?? { popups: 0, opens: 0, files: 0 };
                    const total = row.popups + row.opens + row.files;
                    const all = detail.byType.reduce((n, r) => n + r.popups + r.opens + r.files, 0);
                    return (
                      <li key={t}>
                        <span className="dd-host"><b>{t === "MOVIE" ? "Movies" : "Shows and episodes"}</b><small>{row.popups} {row.popups === 1 ? "popup" : "popups"} · {row.opens} {row.opens === 1 ? "list" : "lists"} opened · {row.files} {row.files === 1 ? "file" : "files"}</small></span>
                        <Bar percent={percent(total, all)} />
                        <b>{total}</b>
                      </li>
                    );
                  })}
                </ul>
                <p className="dd-sub">Of the files pressed, {dl.episodeFiles} of {dl.files} ({percent(dl.episodeFiles, dl.files)}%) were for a single episode.</p>
              </Card>
              <Card title="Cached or not">
                <ul className="dd-bars">
                  <li><span>Cached</span><Bar percent={percent(detail.cached.cached, dl.files)} color="var(--d-ok)" /><b>{detail.cached.cached}</b></li>
                  <li><span>Not cached</span><Bar percent={percent(detail.cached.uncached, dl.files)} color="var(--d-warn)" /><b>{detail.cached.uncached}</b></li>
                </ul>
                <p className="dd-sub">Cached files start straight away. Others have to be fetched by the debrid service first, so they can be slow to start.</p>
              </Card>
              <Card title="Quality of the files pressed">
                <ul className="dd-bars">
                  {dl.byQuality.length === 0 ? <li className="dd-sub">No files pressed yet.</li> : null}
                  {dl.byQuality.map((q) => (
                    <li key={q.label}><span>{q.label}</span><Bar percent={percent(q.files, dl.files)} /><b>{q.files}</b></li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          <Card title={`Who is trying (${detail.people.length})`}>
            <div className="dd-chips" role="group" aria-label="Filter people">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="dd-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}{f.id === "all" ? ` ${detail.people.length}` : ` ${counts[f.id]}`}
                </button>
              ))}
            </div>
            <ul className="dd-urows dd-dlpeople" role="list">
              {people.length === 0 ? <li className="dd-sub dd-empty">Nobody in this group yet.</li> : null}
              {people.map((p) => (
                <li key={p.userId}>
                  <button type="button" className="dd-urow dd-dlrow" onClick={() => onOpenUser(p.userId)} aria-label={`Open ${p.email}`}>
                    <span className="dd-avatar">{initial(p)}</span>
                    <span className="dd-urow__who"><b className="ellipsis">{p.email}</b><i className="ellipsis">{p.displayName ?? "No name"}</i></span>
                    <span className="dd-plan" data-plan={p.plan ?? "free"}>{p.plan ?? "Free"}</span>
                    <span className="dd-dlstatus" data-status={personStatus(p)}>{STATUS_LABEL[personStatus(p)]}</span>
                    <span className="dd-dlcounts">
                      {p.popups > 0 ? <span className="dd-tag">{p.popups}× popup</span> : null}
                      {p.opens > 0 ? <span className="dd-tag">{p.opens}× list</span> : null}
                      {p.files > 0 ? <span className="dd-tag dd-tag--good">{p.files}× file{p.topQuality ? ` · ${p.topQuality}` : ""}</span> : null}
                    </span>
                    <span className="dd-urow__seen">{timeAgo(p.lastAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Latest activity">
            <ul className="dd-feed" role="list">
              {detail.recent.length === 0 ? <li className="dd-sub dd-empty">Nothing yet this week.</li> : null}
              {detail.recent.map((e, i) => (
                <li key={`${e.at}-${i}`} data-kind={e.kind}>
                  <span className="dd-feed__dot" aria-hidden="true" />
                  <button type="button" className="dd-feed__who" onClick={() => onOpenUser(e.userId)}>{e.displayName ?? e.email}</button>
                  <span className="dd-feed__what">{describeEvent(e)}</span>
                  <span className="dd-feed__when">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : detailMissing ? (
        <p className="dd-sub dd-empty">The per-day and per-person detail needs the newer backend. The numbers above are still live.</p>
      ) : null}

      {summary.externalPlayer ? <ExternalPlayerSection data={summary.externalPlayer} /> : null}
    </div>
  );
}

/** Seven small stacked columns: popups, lists opened and files pressed on each day. */
function DayChart({ days }: { days: DownloadDetail["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.popups + d.opens + d.files));
  return (
    <>
      <div className="dd-days" role="img" aria-label={`Download activity for the last ${days.length} days`}>
        {days.map((d) => {
          const total = d.popups + d.opens + d.files;
          const h = (n: number) => `${(n / max) * 100}%`;
          return (
            <div key={d.date} className="dd-day" title={`${formatDay(d.date)}: ${d.popups} popups, ${d.opens} lists opened, ${d.files} files`}>
              <span className="dd-day__n">{total || ""}</span>
              <span className="dd-day__col">
                <i style={{ height: h(d.files), background: "var(--cyan)" }} />
                <i style={{ height: h(d.opens), background: "var(--blue)" }} />
                <i style={{ height: h(d.popups), background: "var(--violet)" }} />
              </span>
              <span className="dd-day__d">{formatDay(d.date)}</span>
            </div>
          );
        })}
      </div>
      <div className="dd-pills dd-daylegend">
        <span className="dd-tag"><i className="dd-swatch" style={{ background: "var(--violet)" }} /> Plus popup</span>
        <span className="dd-tag"><i className="dd-swatch" style={{ background: "var(--blue)" }} /> File list opened</span>
        <span className="dd-tag"><i className="dd-swatch" style={{ background: "var(--cyan)" }} /> File pressed</span>
      </div>
    </>
  );
}
