import { useEffect, useState } from "react";
import { MdClose, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatDuration } from "../../domain/stats";
import { routes } from "../../lib/routes";
import { nudgeDue, useCanOfferPlus, usePlusNudge } from "../../state/plusNudge";
import { useWatchStats } from "../../state/watchStats";
import { ArcButton } from "../components/Buttons";

/** Wait this long after the end for the just-finished watch to reach the history before reading it. */
const READ_AFTER_MS = 1500;
/** Not worth mentioning below this much watching in 30 days. */
const MIN_MS = 60 * 60 * 1000;

/**
 * Shown over the player when a movie or the last episode of a show ends, to someone without Plus: the hours they really watched in the
 * last 30 days and one line about what Plus adds. Rare by design (see `nudgeDue`), never for a kids profile, and it needs a real number
 * worth saying, otherwise it stays away. "Not now" and leaving both just close it.
 */
export function PlusEndCard() {
  const canOffer = useCanOfferPlus();
  const due = usePlusNudge((s) => s.userId !== null && nudgeDue(s, "watch-end"));
  const [read, setRead] = useState(false);
  const [hidden, setHidden] = useState(false);
  const navigate = useNavigate();
  const eligible = canOffer && due;
  useEffect(() => {
    if (!eligible) return undefined;
    const timer = window.setTimeout(() => setRead(true), READ_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [eligible]);
  const state = useWatchStats(eligible && read);
  const show = eligible && read && !hidden && state.kind === "ready" && !state.stats.empty && state.stats.last30DaysMs >= MIN_MS;
  useEffect(() => {
    if (show) usePlusNudge.getState().markShown("watch-end");
  }, [show]);
  if (!show || state.kind !== "ready") return null;
  const streak = state.stats.streakDays >= 3 ? ` That's a ${state.stats.streakDays}-day streak.` : "";
  return (
    <div className="pupnext pplusend" role="region" aria-label="ArcTV Plus">
      <div className="t-title-md">You've watched {formatDuration(state.stats.last30DaysMs)} in the last 30 days.{streak}</div>
      <p className="t-body-sm c-text-2" style={{ margin: "6px 0 0" }}>ArcTV Plus shows your full stats and picks what to watch next.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <ArcButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} variant="light" compact onClick={() => navigate(routes.settings("plus"))} />
        <ArcButton text="Not now" icon={<MdClose />} compact onClick={() => setHidden(true)} />
      </div>
    </div>
  );
}
