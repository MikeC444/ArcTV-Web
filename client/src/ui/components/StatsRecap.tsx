import { recapOf } from "../../domain/recap";
import type { WatchStats } from "../../domain/stats";

/** A short summary of the stats: total hours, top show and movie, longest streak and counts. */
export function StatsRecap({ stats }: { stats: WatchStats }) {
  const recap = recapOf(stats);
  if (!recap) return null;
  return (
    <div className="stats__recap">
      <div className="t-title-md">{recap.heading}</div>
      <div className="stats__recaphours">{recap.hours}</div>
      <ul className="stats__recaplines t-body-sm c-text-2">
        {recap.lines.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}
