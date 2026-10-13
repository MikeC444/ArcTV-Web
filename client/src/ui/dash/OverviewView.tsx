import { attentionAlerts, platformColor, platformName, versionsByPlatform, weekOverWeek, type DashAlert } from "../../lib/dash";
import { percent } from "../../lib/downloadStats";
import type { AdminSummary } from "../../state/admin";
import { GrowthChart } from "../components/GrowthChart";
import { Bar, Card, Delta, Donut, Spark, Stat } from "./Primitives";
import type { ViewId } from "./views";

const ICON: Record<DashAlert["level"], string> = { bad: "!", warn: "↑", ok: "✓" };

/** The overview: everything that matters, laid out to fit one screen. Tiles open the view with the full picture. */
export function OverviewView({ summary, onGo }: { summary: AdminSummary; onGo(view: ViewId): void }) {
  const growth = summary.userGrowth ?? [];
  const totals = growth.map((p) => p.total);
  const daily = growth.map((p) => p.newUsers);
  const wow = weekOverWeek(daily);
  const plusTotal = summary.plus.monthly + summary.plus.yearly + summary.plus.lifetime;
  const alerts = attentionAlerts(summary);
  const onlineByPlatform = summary.live?.online.byPlatform ?? {};
  const onlineEntries = Object.entries(onlineByPlatform).map(([key, value]) => ({ key, value, color: platformColor(key) }));
  const platforms = versionsByPlatform(summary.versions);
  const devices = platforms.reduce((n, p) => n + p.devices, 0);
  const dl = summary.downloads;
  const active = summary.activeLast7Days;

  return (
    <div className="dd-overview">
      <Card className="dd-k dd-k--users" onOpen={() => onGo("users")}>
        <Stat label="Users" value={summary.users} note={<><Delta value={summary.newLast7Days} /> this week</>}>
          <Spark values={totals.slice(-30)} />
        </Stat>
      </Card>
      <Card className="dd-k dd-k--active" onOpen={() => onGo("users")}>
        <Stat label="Active this week" value={active} note={`${percent(active, summary.users)}% of users${summary.activity ? ` · ${summary.activity.active1d} today · ${summary.activity.active30d} in 30 days` : ""}`} />
      </Card>
      <Card className="dd-live" title={<><span className="dd-dot" /> Live right now</>}>
        {summary.live ? (
          <>
            <Donut entries={onlineEntries}>
              <b>{summary.live.online.users}</b>
              <span>online</span>
            </Donut>
            <ul className="dd-legend">
              {onlineEntries.length === 0 ? <li className="dd-sub">Nobody is online</li> : null}
              {[...onlineEntries].sort((a, b) => b.value - a.value).map((e) => (
                <li key={e.key}><i style={{ background: e.color }} />{platformName(e.key)}<span>{e.value}</span></li>
              ))}
            </ul>
            <p className="dd-sub dd-live__foot">{summary.live.watching.users} of them {summary.live.watching.users === 1 ? "is" : "are"} playing something</p>
          </>
        ) : <p className="dd-sub">Live numbers need the newer backend.</p>}
      </Card>
      <Card className="dd-attn" title="Needs attention">
        <ul className="dd-alerts">
          {alerts.map((a) => (
            <li key={a.id}>
              <button type="button" className="dd-alert" data-level={a.level} onClick={() => onGo(a.view)}>
                <span className="dd-alert__ic" aria-hidden="true">{ICON[a.level]}</span>
                <span><b>{a.title}</b><small>{a.detail}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="dd-k dd-k--new" onOpen={() => onGo("users")}>
        <Stat label="New this week" value={summary.newLast7Days} note={<><Delta value={wow.delta} /> vs last week</>}>
          <Spark values={daily.slice(-7)} bars />
        </Stat>
      </Card>
      <Card className="dd-k dd-k--plus" onOpen={() => onGo("users")}>
        <Stat label="Plus" value={plusTotal} note={`${percent(plusTotal, summary.users)}% of users`} />
        <div className="dd-stack" aria-hidden="true">
          <i style={{ flex: summary.plus.monthly || 0.001, background: "var(--cyan)" }} />
          <i style={{ flex: summary.plus.yearly || 0.001, background: "var(--blue)" }} />
          <i style={{ flex: summary.plus.lifetime || 0.001, background: "var(--violet)" }} />
        </div>
        <div className="dd-sub">{summary.plus.monthly} monthly · {summary.plus.yearly} yearly · {summary.plus.lifetime} lifetime</div>
      </Card>
      <Card className="dd-growth" title="User growth">
        {growth.length > 0 ? <GrowthChart points={growth} /> : <p className="dd-sub">Growth needs the newer backend.</p>}
      </Card>
      <Card className="dd-where" title="Devices by app" onOpen={() => onGo("versions")}>
        <ul className="dd-bars">
          {platforms.map((p) => (
            <li key={p.platform}><span>{platformName(p.platform)}</span><Bar percent={percent(p.devices, devices)} color={platformColor(p.platform)} /><b>{percent(p.devices, devices)}%</b></li>
          ))}
        </ul>
        {summary.webSystems && summary.webSystems.length > 0 ? (
          <p className="dd-sub dd-where__foot">Web: {summary.webSystems.slice(0, 3).map((s) => `${s.system} ${s.users}`).join(" · ")}</p>
        ) : null}
      </Card>
      <Card className="dd-fun" title="Download button · 7 days" onOpen={() => onGo("downloads")}>
        {dl && dl.triedPeople > 0 ? (
          <ul className="dd-funnel">
            {[
              ["Pressed Download", dl.triedPeople],
              ["Plus popup (no Plus)", dl.popupPeople],
              ["File list opened", dl.openedPeople],
              ["Pressed a file", dl.startedPeople],
            ].map(([label, n]) => (
              <li key={label as string}><em>{label}</em><span className="dd-funnel__b" style={{ width: `${Math.max(14, percent(n as number, dl.triedPeople))}%` }}>{n}</span></li>
            ))}
          </ul>
        ) : <p className="dd-sub">Nobody has pressed Download this week.</p>}
        <p className="dd-sub dd-fun__foot">People, not presses. Popup and file list are two paths: popup is no Plus, file list is Plus.</p>
      </Card>
    </div>
  );
}
