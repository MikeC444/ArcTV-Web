import { useCallback, useEffect, useRef, useState } from "react";
import { MdClear, MdClose, MdExpandMore } from "react-icons/md";
import { useSearchParams } from "react-router-dom";
import { addonNotes, offerChips } from "../../lib/addonCapabilities";
import { isOldVersion, platformName, versionsByPlatform } from "../../lib/dash";
import { formatElapsed, formatWatched, timeAgo } from "../../lib/format";
import { episodeRange, groupHistory } from "../../lib/historyGroups";
import { webSystemLabel } from "../../lib/webSystems";
import { fetchAdminUser, fetchAdminUsers, filtersActive, NO_FILTERS, type AdminDevice, type AdminFilters, type AdminSummary, type AdminUserDetail, type AdminUserRow } from "../../state/admin";
import { Spinner } from "../components/States";

const PAGE = 50;
const REFRESH_MS = 30_000;
const ONLINE_MS = 5 * 60_000;

const deviceLabel = (d: Pick<AdminDevice, "appVersion" | "platform">) => (d.appVersion === "web" || d.platform === "web" ? "Web" : `${platformName(d.platform)} ${d.appVersion ?? "unknown"}`);
const sxe = (s: number | null, e: number | null) => (s != null && e != null ? ` S${s} E${e}` : "");
const isOnline = (at: string | null) => at != null && Date.now() - new Date(at).getTime() < ONLINE_MS;
const initial = (u: Pick<AdminUserRow, "email" | "displayName">) => (u.displayName ?? u.email).trim().charAt(0).toUpperCase() || "?";

/** One-click groups of people; each sets the same filters the old filter row did. */
const SEGMENTS: Array<{ id: string; label: string; filters: Partial<AdminFilters> }> = [
  { id: "all", label: "Everyone", filters: {} },
  { id: "online", label: "Online now", filters: { seen: "1h" } },
  { id: "week", label: "Active this week", filters: { seen: "7d" } },
  { id: "free", label: "Free", filters: { plan: "free" } },
  { id: "monthly", label: "Monthly", filters: { plan: "monthly" } },
  { id: "yearly", label: "Yearly", filters: { plan: "yearly" } },
  { id: "lifetime", label: "Lifetime", filters: { plan: "lifetime" } },
  { id: "noaddons", label: "No addons", filters: { addons: "none" } },
  { id: "inactive", label: "Gone quiet (30 days+)", filters: { seen: "older" } },
];
const segmentOf = (f: AdminFilters): string => SEGMENTS.find((s) => s.id !== "all" && Object.entries(s.filters).every(([k, v]) => f[k as keyof AdminFilters] === v) && (Object.keys(NO_FILTERS) as Array<keyof AdminFilters>).every((k) => k in s.filters || f[k] === ""))?.id ?? (filtersActive(f) ? "" : "all");

/** Users: a list with chip filters on the left and a side panel for the person you pick, so nothing expands in place. */
export function UsersView({ summary, userId, onOpen, onClose }: { summary: AdminSummary | null; userId: string | null; onOpen(id: string): void; onClose(): void }) {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<AdminFilters>(() => ({ ...NO_FILTERS, device: params.get("device") ?? "", webSystem: params.get("webSystem") ?? "" }));
  const [typed, setTyped] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shown = useRef(PAGE);
  const filtersKey = JSON.stringify(filters);
  const platforms = summary ? versionsByPlatform(summary.versions) : [];

  const refresh = useCallback(async () => {
    try {
      const list = await fetchAdminUsers(filters, shown.current);
      setUsers(list.users);
      setTotal(list.total);
      setError(null);
    } catch {
      setError("Couldn't load the users.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setFilter = <K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) => {
    shown.current = PAGE;
    setFilters((f) => ({ ...f, [key]: value }));
  };
  useEffect(() => {
    const t = window.setTimeout(() => typed.trim() !== filters.q && setFilter("q", typed.trim()), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  const applySegment = (segment: (typeof SEGMENTS)[number]) => {
    shown.current = PAGE;
    setFilters((f) => ({ ...NO_FILTERS, q: f.q, device: f.device, webSystem: f.webSystem, ...segment.filters }));
  };
  const clearFilters = () => {
    shown.current = PAGE;
    setTyped("");
    setFilters(NO_FILTERS);
  };
  const segment = segmentOf(filters);

  return (
    <div className="dd-users" data-panel={userId ? "open" : undefined}>
      <section className="dd-users__list" aria-label="Users">
        <div className="dd-users__bar">
          <input className="dd-input" type="search" placeholder="Search email or name" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Filter by email or name" />
          <select className="dd-input" value={filters.device} onChange={(e) => setFilter("device", e.target.value)} aria-label="Filter by app version">
            <option value="">All versions</option>
            {(summary?.versions ?? []).map((v) => (
              <option key={`${v.platform}|${v.version}`} value={`${v.platform}|${v.version}`}>{deviceLabel({ platform: v.platform, appVersion: v.version === "unknown" ? null : v.version })} ({v.devices})</option>
            ))}
          </select>
          <select className="dd-input" value={filters.watching} onChange={(e) => setFilter("watching", e.target.value as AdminFilters["watching"])} aria-label="Filter by Continue Watching">
            <option value="">Watching: any</option><option value="with">Has Continue Watching</option><option value="none">No Continue Watching</option>
          </select>
        </div>
        <div className="dd-chips" role="group" aria-label="Groups of people">
          {SEGMENTS.map((s) => (
            <button key={s.id} type="button" className="dd-chip" aria-pressed={segment === s.id} onClick={() => applySegment(s)}>{s.label}</button>
          ))}
          {filters.webSystem ? <button type="button" className="dd-chip" aria-pressed="true" onClick={() => setFilter("webSystem", "")}>Website on {webSystemLabel(filters.webSystem)} <MdClose aria-hidden="true" /></button> : null}
          {filtersActive(filters) ? <button type="button" className="dd-chip dd-chip--clear" onClick={clearFilters}><MdClear aria-hidden="true" /> Clear filters</button> : null}
        </div>
        <p className="dd-sub dd-users__count">{filtersActive(filters) ? `${total} of ${summary?.users ?? total} users match` : `${total} users`}</p>
        {error ? <p className="dash__error" role="alert">{error}</p> : null}
        {loading ? <Spinner /> : null}
        <ul className="dd-urows" role="list">
          {users.map((u) => (
            <li key={u.id}>
              <button type="button" className="dd-urow" data-selected={u.id === userId ? "true" : undefined} onClick={() => (u.id === userId ? onClose() : onOpen(u.id))} aria-pressed={u.id === userId}>
                <span className="dd-avatar" data-online={isOnline(u.lastSeenAt) ? "true" : undefined}>{initial(u)}</span>
                <span className="dd-urow__who"><b className="ellipsis">{u.email}</b><i className="ellipsis">{u.displayName ?? "No name"}{u.isAdmin ? " · admin" : ""}</i></span>
                <span className="dd-plan" data-plan={u.plan ?? "free"}>{u.plan ? `${u.plan}${u.cancelling ? " (ending)" : ""}` : "Free"}</span>
                <span className="dd-urow__devs">
                  {u.devices.length === 0 ? <em>none</em> : u.devices.map((d, i) => <em key={i} data-old={isOldVersion(platforms, d.platform, d.appVersion) ? "true" : undefined}>{deviceLabel(d)}</em>)}
                </span>
                <span className="dd-urow__n" title="Addons"><b>{u.addons}</b> addons</span>
                <span className="dd-urow__n" title="Continue Watching"><b>{u.continueWatching}</b> watching</span>
                <span className="dd-urow__seen">{timeAgo(u.lastSeenAt)}</span>
              </button>
            </li>
          ))}
        </ul>
        {!loading && users.length === 0 ? <p className="dd-sub dd-empty">No users match.</p> : null}
        {users.length < total ? (
          <button type="button" className="dd-more" onClick={() => { shown.current += PAGE; void refresh(); }}><MdExpandMore aria-hidden="true" /> Show more ({users.length} of {total})</button>
        ) : null}
      </section>
      {userId ? <UserPanel userId={userId} platforms={platforms} onClose={onClose} /> : null}
    </div>
  );
}

type Tab = "profile" | "devices" | "addons" | "watching";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "devices", label: "Devices" },
  { id: "addons", label: "Addons" },
  { id: "watching", label: "Watching" },
];

/** The side panel for one person. */
function UserPanel({ userId, platforms, onClose }: { userId: string; platforms: ReturnType<typeof versionsByPlatform>; onClose(): void }) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>("profile");
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(false);
    const load = () => fetchAdminUser(userId).then((d) => !cancelled && setDetail(d)).catch(() => !cancelled && setError(true));
    void load();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [userId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target instanceof HTMLInputElement) && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside className="dd-panel" aria-label="User details">
      <header className="dd-panel__head">
        {detail ? (
          <>
            <span className="dd-avatar dd-avatar--lg" data-online={isOnline(detail.user.lastSeenAt) ? "true" : undefined}>{initial(detail.user)}</span>
            <div className="dd-panel__id"><b className="ellipsis">{detail.user.displayName ?? detail.user.email}</b><i className="ellipsis">{detail.user.email}</i></div>
          </>
        ) : <div className="dd-panel__id"><b>{error ? "Couldn't load that user" : "Loading…"}</b></div>}
        <button type="button" className="dd-iconbtn" onClick={onClose} aria-label="Close details"><MdClose /></button>
      </header>
      <div className="dd-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="dd-panel__body">
        {!detail ? (error ? null : <Spinner small />) : tab === "profile" ? <ProfileTab detail={detail} /> : tab === "devices" ? <DevicesTab detail={detail} platforms={platforms} /> : tab === "addons" ? <AddonsTab detail={detail} /> : <WatchingTab detail={detail} />}
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="dd-kv"><span>{label}</span><b>{children}</b></div>;
}

function ProfileTab({ detail }: { detail: AdminUserDetail }) {
  const u = detail.user;
  return (
    <>
      <Row label="Joined">{new Date(u.createdAt).toLocaleDateString()}</Row>
      <Row label="Last seen">{timeAgo(u.lastSeenAt)}</Row>
      <Row label="Plan">{u.plan ? `Plus ${u.plan}${u.plusUntil ? ` until ${new Date(u.plusUntil).toLocaleDateString()}` : ""}${u.cancelling ? " (will not renew)" : ""}` : "Free"}</Row>
      {u.plan && u.plan !== "lifetime" && !u.hasStripeSubscription ? <Row label="Billing">No Stripe subscription stored</Row> : null}
      <Row label="My List">{detail.myListCount} {detail.myListCount === 1 ? "title" : "titles"}</Row>
      <h3 className="dd-h3">Profiles</h3>
      <ul className="dd-plain">
        {detail.profiles.map((p) => <li key={p.id}><b>{p.name}</b> · {p.kind}{p.isDefault ? " · main" : ""}{p.hasPin ? " · PIN" : ""}</li>)}
      </ul>
    </>
  );
}

function DevicesTab({ detail, platforms }: { detail: AdminUserDetail; platforms: ReturnType<typeof versionsByPlatform> }) {
  if (detail.devices.length === 0) return <p className="dd-sub">No devices.</p>;
  return (
    <ul className="dd-plain dd-plain--cards">
      {detail.devices.map((d, i) => (
        <li key={i}>
          <b>{d.name}</b>
          <span><em data-old={isOldVersion(platforms, d.platform, d.appVersion) ? "true" : undefined}>{deviceLabel(d)}</em> · seen {timeAgo(d.lastSeenAt)}{d.revokedAt ? " · signed out" : ""}</span>
        </li>
      ))}
    </ul>
  );
}

function AddonsTab({ detail }: { detail: AdminUserDetail }) {
  if (detail.addons.length === 0) return <p className="dd-sub">No addons.</p>;
  return (
    <>
      <ul className="dd-plain dd-plain--cards">
        {detail.addons.map((a, i) => (
          <li key={i}>
            <b>{a.name}</b>
            <span>{a.host}{a.debrid ? ` · ${a.debrid}` : a.configured ? " · configured" : ""}{a.enabled ? "" : " · off"}{detail.profiles.length > 1 ? ` · profile ${a.profileId}` : ""}</span>
            {a.capabilities ? (
              <span className="dd-pills">
                {offerChips(a.capabilities).map((chip) => <span key={chip} className="dd-tag">{chip}</span>)}
                {addonNotes(a.capabilities).map((note) => <span key={note.text} className="dd-tag dd-tag--warn" title={note.title}>{note.text}</span>)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="dd-sub">Addon keys are never shown.</p>
    </>
  );
}

function WatchingTab({ detail }: { detail: AdminUserDetail }) {
  const groups = groupHistory(detail.history).slice(0, 15);
  return (
    <>
      <h3 className="dd-h3">Continue Watching</h3>
      <ul className="dd-plain">
        {detail.continueWatching.length === 0 ? <li className="dd-sub">Nothing</li> : null}
        {detail.continueWatching.map((c, i) => <li key={i}><b>{c.title}</b>{sxe(c.seasonNumber, c.episodeNumber)} · {formatWatched(c.positionMs)} of {formatElapsed(c.durationMs)} · {timeAgo(c.lastWatchedAt)}</li>)}
      </ul>
      <h3 className="dd-h3">Recently watched</h3>
      <ul className="dd-plain">
        {groups.length === 0 ? <li className="dd-sub">Nothing</li> : null}
        {groups.map((g, i) => (
          <li key={i}>
            {g.single ? (
              <><b>{g.title}</b>{sxe(g.single.seasonNumber, g.single.episodeNumber)} · {g.single.completed ? "finished" : formatWatched(g.single.positionMs)} · {timeAgo(g.watchedAt)}</>
            ) : (
              <><b>{g.title}</b> S{g.seasonNumber} · {g.episodes} episodes finished ({episodeRange(g)}) · {timeAgo(g.watchedAt)}</>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
