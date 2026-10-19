import { useCallback, useEffect, useState } from "react";
import { platformName } from "../../lib/dash";
import { timeAgo } from "../../lib/format";
import { fetchCrashes, type CrashDetail, type CrashReport } from "../../state/admin";
import { Spinner } from "../components/States";
import { Card, Stat } from "./Primitives";

const KIND_LABEL: Record<string, string> = {
  crash: "Crash",
  native_crash: "Native crash",
  anr: "Froze (ANR)",
  low_memory: "Out of memory",
  other_exit: "Closed by the system",
};
export const crashKindLabel = (kind: string): string => KIND_LABEL[kind] ?? kind;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const DAY_MS = 86_400_000;

function ReportBody({ report }: { report: CrashReport }) {
  return (
    <div className="dd-crash__body">
      <p className="dd-sub">
        {platformName(report.platform)} {report.appVersion} · {[report.deviceModel, report.osVersion].filter(Boolean).join(" · ") || "device not known"} · happened {new Date(report.happenedAt).toLocaleString()}
      </p>
      <pre className="dd-crash__trace">{report.stackTrace}</pre>
    </div>
  );
}

/**
 * Crash reports the apps send the next time they open: grouped by where they happened (last 30 days) with how often, for how many people,
 * on which versions and devices; then the latest single reports with their full trace. Read-only; refreshes when opened.
 */
export function CrashesView({ onOpenUser }: { onOpenUser(id: string): void }) {
  const [data, setData] = useState<CrashDetail | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await fetchCrashes());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return error ? <p className="dash__error" role="alert">Couldn't load crash reports. The backend may need redeploying.</p> : <Spinner />;
  const total = data.groups.reduce((n, g) => n + g.count, 0);
  const people = new Set(data.recent.filter((r) => r.userId).map((r) => r.userId)).size;
  const lastDay = data.recent.filter((r) => Date.now() - Date.parse(r.createdAt) < DAY_MS).length;
  const latestOf = new Map<string, CrashReport>();
  for (const r of data.recent) if (!latestOf.has(r.signature)) latestOf.set(r.signature, r);

  return (
    <div className="dd-scroll">
      <p className="dd-sub dd-intro">The apps keep what went wrong when they close unexpectedly and send it here the next time they open. Nobody is shown anything, and nothing is emailed.</p>
      <div className="dd-stats">
        <Card><Stat label="Crashes, last 30 days" value={total} note={plural(data.groups.length, "different problem", "different problems")} tone={total > 0 ? "warn" : undefined} /></Card>
        <Card><Stat label="Last 24 hours" value={lastDay} note="reports received" /></Card>
        <Card><Stat label="Signed-in people" value={people} note={`in the latest ${data.recent.length} reports`} /></Card>
      </div>
      <Card title="By problem" aside={<span className="dd-tag">last 30 days</span>}>
        {data.groups.length === 0 ? (
          <p className="dd-sub dd-empty">No crashes reported. This fills in when an app that closed unexpectedly is opened again.</p>
        ) : (
          <ul className="dd-crashes" role="list">
            {data.groups.map((g) => {
              const latest = latestOf.get(g.signature);
              return (
                <li key={g.signature}>
                  <details className="dd-crash">
                    <summary>
                      <span className="dd-tag" data-kind={g.kind}>{crashKindLabel(g.kind)}</span>
                      <b className="dd-crash__what ellipsis">{g.exception ?? "No message"}</b>
                      <span className="dd-crash__count">{plural(g.count, "time", "times")} · {plural(g.people, "person", "people")}</span>
                      <span className="dd-crash__when">{timeAgo(g.lastAt)}</span>
                    </summary>
                    <p className="dd-sub">
                      First {timeAgo(g.firstAt)} · {g.versions.map((v) => v.replace(/^(\S+)/, (p) => platformName(p))).join(", ") || "version not known"}
                      {g.devices.length ? ` · ${g.devices.join(", ")}` : ""}
                    </p>
                    {latest ? <ReportBody report={latest} /> : <p className="dd-sub">The trace is with the older reports (not in the latest {data.recent.length}).</p>}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="Latest reports">
        {data.recent.length === 0 ? (
          <p className="dd-sub dd-empty">Nothing yet.</p>
        ) : (
          <ul className="dd-crashes" role="list">
            {data.recent.map((r) => (
              <li key={r.id}>
                <details className="dd-crash">
                  <summary>
                    <span className="dd-tag" data-kind={r.kind}>{crashKindLabel(r.kind)}</span>
                    <b className="dd-crash__what ellipsis">{r.exception ?? "No message"}</b>
                    <span className="dd-crash__count">{platformName(r.platform)} {r.appVersion}{r.deviceModel ? ` · ${r.deviceModel}` : ""}</span>
                    <span className="dd-crash__when">{timeAgo(r.createdAt)}</span>
                  </summary>
                  {r.userId ? (
                    <p className="dd-sub">From <button type="button" className="dd-linkbtn" onClick={() => onOpenUser(r.userId!)}>{r.email ?? "this person"}</button></p>
                  ) : (
                    <p className="dd-sub">Not signed in when it was sent.</p>
                  )}
                  <ReportBody report={r} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {error ? <p className="dash__error" role="alert">Couldn't refresh. Showing the last reports.</p> : null}
    </div>
  );
}
