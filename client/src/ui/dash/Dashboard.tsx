import { useCallback, useEffect, useMemo, useState } from "react";
import { MdArrowBack, MdRefresh, MdSearch } from "react-icons/md";
import { useNavigate, useParams } from "react-router-dom";
import { routes } from "../../lib/routes";
import { Spinner } from "../components/States";
import { AddonsView } from "./AddonsView";
import { CommandPalette } from "./CommandPalette";
import { AppPromosView } from "./AppPromosView";
import { DownloadsView } from "./DownloadsView";
import { OverviewView } from "./OverviewView";
import { PlaybackView } from "./PlaybackView";
import { Rail } from "./Rail";
import { UsersView } from "./UsersView";
import { VersionsView } from "./VersionsView";
import { WatchingView } from "./WatchingView";
import { useAgo, useSummary } from "./useSummary";
import { platformName } from "../../lib/dash";
import { platformSplit, windowLabel } from "../../state/admin";
import { VIEWS, type ViewId } from "./views";

/** "/admin/users/<id>" → view and user; anything unknown falls back to the overview. */
export function parseAdminPath(rest: string | undefined): { view: ViewId; userId: string | null } {
  const [first, second] = (rest ?? "").split("/").filter(Boolean);
  const view = VIEWS.find((v) => v.id === first)?.id ?? "overview";
  return { view, userId: view === "users" && second ? second : null };
}

export const adminPath = (view: ViewId, userId?: string | null): string => (view === "overview" ? routes.admin : userId ? `${routes.admin}/users/${userId}` : `${routes.admin}/${view}`);

/** The developer dashboard: a rail of views, a live strip on top, and one view at a time that fits the screen. Read-only; refreshes itself. */
export function Dashboard() {
  const params = useParams();
  const navigate = useNavigate();
  const { view, userId } = parseAdminPath(params["*"]);
  const { summary, error, updatedAt, refresh } = useSummary();
  const ago = useAgo(updatedAt);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    document.title = "Developer dashboard · Arc TV";
  }, []);

  const go = useCallback((next: ViewId, id?: string | null) => navigate(adminPath(next, id)), [navigate]);

  // Ctrl/Cmd+K or "/" opens the palette; 1–7 jump between views (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "/") {
          e.preventDefault();
          setPalette(true);
        } else {
          const n = Number(e.key);
          if (n >= 1 && n <= VIEWS.length) go(VIEWS[n - 1]!.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const live = summary?.live;
  const liveTip = useMemo(
    () => (live ? `Online: ${platformSplit(live.online.byPlatform, platformName) || "nobody"}. Used Arc TV in the last ${windowLabel(live.onlineWindowSeconds)}. Watching: saved progress in the last ${windowLabel(live.watchingWindowSeconds)}.` : ""),
    [live],
  );
  const title = VIEWS.find((v) => v.id === view)!.label;

  return (
    <div className="dash">
      <Rail view={view} onGo={(v) => go(v)} />
      <div className="dash__main">
        <header className="dash__top">
          <h1 className="dash__title">{title}</h1>
          {live ? (
            <div className="dash__live" title={liveTip}>
              <span className="dd-pill"><span className="dd-dot" /><b>{live.online.users}</b> online</span>
              <button type="button" className="dd-pill dd-pill--btn" onClick={() => go("watching")} title="See who is watching"><span className="dd-dot dd-dot--v" /><b>{live.watching.users}</b> watching</button>
            </div>
          ) : null}
          <span className="dash__sp" />
          <span className="dash__upd">{ago}</span>
          <button type="button" className="dd-iconbtn" onClick={() => void refresh()} aria-label="Refresh"><MdRefresh /></button>
          <button type="button" className="dash__search" onClick={() => setPalette(true)} aria-label="Search users or jump to a view">
            <MdSearch aria-hidden="true" /> <span>Search users or jump to…</span> <kbd>Ctrl K</kbd>
          </button>
          <button type="button" className="dd-iconbtn dash__back" onClick={() => navigate(routes.home)} aria-label="Back to Arc TV" title="Back to Arc TV"><MdArrowBack /></button>
        </header>
        {error ? <p className="dash__error" role="alert">{error}</p> : null}
        <main className="dash__body" id="main" tabIndex={-1}>
          {!summary && !error ? <Spinner /> : null}
          {summary && view === "overview" ? <OverviewView summary={summary} onGo={go} /> : null}
          {view === "watching" ? <WatchingView onOpenUser={(id) => go("users", id)} /> : null}
          {view === "users" ? <UsersView summary={summary} userId={userId} onOpen={(id) => go("users", id)} onClose={() => go("users")} /> : null}
          {summary && view === "playback" ? <PlaybackView summary={summary} /> : null}
          {summary && view === "downloads" ? <DownloadsView summary={summary} onOpenUser={(id) => go("users", id)} /> : null}
          {summary && view === "popups" ? <AppPromosView summary={summary} onOpenUser={(id) => go("users", id)} /> : null}
          {summary && view === "addons" ? <AddonsView summary={summary} /> : null}
          {summary && view === "versions" ? <VersionsView summary={summary} onFilterUsers={(f) => navigate(`${routes.admin}/users?${f.startsWith("webSystem:") ? `webSystem=${encodeURIComponent(f.slice(10))}` : `device=${encodeURIComponent(f)}`}`)} /> : null}
        </main>
      </div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} onGo={go} /> : null}
    </div>
  );
}
