import { MdAutoAwesome, MdBugReport, MdDashboard, MdDownload, MdExtension, MdGroups, MdPlayCircle, MdSystemUpdateAlt } from "react-icons/md";
import { VIEWS, type ViewId } from "./views";

const ICONS: Record<ViewId, JSX.Element> = {
  overview: <MdDashboard />,
  watching: <MdPlayCircle />,
  users: <MdGroups />,
  downloads: <MdDownload />,
  addons: <MdExtension />,
  versions: <MdSystemUpdateAlt />,
  crashes: <MdBugReport />,
};

/** The slim left rail of views (a bottom bar on a phone). */
export function Rail({ view, onGo }: { view: ViewId; onGo(view: ViewId): void }) {
  return (
    <nav className="dash__rail" aria-label="Dashboard views">
      <div className="dash__logo" aria-hidden="true"><MdAutoAwesome /></div>
      {VIEWS.map((v, i) => (
        <button key={v.id} type="button" className="dash__ri" aria-current={view === v.id ? "page" : undefined} onClick={() => onGo(v.id)} title={`${v.hint} (${i + 1})`}>
          {ICONS[v.id]}
          <span>{v.label}</span>
        </button>
      ))}
    </nav>
  );
}
