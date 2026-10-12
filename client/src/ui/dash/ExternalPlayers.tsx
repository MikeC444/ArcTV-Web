import { useState } from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import { timeAgo } from "../../lib/format";
import { Stat } from "./Primitives";
import type { AdminSummary, ExternalPlayerEvent } from "../../state/admin";

const OTHER_PLAYERS_COLLAPSED_KEY = "arctv.admin.otherPlayersCollapsed";
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(OTHER_PLAYERS_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** The Other players numbers and the most recent hand-offs under them; one button minimises both (remembered in this browser only, nothing is deleted). */
export function ExternalPlayerSection({ data }: { data: NonNullable<AdminSummary["externalPlayer"]> }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const setCollapsedSaved = (value: boolean) => {
    setCollapsed(value);
    try {
      if (value) localStorage.setItem(OTHER_PLAYERS_COLLAPSED_KEY, "1");
      else localStorage.removeItem(OTHER_PLAYERS_COLLAPSED_KEY);
    } catch {
      // private mode: the choice just lasts until the page is reloaded
    }
  };
  const how = (e: ExternalPlayerEvent) => (e.engine === "vlc" ? "VLC engine" : e.outcome === "no_player" ? "No player installed" : "Another app");
  const why = (e: ExternalPlayerEvent) => (e.trigger === "error" ? "After an error" : e.trigger === "button" ? "From the button" : e.trigger ?? "");
  return (
    <section className="admin__external page__pad" aria-label="Other players">
      <div className="admin__externalhead">
        <h2 className="t-title-md">Other players</h2>
        <button type="button" className="admin__collapse" onClick={() => setCollapsedSaved(!collapsed)} aria-expanded={!collapsed} aria-controls="admin-other-players">
          {collapsed ? <MdExpandMore aria-hidden="true" /> : <MdExpandLess aria-hidden="true" />}
          {collapsed ? "Expand" : "Minimise"}
        </button>
      </div>
      {collapsed ? null : (
        <div id="admin-other-players">
          <div className="dd-stats">
            <Stat label="Opened another app, 7 days" value={data.opens7d} note={`${data.opensTotal} all time`} />
            <Stat label="VLC engine, 7 days" value={data.vlc7d} />
            <Stat label="People, 7 days" value={data.users7d} />
            <Stat label="After an error, 7 days" value={data.afterError7d} note={`${data.fromButton7d} from the button · ${data.noPlayer7d} with no player`} />
          </div>
          <h3 className="t-label-md c-text-3 admin__subhead">Most recent hand-offs</h3>
          {data.recent.length > 0 ? (
            <div className="admin__table" role="table" aria-label="Recent hand-offs">
              <div className="admin__row admin__row--ext admin__row--head t-label-md c-text-3" role="row">
                <span>Title</span><span>How</span><span>Person</span><span>Version</span><span>When</span>
              </div>
              {data.recent.map((e, i) => (
                <div className="admin__row admin__row--ext admin__row--line" role="row" key={`${e.createdAt}-${i}`}>
                  <span className="admin__who">
                    {e.title ?? e.releaseTitle ?? "Unknown title"}
                    <i>{[e.resolution, e.codec].filter(Boolean).join(" · ") || "—"}</i>
                    {e.errorMessage ? <i className="admin__errtext">{e.errorMessage}</i> : null}
                  </span>
                  <span className="admin__who"><b className="admin__tag" data-kind={e.engine === "vlc" ? "vlc" : e.outcome === "no_player" ? "none" : "app"}>{how(e)}</b><i>{why(e)}</i></span>
                  <span className="admin__ellipsis">{e.email}</span>
                  <span>{e.appVersion ?? "—"}</span>
                  <span>{timeAgo(e.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : <p className="t-label-md c-text-3">Nothing yet.</p>}
        </div>
      )}
    </section>
  );
}
