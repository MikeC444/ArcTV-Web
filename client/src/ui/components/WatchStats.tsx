import type { ReactNode } from "react";
import { MdAvTimer, MdBarChart, MdCalendarMonth, MdDateRange, MdLocalFireDepartment, MdLock, MdMovie, MdTrendingDown, MdTrendingFlat, MdTrendingUp, MdTv, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatDuration, formatShort, heatCells, WEEKDAYS, weekChange, type WatchStats as Stats } from "../../domain/stats";
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
  const change = weekChange(stats.last7DaysMs, stats.prev7DaysMs);
  const cells = heatCells(stats.dailyMs);
  const split = stats.movieMs + stats.showMs;
  const moviePct = split > 0 ? Math.round((stats.movieMs / split) * 100) : 0;
  return (
    <>
      <div className="stats__hero">
        <div className="t-label-md c-text-3">You've watched</div>
        <div className="stats__big">{formatDuration(stats.totalMs)}</div>
        <div className="stats__herorow">
          {since ? <span className="t-label-md c-text-2">since {since}</span> : null}
          {change ? (
            <span className="stats__chip" data-direction={change.direction}>
              {change.direction === "up" ? <MdTrendingUp aria-hidden="true" /> : change.direction === "down" ? <MdTrendingDown aria-hidden="true" /> : <MdTrendingFlat aria-hidden="true" />}
              {change.direction === "same" ? "Same as last week" : `${change.percent}% ${change.direction === "up" ? "more" : "less"} than last week`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="stats__tiles">
        <Tile icon={<MdDateRange />} label="Last 7 days" value={formatDuration(stats.last7DaysMs)} />
        <Tile icon={<MdCalendarMonth />} label="Last 30 days" value={formatDuration(stats.last30DaysMs)} />
        <Tile icon={<MdLocalFireDepartment />} label="Day streak" value={pluralize(stats.streakDays, "day")} note={stats.longestStreakDays > stats.streakDays ? `best ${stats.longestStreakDays}` : stats.streakDays > 0 && stats.streakDays === stats.longestStreakDays ? "your best" : undefined} hot={stats.streakDays >= 3} />
        <Tile icon={<MdAvTimer />} label="Per day you watch" value={formatDuration(stats.avgPerActiveDayMs)} note={`${pluralize(stats.activeDays, "day")} in all`} />
        <Tile icon={<MdMovie />} label="Movies finished" value={String(stats.moviesFinished)} />
        <Tile icon={<MdTv />} label="Episodes watched" value={String(stats.episodesWatched)} note={stats.showsWatched > 0 ? `across ${pluralize(stats.showsWatched, "show")}` : undefined} />
      </div>

      {split > 0 ? (
        <>
          <h4 className="t-label-lg stats__sub">Movies or shows</h4>
          <div className="stats__split" role="img" aria-label={`${moviePct}% of your time is movies, ${100 - moviePct}% is shows`}>
            <span className="stats__splitfill" style={{ width: `${moviePct}%` }} />
          </div>
          <div className="stats__splitkey t-label-md">
            <span><i className="stats__dot stats__dot--movies" /> Movies {formatDuration(stats.movieMs)} · {moviePct}%</span>
            <span><i className="stats__dot stats__dot--shows" /> Shows {formatDuration(stats.showMs)} · {100 - moviePct}%</span>
          </div>
        </>
      ) : null}

      <h4 className="t-label-lg stats__sub">Last 13 weeks</h4>
      <div className="stats__heatwrap">
        <ol className="stats__heatdays t-label-sm c-text-3" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <li key={i}>{d}</li>)}
        </ol>
        <ol className="stats__heat" aria-label="Time watched each day over the last 13 weeks">
          {cells.map((c, i) => (c.ms === null ? <li key={i} className="stats__cell stats__cell--blank" /> : <li key={i} className="stats__cell" data-level={c.level} title={`${c.label}: ${c.ms > 0 ? formatDuration(c.ms) : "nothing watched"}`} />))}
        </ol>
      </div>
      <div className="stats__legend t-label-sm c-text-3" aria-hidden="true">
        Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className="stats__cell stats__cell--key" data-level={l} />)} More
      </div>

      <h4 className="t-label-lg stats__sub">Busiest day{stats.busiestWeekday != null ? `: ${WEEKDAYS[stats.busiestWeekday]}` : ""}</h4>
      <ul className="stats__bars" aria-label="Time watched by day of the week">
        {WEEKDAYS.map((day, i) => (
          <li key={day} className="stats__bar" data-peak={i === stats.busiestWeekday ? "true" : undefined}>
            <span className="t-label-sm stats__barval">{formatShort(stats.byWeekdayMs[i]!)}</span>
            <span className="stats__barbox">
              <span className="stats__barfill" style={{ height: `${Math.max(4, Math.round((stats.byWeekdayMs[i]! / peak) * 100))}%` }} title={`${day}: ${formatDuration(stats.byWeekdayMs[i]!)}`} />
            </span>
            <span className="t-label-sm c-text-3">{day.slice(0, 3)}</span>
          </li>
        ))}
      </ul>

      <p className="t-label-sm c-text-3" style={{ margin: "14px 0 0" }}>
        Counted from your watch history{truncated ? " (the most recent part of it)" : ""}. A title you watch again counts once, on the day you last watched it.
      </p>
    </>
  );
}

function Tile({ icon, label, value, note, hot }: { icon: ReactNode; label: string; value: string; note?: string; hot?: boolean }) {
  return (
    <div className="stats__tile" data-hot={hot ? "true" : undefined}>
      <div className="t-label-sm c-text-3 stats__tilehead">
        <span className="stats__tileicon" aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div className="t-title-lg stats__value">{value}</div>
      {note ? <div className="t-label-sm c-text-3">{note}</div> : null}
    </div>
  );
}
