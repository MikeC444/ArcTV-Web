import { percent } from "../../lib/downloadStats";
import { platformColor, platformName, versionsByPlatform } from "../../lib/dash";
import type { AdminSummary } from "../../state/admin";
import { WebSystems } from "../components/WebSystems";
import { Bar, Card } from "./Primitives";

/** App versions in use, each app against its own newest version, and which systems the website is used on. Pressing a version lists those people. */
export function VersionsView({ summary, onFilterUsers }: { summary: AdminSummary; onFilterUsers(device: string): void }) {
  const platforms = versionsByPlatform(summary.versions);
  return (
    <div className="dd-scroll">
      <div className="dd-cols">
        {platforms.map((p) => (
          <Card
            key={p.platform}
            title={<><i className="dd-swatch" style={{ background: platformColor(p.platform) }} />{platformName(p.platform)}</>}
            aside={<span className="dd-sub">{p.devices} {p.devices === 1 ? "device" : "devices"}{p.newest ? ` · newest ${p.newest}` : ""}</span>}
          >
            {p.newest ? <p className="dd-sub dd-vs">{p.behind === 0 ? "Everyone is on the newest version." : `${p.behind} of ${p.devices} (${percent(p.behind, p.devices)}%) are behind.`}</p> : null}
            <ul className="dd-bars dd-bars--rows">
              {p.versions.map((v) => (
                <li key={v.version}>
                  <button type="button" onClick={() => onFilterUsers(`${p.platform}|${v.version}`)} aria-label={`Show people on ${platformName(p.platform)} ${v.version}`}>
                    <span data-old={v.old ? "true" : undefined}>{v.version === "web" ? "Website" : v.version}</span>
                    <Bar percent={percent(v.devices, p.devices)} color={v.old ? "#ffb020" : platformColor(p.platform)} />
                    <b>{v.devices}</b>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
        {summary.webSystems ? (
          <Card title="Website by system">
            <WebSystems systems={summary.webSystems} selected="" onSelect={(system) => system && onFilterUsers(`webSystem:${system}`)} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
