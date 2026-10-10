import { MdLanguage } from "react-icons/md";
import { webSystemLabel, type WebSystem } from "../../lib/webSystems";

/**
 * The developer panel's "who uses the website on what" card: one bar per system (Windows, macOS, Android, iOS...), counting people, for
 * web browsers only. Pressing a bar filters the users list below to that system; pressing it again clears the filter.
 */
export function WebSystems({ systems, selected, onSelect }: { systems: WebSystem[]; selected: string; onSelect(system: string): void }) {
  const most = Math.max(...systems.map((s) => s.users), 1);
  const people = systems.reduce((sum, s) => sum + s.users, 0);
  return (
    <section className="admin__websys page__pad" aria-label="Web users by system">
      <h2 className="t-title-md" style={{ margin: 0 }}>
        <MdLanguage aria-hidden="true" style={{ verticalAlign: "-4px", marginRight: 8 }} />
        Web users by system
      </h2>
      <p className="t-label-md c-text-3" style={{ margin: "4px 0 14px" }}>Signed-in browsers only, not the apps · press one to filter the users list</p>
      {systems.length === 0 ? (
        <p className="t-label-md c-text-3">Nobody is signed in on the website yet.</p>
      ) : (
        <ul className="admin__syslist">
          {systems.map((s) => (
            <li key={s.system}>
              <button type="button" className="admin__sysrow" aria-pressed={selected === s.system} onClick={() => onSelect(selected === s.system ? "" : s.system)}>
                <span className="admin__sysname">{webSystemLabel(s.system)}</span>
                <span className="admin__sysbar" aria-hidden="true"><i style={{ width: `${Math.max(3, (s.users / most) * 100)}%` }} /></span>
                <span className="admin__syscount"><b>{s.users.toLocaleString()}</b> <em>{people > 0 ? `${Math.round((s.users / people) * 100)}%` : ""}</em></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
