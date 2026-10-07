import { useCallback, useEffect, useRef, useState } from "react";
import { MdClear, MdClose, MdExpandMore, MdRefresh } from "react-icons/md";
import { formatElapsed, formatWatched, pluralize, timeAgo } from "../../lib/format";
import { fetchAdminSummary, fetchAdminUser, fetchAdminUsers, fetchTorrentIntroAcks, filtersActive, newestVersion, NO_FILTERS, type AdminDevice, type ExternalPlayerEvent, type FeatureIntroAcks, type AdminFilters, type AdminSummary, type AdminUserDetail, type AdminUserRow } from "../../state/admin";
import { MangoButton } from "../components/Buttons";
import { Spinner } from "../components/States";

const PAGE = 50;
const REFRESH_MS = 30_000;
const platformName = (p: string) => (p === "fire_tv" ? "Fire TV" : p === "web" ? "Web" : p === "android_tv" ? "Android TV" : p);
/** "Fire TV 0.1.7", or just "Web" for the web app. */
const deviceLabel = (d: Pick<AdminDevice, "appVersion" | "platform">) => (d.appVersion === "web" || d.platform === "web" ? "Web" : `${platformName(d.platform)} ${d.appVersion ?? "unknown"}`);
const sxe = (s: number | null, e: number | null) => (s != null && e != null ? ` S${s} E${e}` : "");

/** The developer panel: every account, what it has installed and watched, and which app version each device is on. Read-only; refreshes itself. */
export function AdminScreen() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [intro, setIntro] = useState<FeatureIntroAcks | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<AdminFilters>(NO_FILTERS);
  const [typed, setTyped] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const shown = useRef(PAGE);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    document.title = "Developer panel · Arc TV";
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([fetchAdminSummary(), fetchAdminUsers(filters, shown.current)]);
      setSummary(s);
      setUsers(list.users);
      setTotal(list.total);
      // Optional: a backend that predates the pop-up report has no such list, and the section then stays hidden.
      setIntro(await fetchTorrentIntroAcks().catch(() => null));
      if (openId) setDetail(await fetchAdminUser(openId));
      setError(null);
      setUpdatedAt(Date.now());
    } catch {
      setError("Couldn't load the panel. You may not be an admin, or the service is unreachable.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, openId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const loadMore = async () => {
    shown.current += PAGE;
    await refresh();
  };
  const setFilter = <K extends keyof AdminFilters>(key: K, value: AdminFilters[K]) => {
    shown.current = PAGE;
    setFilters((f) => ({ ...f, [key]: value }));
  };
  // typing in the User box searches after a short pause
  useEffect(() => {
    const t = window.setTimeout(() => typed.trim() !== filters.q && setFilter("q", typed.trim()), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);
  const clearFilters = () => {
    shown.current = PAGE;
    setTyped("");
    setFilters(NO_FILTERS);
  };
  const open = async (id: string) => {
    setOpenId(id === openId ? null : id);
    setDetail(null);
    if (id !== openId) {
      try {
        setDetail(await fetchAdminUser(id));
      } catch {
        setError("Couldn't load that user.");
      }
    }
  };

  const newest = summary ? newestVersion(summary.versions.map((v) => v.version)) : null;

  return (
    <div className="page admin">
      <div className="admin__head page__pad">
        <h1 className="t-display-md" style={{ margin: 0 }}>Developer panel</h1>
        <div className="admin__refresh t-label-md c-text-2">
          {updatedAt ? `Updated ${timeAgo(new Date(updatedAt).toISOString())} · refreshes every 30 s` : "Loading…"}
          <MangoButton text="Refresh" icon={<MdRefresh />} compact onClick={() => void refresh()} />
        </div>
      </div>
      {error ? <p className="admin__error page__pad" role="alert">{error}</p> : null}

      {summary ? (
        <section className="admin__stats page__pad" aria-label="Summary">
          <Stat label="Users" value={summary.users} />
          <Stat label="Active, last 7 days" value={summary.activeLast7Days} />
          <Stat label="New, last 7 days" value={summary.newLast7Days} />
          <Stat label="Plus" value={summary.plus.monthly + summary.plus.yearly + summary.plus.lifetime} note={`${summary.plus.monthly} monthly · ${summary.plus.yearly} yearly · ${summary.plus.lifetime} lifetime`} />
        </section>
      ) : null}

      {summary && summary.versions.length > 0 ? (
        <section className="admin__versions page__pad" aria-label="App versions">
          <h2 className="t-title-md">App versions in use</h2>
          <div className="admin__chips">
            {summary.versions.map((v) => (
              <span className="admin__chip" key={`${v.platform}-${v.version}`} data-old={newest != null && v.version !== newest && /^\d/.test(v.version) ? "true" : undefined}>
                {platformName(v.platform)} {v.version === "web" ? "" : v.version}
                <b>{pluralize(v.devices, "device")}</b>
              </span>
            ))}
          </div>
          {newest ? <p className="t-label-md c-text-3" style={{ margin: "8px 0 0" }}>Newest seen: {newest}. Devices on an older version are marked.</p> : null}
        </section>
      ) : null}

      {summary?.externalPlayer ? <ExternalPlayerSection data={summary.externalPlayer} /> : null}

      {intro ? <TorrentIntroSection data={intro} /> : null}

      <section className="admin__users page__pad" aria-label="Users">
        {loading ? <Spinner /> : null}
        <div className="admin__table" role="table" aria-label={`${total} users`}>
          <div className="admin__row admin__row--head t-label-md c-text-3" role="row">
            <span>User</span><span>Plan</span><span>Devices (app version)</span><span>Addons</span><span>Watching</span><span>Last seen</span>
          </div>
          <div className="admin__row admin__row--filters" role="row">
            <input className="admin__input" type="search" placeholder="Email or name" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Filter by email or name" />
            <select className="admin__input" value={filters.plan} onChange={(e) => setFilter("plan", e.target.value as AdminFilters["plan"])} aria-label="Filter by plan">
              <option value="">All</option><option value="free">Free</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="lifetime">Lifetime</option>
            </select>
            <select className="admin__input" value={filters.device} onChange={(e) => setFilter("device", e.target.value)} aria-label="Filter by app version">
              <option value="">All versions</option>
              {(summary?.versions ?? []).map((v) => (
                <option key={`${v.platform}|${v.version}`} value={`${v.platform}|${v.version}`}>{deviceLabel({ platform: v.platform, appVersion: v.version === "unknown" ? null : v.version })} ({v.devices})</option>
              ))}
            </select>
            <select className="admin__input" value={filters.addons} onChange={(e) => setFilter("addons", e.target.value as AdminFilters["addons"])} aria-label="Filter by addons">
              <option value="">All</option><option value="with">Has</option><option value="none">None</option>
            </select>
            <select className="admin__input" value={filters.watching} onChange={(e) => setFilter("watching", e.target.value as AdminFilters["watching"])} aria-label="Filter by Continue Watching">
              <option value="">All</option><option value="with">Has</option><option value="none">None</option>
            </select>
            <select className="admin__input" value={filters.seen} onChange={(e) => setFilter("seen", e.target.value as AdminFilters["seen"])} aria-label="Filter by last seen">
              <option value="">Any time</option><option value="1h">Last hour</option><option value="24h">Last 24 h</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="older">Over 30 days</option><option value="never">Never</option>
            </select>
          </div>
          {users.map((u) => (
            <div key={u.id}>
              <button type="button" className="admin__row admin__row--user" data-open={u.id === openId} onClick={() => void open(u.id)} aria-expanded={u.id === openId}>
                <span className="admin__who"><b className="ellipsis">{u.email}</b><i className="ellipsis">{u.displayName ?? ""}{u.isAdmin ? " · admin" : ""}</i></span>
                <span>{u.plan ? `${u.plan}${u.cancelling ? " (ending)" : ""}` : "Free"}</span>
                <span className="admin__devs">{u.devices.length === 0 ? "none" : u.devices.map((d, i) => <em key={i} data-old={newest != null && d.appVersion != null && /^\d/.test(d.appVersion) && d.appVersion !== newest ? "true" : undefined}>{deviceLabel(d)}</em>)}</span>
                <span>{u.addons}</span>
                <span>{u.continueWatching}</span>
                <span>{timeAgo(u.lastSeenAt)}</span>
              </button>
              {u.id === openId ? <UserDetail detail={detail} newest={newest} /> : null}
            </div>
          ))}
          {!loading && users.length === 0 ? <p className="c-text-2" style={{ padding: 16 }}>No users match.</p> : null}
        </div>
        <div className="admin__foot t-label-md c-text-2">
          {filtersActive(filters) ? `${total} of ${summary?.users ?? total} users match` : `${total} users`}
          {filtersActive(filters) ? <MangoButton text="Clear filters" icon={<MdClear />} compact onClick={clearFilters} /> : null}
        </div>
        {users.length < total ? <MangoButton text={`Show more (${users.length} of ${total})`} icon={<MdExpandMore />} compact onClick={() => void loadMore()} /> : null}
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="admin__stat">
      <div className="t-label-md c-text-3">{label}</div>
      <div className="admin__statvalue">{value}</div>
      {note ? <div className="t-label-sm c-text-2">{note}</div> : null}
    </div>
  );
}

function UserDetail({ detail, newest }: { detail: AdminUserDetail | null; newest: string | null }) {
  if (!detail) return <div className="admin__detail"><Spinner small /></div>;
  const u = detail.user;
  return (
    <div className="admin__detail">
      <p className="t-body-sm c-text-2" style={{ margin: 0 }}>
        Joined {new Date(u.createdAt).toLocaleDateString()} · {u.plan ? `Plus ${u.plan}${u.plusUntil ? ` until ${new Date(u.plusUntil).toLocaleDateString()}` : ""}${u.cancelling ? " (cancelled, will not renew)" : ""}${u.plan !== "lifetime" && !u.hasStripeSubscription ? " · no Stripe subscription stored" : ""}` : "Free plan"} · My List: {detail.myListCount}
      </p>
      <div className="admin__cols">
        <div>
          <h3 className="t-title-sm">Devices</h3>
          <ul className="admin__list">
            {detail.devices.map((d, i) => (
              <li key={i}>
                <b>{d.name}</b> · <span data-old={newest != null && d.appVersion != null && /^\d/.test(d.appVersion) && d.appVersion !== newest ? "true" : undefined} className="admin__ver">{deviceLabel(d)}</span> · seen {timeAgo(d.lastSeenAt)}{d.revokedAt ? " · signed out" : ""}
              </li>
            ))}
          </ul>
          <h3 className="t-title-sm">Profiles</h3>
          <ul className="admin__list">
            {detail.profiles.map((p) => (
              <li key={p.id}><b>{p.name}</b> · {p.kind}{p.isDefault ? " · main" : ""}{p.hasPin ? " · PIN" : ""}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="t-title-sm">Addons</h3>
          <ul className="admin__list">
            {detail.addons.length === 0 ? <li className="c-text-3">None</li> : null}
            {detail.addons.map((a, i) => (
              <li key={i}>
                <b>{a.name}</b> · {a.host}{a.debrid ? ` · ${a.debrid}` : a.configured ? " · configured" : ""}{a.enabled ? "" : " · off"}{detail.profiles.length > 1 ? ` · profile ${a.profileId}` : ""}
              </li>
            ))}
          </ul>
          <p className="t-label-sm c-text-3" style={{ margin: "4px 0 0" }}>Addon keys are never shown.</p>
        </div>
        <div>
          <h3 className="t-title-sm">Continue Watching</h3>
          <ul className="admin__list">
            {detail.continueWatching.length === 0 ? <li className="c-text-3">Nothing</li> : null}
            {detail.continueWatching.map((c, i) => (
              <li key={i}><b>{c.title}</b>{sxe(c.seasonNumber, c.episodeNumber)} · {formatWatched(c.positionMs)} of {formatElapsed(c.durationMs)} · {timeAgo(c.lastWatchedAt)}</li>
            ))}
          </ul>
          <h3 className="t-title-sm">Recently watched</h3>
          <ul className="admin__list">
            {detail.history.slice(0, 12).map((h, i) => (
              <li key={i}><b>{h.title}</b>{sxe(h.seasonNumber, h.episodeNumber)} · {h.completed ? "finished" : formatWatched(h.positionMs)} · {timeAgo(h.watchedAt)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const HANDOFFS_HIDDEN_KEY = "arctv.admin.handoffsHidden";
const readHandoffsHidden = (): boolean => {
  try {
    return localStorage.getItem(HANDOFFS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
};

function ExternalPlayerSection({ data }: { data: NonNullable<AdminSummary["externalPlayer"]> }) {
  // The X hides the hand-off list in this browser only (nothing is deleted); "Show" brings it back.
  const [hidden, setHidden] = useState(readHandoffsHidden);
  const setHiddenSaved = (value: boolean) => {
    setHidden(value);
    try {
      if (value) localStorage.setItem(HANDOFFS_HIDDEN_KEY, "1");
      else localStorage.removeItem(HANDOFFS_HIDDEN_KEY);
    } catch {
      // private mode: the choice just lasts until the page is reloaded
    }
  };
  const how = (e: ExternalPlayerEvent) => (e.engine === "vlc" ? "VLC engine" : e.outcome === "no_player" ? "No player installed" : "Another app");
  const why = (e: ExternalPlayerEvent) => (e.trigger === "error" ? "After an error" : e.trigger === "button" ? "From the button" : e.trigger ?? "");
  return (
    <section className="admin__external page__pad" aria-label="Other players">
      <h2 className="t-title-md">Other players</h2>
      <div className="admin__stats admin__stats--inner">
        <Stat label="Opened another app, 7 days" value={data.opens7d} note={`${data.opensTotal} all time`} />
        <Stat label="VLC engine, 7 days" value={data.vlc7d} />
        <Stat label="People, 7 days" value={data.users7d} />
        <Stat label="After an error, 7 days" value={data.afterError7d} note={`${data.fromButton7d} from the button · ${data.noPlayer7d} with no player`} />
      </div>
      <div className="admin__subhead-row">
        <h3 className="t-label-md c-text-3 admin__subhead">Most recent hand-offs</h3>
        {hidden ? (
          <button type="button" className="admin__x" onClick={() => setHiddenSaved(false)}>Show</button>
        ) : (
          <button type="button" className="admin__x" onClick={() => setHiddenSaved(true)} aria-label="Hide the most recent hand-offs" title="Hide the most recent hand-offs"><MdClose /></button>
        )}
      </div>
      {hidden ? null : data.recent.length > 0 ? (
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
    </section>
  );
}

function TorrentIntroSection({ data }: { data: FeatureIntroAcks }) {
  return (
    <section className="admin__external page__pad" aria-label="Torrent pop-up">
      <h2 className="t-title-md">Torrent pop-up</h2>
      <div className="admin__stats admin__stats--inner">
        <Stat label={'Clicked "Got it"'} value={data.total} note="people, all time" />
      </div>
      <h3 className="t-label-md c-text-3 admin__subhead">Most recent</h3>
      {data.users.length > 0 ? (
        <div className="admin__table" role="table" aria-label="People who clicked Got it">
          <div className="admin__row admin__row--intro admin__row--head t-label-md c-text-3" role="row">
            <span>Person</span><span>Device</span><span>Version</span><span>When</span>
          </div>
          {data.users.map((u) => (
            <div className="admin__row admin__row--intro admin__row--line" role="row" key={u.id}>
              <span className="admin__who">{u.displayName ?? u.email}{u.displayName ? <i>{u.email}</i> : null}</span>
              <span>{u.platform ? platformName(u.platform) : "—"}</span>
              <span>{u.appVersion ?? "—"}</span>
              <span>{timeAgo(u.acknowledgedAt)}</span>
            </div>
          ))}
          {data.total > data.users.length ? <p className="t-label-md c-text-3">Showing the newest {data.users.length} of {data.total}.</p> : null}
        </div>
      ) : <p className="t-label-md c-text-3">Nobody yet.</p>}
    </section>
  );
}
