import { percent } from "../../lib/downloadStats";
import type { AdminSummary } from "../../state/admin";
import { DownloadStats } from "../components/DownloadStats";
import { ExternalPlayerSection } from "./ExternalPlayers";
import { Card } from "./Primitives";

/** Downloads (a funnel from "tried" to "pressed a file", then the details) and the other-player hand-offs. */
export function DownloadsView({ summary }: { summary: AdminSummary }) {
  const dl = summary.downloads;
  const steps: Array<[string, number]> = dl
    ? [["Tried", dl.triedPeople], ["Saw the Plus popup", dl.popupPeople], ["Opened the panel", dl.openedPeople], ["Pressed a file", dl.startedPeople]]
    : [];
  return (
    <div className="dd-scroll dd-cols">
      <div className="dd-colstack">
        {dl && dl.triedPeople > 0 ? (
          <Card title="Funnel · people, last 7 days">
            <ul className="dd-funnel dd-funnel--big">
              {steps.map(([label, n]) => (
                <li key={label}>
                  <em>{label}</em>
                  <span className="dd-funnel__b" style={{ width: `${Math.max(12, percent(n, dl.triedPeople))}%` }}>{n}</span>
                  <small>{percent(n, dl.triedPeople)}%</small>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {dl ? <DownloadStats data={dl} /> : <p className="dd-sub dd-empty">Downloads need the newer backend.</p>}
      </div>
      <div className="dd-colstack dd-wide">
        {summary.externalPlayer ? <ExternalPlayerSection data={summary.externalPlayer} /> : <p className="dd-sub dd-empty">Other players need the newer backend.</p>}
      </div>
    </div>
  );
}
