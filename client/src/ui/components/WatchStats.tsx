import { useState, type ReactNode } from "react";
import { MdAvTimer, MdCalendarMonth, MdClose, MdDateRange, MdHistory, MdLocalFireDepartment, MdLock, MdMovie, MdRestartAlt, MdTrendingDown, MdTrendingFlat, MdTrendingUp, MdTv, MdWorkspacePremium } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { formatDuration, formatShort, heatCells, heatMax, heatMonthLabels, streakNote, WEEKDAYS, weekChange, weekdayLine, type WatchStats as Stats } from "../../domain/stats";
import { pluralize } from "../../lib/format";
import { routes } from "../../lib/routes";
import { useHasPlus } from "../../state/plusAccess";
import { useCanOfferPlus } from "../../state/plusNudge";
import { useSettings } from "../../state/settings";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { useWatchStats } from "../../state/watchStats";
import { ArcButton } from "./Buttons";
import { Spinner } from "./States";
import { StatsRecap } from "./StatsRecap";

/** Settings → Account → Your stats: an ArcTV Plus feature, read from the watch history of the profile in use. Others see what it is and where to get it. */
export function WatchStats() {
  const plus = useHasPlus();
  const profileId = useProfiles((s) => (s.supported && s.plus ? activeProfileOf(s)?.id ?? null : null));
  // Without Plus (and with the paywall on) the person's own history is still read, to show them a taste of what they would get.
  const offer = useCanOfferPlus();
  const state = useWatchStats(plus || offer, profileId);
  const navigate = useNavigate();
  return (
    <div className="stats">
      {!plus && offer && state.kind === "ready" && !state.stats.empty ? (
        <StatsPreview stats={state.stats} truncated={state.truncated} onGo={() => navigate(routes.settings("plus"))} />
      ) : !plus ? (
        <div className="stats__locked">
          <MdLock aria-hidden="true" />
          <p className="t-body-md" style={{ margin: 0 }}><strong>Your stats are only for ArcTV Plus.</strong></p>
          <p className="t-body-sm c-text-2" style={{ margin: 0 }}>See how much you watch, how this week compares, your streak, a map of your last 13 weeks and your busiest day.</p>
          <ArcButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={() => navigate(routes.settings("plus"))} />
        </div>
      ) : state.kind === "loading" ? (
        <Spinner />
      ) : state.kind === "error" ? (
        <p className="t-body-sm c-text-2">Couldn't read your watch history right now. Try again in a moment.</p>
      ) : (
        <>
          <StatsBody stats={state.stats} truncated={state.truncated} />
          <StatsReset />
        </>
      )}
    </div>
  );
}

/**
 * Starts Your stats again from now, on every device (the time is kept with the account's settings), after one question. Nothing is deleted: the watch
 * history, Continue Watching and the watched ticks stay, and "Show all my history again" brings the old numbers back.
 */
function StatsReset() {
  const resetAt = useSettings((s) => s.statsResetAt);
  const setResetAt = useSettings((s) => s.setStatsResetAt);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const since = resetAt && Number.isFinite(Date.parse(resetAt)) ? new Date(resetAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <div className="stats__reset">
      {since ? <p className="t-body-sm c-text-2" style={{ margin: "0 0 10px" }}>Counting from {since}. Your older history is kept.</p> : null}
      {asking ? (
        <div className="stats__resetask" role="group" aria-label="Reset your stats">
          <p className="t-body-md" style={{ margin: 0 }}><strong>Start your stats again from today?</strong></p>
          <p className="t-body-sm c-text-2" style={{ margin: "4px 0 10px" }}>This is the same on all your devices. Your watch history, Continue Watching and watched ticks stay as they are, and you can bring the old numbers back any time.</p>
          <div className="stats__recapactions">
            <ArcButton
              text="Yes, reset"
              icon={<MdRestartAlt />}
              compact
              dataAttrs={{ autofocus: true }}
              onClick={() => {
                setResetAt(new Date().toISOString());
                setAsking(false);
                setNote("Your stats were reset. They count from today.");
              }}
            />
            <ArcButton text="Cancel" compact icon={<MdClose />} onClick={() => setAsking(false)} />
          </div>
        </div>
      ) : (
        <div className="stats__recapactions">
          <ArcButton text="Reset stats" icon={<MdRestartAlt />} compact onClick={() => { setNote(""); setAsking(true); }} />
          {resetAt ? (
            <ArcButton
              text="Show all my history again"
              icon={<MdHistory />}
              compact
              onClick={() => {
                setResetAt(null);
                setNote("Showing all your history again.");
              }}
            />
          ) : null}
        </div>
      )}
      <p className="t-label-sm c-text-3" role="status" style={{ margin: "8px 0 0" }}>{note}</p>
    </div>
  );
}

/**
 * What someone without Plus sees: their real last-30-days hours and streak in plain text, and the rest of their stats blurred behind
 * a button. The blurred part is decoration only (hidden from screen readers and not clickable); the plain numbers say it all.
 */
function StatsPreview({ stats, truncated, onGo }: { stats: Stats; truncated: boolean; onGo(): void }) {
  return (
    <div className="stats__preview">
      <div className="stats__hero">
        <div className="t-label-md c-text-3">In the last 30 days you've watched</div>
        <div className="stats__big">{formatDuration(stats.last30DaysMs)}</div>
        {stats.streakDays >= 2 ? <div className="t-label-md c-text-2">{stats.streakDays}-day streak going</div> : null}
      </div>
      <div className="stats__blurwrap">
        <div className="stats__blur" aria-hidden="true" {...({ inert: "" } as Record<string, string>)}>
          <StatsBody stats={stats} truncated={truncated} />
        </div>
        <div className="stats__unlock">
          <MdLock aria-hidden="true" />
          <p className="t-body-md" style={{ margin: 0 }}><strong>There's more to your stats.</strong></p>
          <p className="t-body-sm c-text-2" style={{ margin: 0 }}>ArcTV Plus unlocks how this week compares, your busiest day and a map of your last 13 weeks.</p>
          <ArcButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={onGo} />
        </div>
      </div>
    </div>
  );
}

export function StatsBody({ stats, truncated }: { stats: Stats; truncated: boolean }) {
  const [picked, setPicked] = useState<number | null>(null); // the day last pointed at or tapped in the activity grid
  if (stats.empty) return <p className="t-body-sm c-text-2">Nothing here yet. Watch something and your stats will appear.</p>;
  const peak = Math.max(...stats.byWeekdayMs, 1);
  const since = stats.firstWatchedAt ? new Date(stats.firstWatchedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
  const change = weekChange(stats.last7DaysMs, stats.prev7DaysMs);
  const cells = heatCells(stats.dailyMs);
  const split = stats.movieMs + stats.showMs;
  const moviePct = split > 0 ? Math.round((stats.movieMs / split) * 100) : 0;
  const monthChange = weekChange(stats.last30DaysMs, stats.prev30DaysMs);
  const months = heatMonthLabels(cells);
  const darkest = heatMax(stats.dailyMs);
  const today = (new Date().getDay() + 6) % 7;
  const period = truncated ? "your recent history" : "all time";
  const pickedCell = picked !== null ? cells[picked] : undefined;
  const topPicks = [stats.topShow, stats.topMovie].filter((t): t is NonNullable<typeof t> => t !== null);
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
        <Tile icon={<MdCalendarMonth />} label="Last 30 days" value={formatDuration(stats.last30DaysMs)} note={monthChange ? (monthChange.direction === "same" ? "same as the 30 days before" : `${monthChange.percent}% ${monthChange.direction === "up" ? "more" : "less"} than the 30 days before`) : undefined} />
        <Tile icon={<MdLocalFireDepartment />} label="Day streak" value={pluralize(stats.streakDays, "day")} note={streakNote(stats.streakDays, stats.longestStreakDays) ?? undefined} hot={stats.streakDays >= 3} />
        <Tile icon={<MdAvTimer />} label="On days you watch" value={formatDuration(stats.avgPerActiveDayMs)} note={`${pluralize(stats.activeDays, "day")} watched`} />
        <Tile icon={<MdMovie />} label="Movies finished" value={String(stats.moviesFinished)} />
        <Tile icon={<MdTv />} label="Episodes watched" value={String(stats.episodesWatched)} note={stats.showsWatched > 0 ? `across ${pluralize(stats.showsWatched, "show")}` : undefined} />
      </div>

      {split > 0 ? (
        <>
          <h3 className="t-label-lg stats__sub">Movies or shows <span className="stats__period">· {period}</span></h3>
          <div className="stats__split" role="img" aria-label={`${moviePct}% of your time is movies, ${100 - moviePct}% is shows`}>
            <span className="stats__splitfill" style={{ width: `${moviePct}%` }} />
          </div>
          <div className="stats__splitkey t-label-md">
            <span><i className="stats__dot stats__dot--movies" /> Movies {formatDuration(stats.movieMs)} · {moviePct}%</span>
            <span><i className="stats__dot stats__dot--shows" /> Shows {formatDuration(stats.showMs)} · {100 - moviePct}%</span>
          </div>
        </>
      ) : null}

      <h3 className="t-label-lg stats__sub">Last 13 weeks</h3>
      <div className="stats__heatwrap" tabIndex={0} role="group" aria-label="Activity grid, scrolls sideways on a narrow screen">
        <ol className="stats__heatdays t-label-sm c-text-3" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => <li key={i}>{d}</li>)}
        </ol>
        <div className="stats__heatcol">
          <ol className="stats__heatmonths t-label-sm c-text-3" aria-hidden="true">
            {months.map((m, i) => <li key={i}>{m}</li>)}
          </ol>
          <ol className="stats__heat" aria-label="Time watched each day over the last 13 weeks">
            {cells.map((c, i) =>
              c.ms === null ? (
                <li key={i} className="stats__cell stats__cell--blank" />
              ) : (
                <li key={i} className="stats__cell" data-level={c.level} data-picked={picked === i ? "true" : undefined} title={`${c.label}: ${c.ms > 0 ? formatDuration(c.ms) : "nothing watched"}`} onClick={() => setPicked(i)} onMouseEnter={() => setPicked(i)} />
              ),
            )}
          </ol>
        </div>
      </div>
      <p className="t-label-md stats__readout" role="status">
        {pickedCell && pickedCell.ms !== null ? `${pickedCell.label} · ${pickedCell.ms > 0 ? formatDuration(pickedCell.ms) : "nothing watched"}` : "Tap or point at a square to see that day."}
      </p>
      <div className="stats__legend t-label-sm c-text-3" aria-hidden="true">
        Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className="stats__cell stats__cell--key" data-level={l} />)} More{darkest > 0 ? ` · the darkest is ${formatDuration(darkest)} in a day` : ""}
      </div>

      <h3 className="t-label-lg stats__sub">Busiest day{stats.busiestWeekday != null ? `: ${WEEKDAYS[stats.busiestWeekday]}` : ""} <span className="stats__period">· {period}</span></h3>
      <ul className="stats__bars" aria-label="Time watched by day of the week">
        {WEEKDAYS.map((day, i) => (
          <li key={day} className="stats__bar" data-peak={i === stats.busiestWeekday ? "true" : undefined} data-today={i === today ? "true" : undefined}>
            <span className="t-label-sm stats__barval">{formatShort(stats.byWeekdayMs[i]!)}</span>
            <span className="stats__barbox">
              <span className="stats__barfill" style={{ height: `${Math.max(4, Math.round((stats.byWeekdayMs[i]! / peak) * 100))}%` }} title={`${day}: ${formatDuration(stats.byWeekdayMs[i]!)}`} />
            </span>
            <span className="t-label-sm stats__barday">{day.slice(0, 3)}{i === today ? <i className="stats__today" role="img" aria-label=" (today)" /> : null}</span>
          </li>
        ))}
      </ul>
      {weekdayLine(stats.busiestWeekday) ? <p className="t-body-sm c-text-2" style={{ margin: "10px 0 0" }}>{weekdayLine(stats.busiestWeekday)}</p> : null}

      {topPicks.length > 0 ? (
        <>
          <h3 className="t-label-lg stats__sub">Most watched <span className="stats__period">· {period}</span></h3>
          <ul className="stats__top">
            {topPicks.map((t) => (
              <li key={`${t.type}|${t.title}`} className="stats__toprow">
                {t.posterUrl ? <img className="stats__topposter" src={t.posterUrl} alt="" loading="lazy" /> : <span className="stats__topposter" aria-hidden="true" />}
                <div style={{ minWidth: 0 }}>
                  <div className="t-label-sm c-text-3">{t.type === "TV_SHOW" ? "Show" : "Movie"}</div>
                  <div className="t-title-md stats__toptitle">{t.title}</div>
                  <div className="t-label-sm c-text-2">{formatDuration(t.watchedMs)}{t.type === "TV_SHOW" ? ` · ${pluralize(t.parts, "episode")}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h3 className="t-label-lg stats__sub">Your recap</h3>
      <StatsRecap stats={stats} />

      <details className="stats__counts">
        <summary className="t-label-lg">What counts towards your stats</summary>
        <ul className="t-body-sm c-text-2">
          <li>Everything you watch in ArcTV while signed in to your account, on any device. Each profile has its own stats.</li>
          <li>A finished movie or episode counts for its whole length. One you stopped part-way counts for how far you got.</li>
          <li>A title you watch again counts once, on the day you last watched it, so rewatching doesn't add to your hours.</li>
          <li>Anything you watch outside ArcTV, or without being signed in, isn't included.</li>
          <li>Reset stats starts the numbers again from today. Your watch history is kept.</li>
          {truncated ? <li>Your history is very long, so only the most recent part of it is counted.</li> : null}
        </ul>
      </details>
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
