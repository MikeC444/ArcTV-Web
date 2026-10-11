import { MdSpeed } from "react-icons/md";
import { engineName, formatStart, leftEarly, percent, standsOut, type PlaybackGroup, type PlaybackSummary } from "../../lib/playbackHealth";

/**
 * The developer panel's "Playback health": of the viewings in the last 7 days, how many were left within seconds, hit a player error or
 * never started, overall and by device model, player and picture quality, so a device or format people keep abandoning stands out.
 */
export function PlaybackHealth({ data }: { data: PlaybackSummary }) {
  const early = data.short7d + data.errors7d + data.neverStarted7d;
  return (
    <section className="admin__playback page__pad" aria-label="Playback health">
      <h2 className="t-title-md" style={{ margin: 0 }}>
        <MdSpeed aria-hidden="true" style={{ verticalAlign: "-4px", marginRight: 8 }} />
        Playback health
      </h2>
      <p className="t-label-md c-text-3" style={{ margin: "4px 0 0" }}>
        How viewings in the last 7 days ended. Left early = under 30 seconds after the picture appeared, a player error, or nothing ever appeared. No titles are recorded.
      </p>
      {data.plays7d === 0 ? (
        <p className="t-label-md c-text-3" style={{ marginTop: 14 }}>No reports yet. They arrive from app versions that include playback health.</p>
      ) : (
        <>
          <div className="admin__stats admin__stats--inner">
            <Tile label="Viewings, 7 days" value={data.plays7d.toLocaleString()} note={`${data.users7d} people`} />
            <Tile label="Left early" value={`${percent(early, data.plays7d)}%`} note={`${data.short7d} short · ${data.errors7d} errors · ${data.neverStarted7d} never started`} warn={percent(early, data.plays7d) >= 40} />
            <Tile label="Median time to picture" value={formatStart(data.medianStartMs)} />
            <Tile label="Not the first source tried" value={`${percent(data.multiSource7d, data.plays7d)}%`} note={`${data.multiSource7d} viewings`} />
          </div>
          <div className="admin__playgroups">
            <Group title="By device" groups={data.byDevice} data={data} />
            <Group title="By player" groups={data.byEngine} data={data} name={engineName} />
            <Group title="By quality" groups={data.byResolution} data={data} />
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="admin__stat" data-warn={warn ? "true" : undefined}>
      <div className="t-label-md c-text-3">{label}</div>
      <div className="admin__statvalue">{value}</div>
      {note ? <div className="t-label-sm c-text-2">{note}</div> : null}
    </div>
  );
}

function Group({ title, groups, data, name }: { title: string; groups: PlaybackGroup[]; data: PlaybackSummary; name?: (label: string) => string }) {
  if (groups.length === 0) return null;
  return (
    <div className="admin__playgroup">
      <h3 className="t-label-md c-text-3 admin__subhead">{title}</h3>
      <ul>
        {groups.map((g) => {
          const rate = percent(leftEarly(g), g.plays);
          return (
            <li key={g.label} data-flag={standsOut(g, data) ? "true" : undefined}>
              <span className="admin__playname">{name ? name(g.label) : g.label}</span>
              <span className="admin__playbar" aria-hidden="true"><i style={{ width: `${Math.max(rate > 0 ? 3 : 0, rate)}%` }} /></span>
              <span className="admin__playnum"><b>{rate}%</b> <em>left early · {g.plays} {g.plays === 1 ? "viewing" : "viewings"}</em></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
