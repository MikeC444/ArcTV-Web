import { MdDownload } from "react-icons/md";
import { percent, type DownloadSummary } from "../../lib/downloadStats";

/**
 * The developer panel's "Downloads": of the last 7 days of web Download use, how many people were stopped by the Plus popup, how many
 * opened the Downloads panel, and how many pressed a file. A pressed file is where the web app's knowledge ends: the browser does the
 * download, so a cancelled or failed one still counts. No titles are recorded.
 */
export function DownloadStats({ data }: { data: DownloadSummary }) {
  const withPlus = data.openedPeople;
  return (
    <section className="admin__playback page__pad" aria-label="Downloads">
      <h2 className="t-title-md" style={{ margin: 0 }}>
        <MdDownload aria-hidden="true" style={{ verticalAlign: "-4px", marginRight: 8 }} />
        Downloads
      </h2>
      <p className="t-label-md c-text-3" style={{ margin: "4px 0 0" }}>
        Web only, last 7 days. A pressed file is counted as started: the browser does the download, so a cancelled one still counts. No titles are recorded.
      </p>
      {data.triedPeople === 0 ? (
        <p className="t-label-md c-text-3" style={{ marginTop: 14 }}>Nothing yet. It starts counting once this version of the web app is live.</p>
      ) : (
        <>
          <div className="admin__stats admin__stats--inner">
            <Tile label="People who tried" value={data.triedPeople.toLocaleString()} note="opened Downloads or saw the Plus popup" />
            <Tile label="Saw the Plus popup" value={data.popupPeople.toLocaleString()} note={`${data.popups} ${data.popups === 1 ? "press" : "presses"}, no Plus`} />
            <Tile label="Opened Downloads" value={withPlus.toLocaleString()} note={`${data.opens} ${data.opens === 1 ? "time" : "times"}`} />
            <Tile label="Started a download" value={data.startedPeople.toLocaleString()} note={`${percent(data.startedPeople, withPlus)}% of those who opened it · ${data.files} ${data.files === 1 ? "file" : "files"}`} />
            <Tile label="Episodes" value={`${percent(data.episodeFiles, data.files)}%`} note={`${data.episodeFiles} of ${data.files} files`} />
            <Tile label="Not cached" value={`${percent(data.uncachedFiles, data.files)}%`} note={`${data.uncachedFiles} files that may be slow to start`} />
          </div>
          {data.byQuality.length > 0 ? (
            <div className="admin__playgroups">
              <div className="admin__playgroup">
                <h3 className="t-label-md c-text-3 admin__subhead">By quality</h3>
                <ul>
                  {data.byQuality.map((q) => (
                    <li key={q.label}>
                      <span className="admin__playname">{q.label}</span>
                      <span className="admin__playbar" aria-hidden="true"><i style={{ width: `${Math.max(3, percent(q.files, data.files))}%` }} /></span>
                      <span className="admin__playnum"><b>{percent(q.files, data.files)}%</b> <em>{q.files} {q.files === 1 ? "file" : "files"}</em></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="admin__stat">
      <div className="t-label-md c-text-3">{label}</div>
      <div className="admin__statvalue">{value}</div>
      {note ? <div className="t-label-sm c-text-2">{note}</div> : null}
    </div>
  );
}
