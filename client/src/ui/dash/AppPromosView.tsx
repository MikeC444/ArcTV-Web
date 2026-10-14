import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_LABEL, describePromoEvent, OUTCOME_LABEL, type AppPromoDetail, type AppPromoPerson, type PromoApp, type PromoKind } from "../../lib/appPromoStats";
import { percent } from "../../lib/downloadStats";
import { formatDay } from "../../lib/growth";
import { timeAgo } from "../../lib/format";
import { fetchAppPromoDetail, type AdminSummary } from "../../state/admin";
import { Card, Stat } from "./Primitives";

const REFRESH_MS = 30_000;
type Filter = "all" | PromoApp;
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Both apps" },
  { id: "windows", label: "Windows app" },
  { id: "mac", label: "Mac app" },
];

const initial = (p: Pick<AppPromoPerson, "email" | "displayName">) => (p.displayName ?? p.email).trim().charAt(0).toUpperCase() || "?";

/**
 * App popups: the one-time "Arc TV is on your Mac / PC" popups the web app shows to signed-in people on a Mac or Windows browser. Per app: how many
 * people were shown it, how many pressed Get the app (the download starts straight away) and how many closed it. The web app cannot see whether the
 * download finished or the app was ever run.
 */
export function AppPromosView({ summary, onOpenUser }: { summary: AdminSummary; onOpenUser(id: string): void }) {
  const totals = summary.appPromos;
  const [detail, setDetail] = useState<AppPromoDetail | null>(null);
  const [detailMissing, setDetailMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setDetail(await fetchAppPromoDetail());
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

  const people = useMemo(() => (detail?.people ?? []).filter((p) => filter === "all" || p.app === filter), [detail, filter]);

  if (!totals) return <div className="dd-scroll"><p className="dd-sub dd-empty">App popups need the newer backend.</p></div>;

  return (
    <div className="dd-scroll">
      <p className="dd-sub dd-intro">
        Web app only, last 7 days. Signed-in people on a Mac browser or a Windows browser see a one-time popup offering the matching app. <b>Get the app</b> starts the download straight away;
        we can't see whether it finished or the app was ever run. Someone who closes it is not shown it again.
      </p>

      <div className="dd-stats dd-stats--help">
        {(["windows", "mac"] as const).map((app) => {
          const t = totals.find((x) => x.app === app) ?? { app, shownPeople: 0, downloadPeople: 0, closedPeople: 0, shown: 0, downloads: 0, closes: 0 };
          return (
            <Card key={app}>
              <Stat label={`${APP_LABEL[app]}: shown to`} value={t.shownPeople} note={`${t.shown} ${t.shown === 1 ? "time" : "times"}`} />
              <p className="dd-help">
                <b>{t.downloadPeople}</b> pressed Get the app ({percent(t.downloadPeople, t.shownPeople)}% of those shown it) · <b>{t.closedPeople}</b> closed it ({percent(t.closedPeople, t.shownPeople)}%).
              </p>
            </Card>
          );
        })}
      </div>

      {detail ? (
        <>
          <Card title="Day by day">
            <div className="dd-days" role="img" aria-label={`App popups for the last ${detail.days.length} days`}>
              {(() => {
                const max = Math.max(1, ...detail.days.map((d) => d.mac.shown + d.windows.shown));
                return detail.days.map((d) => {
                  const shown = d.mac.shown + d.windows.shown;
                  const pressed = d.mac.downloads + d.windows.downloads;
                  return (
                    <div key={d.date} className="dd-day" title={`${formatDay(d.date)}: Windows ${d.windows.shown} shown, ${d.windows.downloads} pressed; Mac ${d.mac.shown} shown, ${d.mac.downloads} pressed`}>
                      <span className="dd-day__n">{shown || ""}</span>
                      <span className="dd-day__col">
                        <i style={{ height: `${(pressed / max) * 100}%`, background: "var(--cyan)" }} />
                        <i style={{ height: `${((shown - pressed) / max) * 100}%`, background: "var(--violet)" }} />
                      </span>
                      <span className="dd-day__d">{formatDay(d.date)}</span>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="dd-pills dd-daylegend">
              <span className="dd-tag"><i className="dd-swatch" style={{ background: "var(--violet)" }} /> Shown, did not press it</span>
              <span className="dd-tag"><i className="dd-swatch" style={{ background: "var(--cyan)" }} /> Pressed Get the app</span>
            </div>
          </Card>

          <Card title={`Who was offered the app (${detail.people.length})`}>
            <div className="dd-chips" role="group" aria-label="Filter people">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="dd-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}{f.id === "all" ? ` ${detail.people.length}` : ` ${detail.people.filter((p) => p.app === f.id).length}`}
                </button>
              ))}
            </div>
            <ul className="dd-urows dd-dlpeople" role="list">
              {people.length === 0 ? <li className="dd-sub dd-empty">Nobody in this group yet.</li> : null}
              {people.map((p) => (
                <li key={`${p.userId}-${p.app}`}>
                  <button type="button" className="dd-urow dd-dlrow" onClick={() => onOpenUser(p.userId)} aria-label={`Open ${p.email}`}>
                    <span className="dd-avatar">{initial(p)}</span>
                    <span className="dd-urow__who"><b className="ellipsis">{p.email}</b><i className="ellipsis">{p.displayName ?? "No name"}</i></span>
                    <span className="dd-tag">{APP_LABEL[p.app]}</span>
                    <span className="dd-dlstatus" data-status={statusOf(p.outcome)}>{OUTCOME_LABEL[p.outcome]}</span>
                    <span className="dd-urow__seen">{timeAgo(p.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Latest activity">
            <ul className="dd-feed" role="list">
              {detail.recent.length === 0 ? <li className="dd-sub dd-empty">Nothing yet this week.</li> : null}
              {detail.recent.map((e, i) => (
                <li key={`${e.at}-${i}`} data-kind={e.kind === "download" ? "file" : e.kind === "closed" ? "popup" : "opened"}>
                  <span className="dd-feed__dot" aria-hidden="true" />
                  <button type="button" className="dd-feed__who" onClick={() => onOpenUser(e.userId)}>{e.displayName ?? e.email}</button>
                  <span className="dd-feed__what">{describePromoEvent(e)}</span>
                  <span className="dd-feed__when">{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : detailMissing ? (
        <p className="dd-sub dd-empty">The per-day and per-person detail needs the newer backend. The numbers above are still live.</p>
      ) : null}
    </div>
  );
}

/** Reuses the Downloads view's colours: pressed is the good one, closed the quiet one. */
const statusOf = (outcome: PromoKind): string => (outcome === "download" ? "downloaded" : outcome === "closed" ? "blocked" : "opened");
