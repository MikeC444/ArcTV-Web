import { percent } from "../../lib/downloadStats";
import type { AdminSummary } from "../../state/admin";
import { Bar, Card, Stat } from "./Primitives";

/** What people have installed across every account: the most common addon sites, debrid services, and how many people have an addon that returns little. */
export function AddonsView({ summary }: { summary: AdminSummary }) {
  const a = summary.addons;
  if (!a) return <div className="dd-scroll"><p className="dd-sub dd-empty">The Addons view needs the newer backend. Once it is deployed, this fills in on its own.</p></div>;
  const most = Math.max(...a.hosts.map((h) => h.users), 1);
  const mostDebrid = Math.max(...a.debrid.map((d) => d.users), 1);
  return (
    <div className="dd-scroll">
      <div className="dd-stats">
        <Card><Stat label="People with addons" value={a.usersWithAddons} note={`${percent(a.usersWithAddons, summary.users)}% of users`} /></Card>
        <Card><Stat label="With a debrid service" value={a.usersWithDebrid} note={`${percent(a.usersWithDebrid, a.usersWithAddons)}% of people with addons`} /></Card>
        <Card><Stat label="Addon that returns nothing" value={a.flaggedUsers} tone={a.flaggedUsers > 0 ? "warn" : undefined} note="people whose addon only has catalogues the apps ignore, such as anime" /></Card>
      </div>
      <div className="dd-cols">
        <Card title="Most installed addons">
          <ul className="dd-bars dd-bars--wide">
            {a.hosts.length === 0 ? <li className="dd-sub">None yet.</li> : null}
            {a.hosts.map((h) => (
              <li key={h.host}>
                <span className="dd-host">
                  <b className="ellipsis">{h.name ?? h.host}</b>
                  <small className="ellipsis">{h.name ? h.host : ""}</small>
                  <span className="dd-pills">
                    {h.ignoredTypes.length > 0 ? <span className="dd-tag dd-tag--warn" title="The apps only show movie and series catalogues">Ignored: {h.ignoredTypes.join(", ")}</span> : null}
                    {h.otherIdPrefixes.length > 0 ? <span className="dd-tag dd-tag--warn" title="Titles with these ids may not open or play">Ids: {h.otherIdPrefixes.join(", ")}</span> : null}
                  </span>
                </span>
                <Bar percent={percent(h.users, most)} />
                <b>{h.users}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Debrid services">
          <ul className="dd-bars">
            {a.debrid.length === 0 ? <li className="dd-sub">None configured.</li> : null}
            {a.debrid.map((d) => (
              <li key={d.service}><span>{d.service}</span><Bar percent={percent(d.users, mostDebrid)} /><b>{d.users}</b></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
