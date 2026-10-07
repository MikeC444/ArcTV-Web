import { MdBarChart, MdLock, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatDuration, WEEKDAYS, type WatchStats as Stats } from "../../domain/stats";
import { pluralize } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useHasPlus } from "../../state/plusAccess";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { useWatchStats } from "../../state/watchStats";
import { MangoButton } from "./Buttons";
import { Spinner } from "./States";

/** Settings → Account → Your stats: an ArcTV Plus feature, read from the watch history of the profile in use. Others see what it is and where to get it. */
export function WatchStats() {
  const plus = useHasPlus();
  const profileId = useProfiles((s) => (s.supported && s.plus ? activeProfileOf(s)?.id ?? null : null));
  const state = useWatchStats(plus, profileId);
  const navigate = useNavigate();
  return (
    <section className="stats" aria-label="Your stats">
      <h3 className="t-title-md stats__title">
        <MdBarChart aria-hidden="true" /> Your stats
      </h3>
      {!plus ? (
        <div className="stats__locked">
          <MdLock aria-hidden="true" />
          <p className="t-body-sm c-text-2" style={{ margin: 0 }}>See how much you watch, your busiest day, your streak and your most-watched titles. Your stats come with ArcTV Plus.</p>
          <MangoButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={() => navigate(routes.settings("plus"))} />
        </div>
      ) : state.kind === "loading" ? (
        <Spinner />
      ) : state.kind === "error" ? (
        <p className="t-body-sm c-text-2">Couldn't read your watch history right now. Try again in a moment.</p>
      ) : (
        <StatsBody stats={state.stats} truncated={state.truncated} />
      )}
    </section>
  );
}

export function StatsBody({ stats, truncated }: { stats: Stats; truncated: boolean }) {
  if (stats.empty) return <p className="t-body-sm c-text-2">Nothing here yet. Watch something and your stats will appear.</p>;
  const peak = Math.max(...stats.byWeekdayMs, 1);
  const since = stats.firstWatchedAt ? new Date(stats.firstWatchedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
  return (
    <>
      <div className="stats__tiles">
        <Tile label="Total watched" value={formatDuration(stats.totalMs)} note={since ? `since ${since}` : undefined} />
        <Tile label="Last 7 days" value={formatDuration(stats.last7DaysMs)} />
        <Tile label="Last 30 days" value={formatDuration(stats.last30DaysMs)} />
        <Tile label="Day streak" value={pluralize(stats.streakDays, "day")} note={stats.longestStreakDays > stats.streakDays ? `best ${stats.longestStreakDays}` : undefined} />
        <Tile label="Movies finished" value={String(stats.moviesFinished)} />
        <Tile label="Episodes watched" value={String(stats.episodesWatched)} note={stats.showsWatched > 0 ? `across ${pluralize(stats.showsWatched, "show")}` : undefined} />
      </div>

      <h4 className="t-label-lg stats__sub">
        Busiest day{stats.busiestWeekday != null ? `: ${WEEKDAYS[stats.busiestWeekday]}` : ""}
      </h4>
      <ul className="stats__bars" aria-label="Time watched by day of the week">
        {WEEKDAYS.map((day, i) => (
          <li key={day} className="stats__bar" data-peak={i === stats.busiestWeekday ? "true" : undefined}>
            <span className="stats__barfill" style={{ height: `${Math.max(4, Math.round((stats.byWeekdayMs[i]! / peak) * 100))}%` }} title={`${day}: ${formatDuration(stats.byWeekdayMs[i]!)}`} />
            <span className="t-label-sm c-text-3">{day.slice(0, 3)}</span>
          </li>
        ))}
      </ul>

      {stats.topTitles.length > 0 ? (
        <>
          <h4 className="t-label-lg stats__sub">Most watched</h4>
          <ol className="stats__top">
            {stats.topTitles.map((t, i) => (
              <li key={`${t.title}-${i}`} className="stats__toprow">
                <span className="stats__rank">{i + 1}</span>
                <span className="t-body-md stats__name">{t.title}</span>
                <span className="t-label-md c-text-2">
                  {formatDuration(t.watchedMs)}
                  {t.type === "TV_SHOW" && t.parts > 1 ? ` · ${pluralize(t.parts, "episode")}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <p className="t-label-sm c-text-3" style={{ margin: "12px 0 0" }}>
        Counted from your watch history{truncated ? " (the most recent part of it)" : ""}. A title you watch again counts once, on the day you last watched it.
      </p>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stats__tile">
      <div className="t-label-sm c-text-3">{label}</div>
      <div className="t-title-lg stats__value">{value}</div>
      {note ? <div className="t-label-sm c-text-3">{note}</div> : null}
    </div>
  );
}

