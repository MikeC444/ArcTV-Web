import type { AdminSummary } from "../../state/admin";
import { PlaybackHealth } from "../components/PlaybackHealth";

/** Playback health, full size: how viewings of the last 7 days ended, split by device, player and quality. */
export function PlaybackView({ summary }: { summary: AdminSummary }) {
  return (
    <div className="dd-scroll">
      {summary.playback ? <PlaybackHealth data={summary.playback} /> : <p className="dd-sub dd-empty">Playback health needs the newer backend.</p>}
    </div>
  );
}
