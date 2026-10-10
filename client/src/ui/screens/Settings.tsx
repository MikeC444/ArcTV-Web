import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MdBarChart, MdBolt, MdDownload, MdGroups, MdLanguage, MdLock, MdAccountCircle, MdAdd, MdBlock, MdCancel, MdFavorite, MdWorkspacePremium, MdArrowDownward, MdArrowUpward, MdCheck, MdCloudUpload, MdDelete, MdExtension, MdGridView, MdInfo, MdLogout, MdMusicNote, MdSubtitles, MdSwitchAccount, MdTune, MdVolumeUp, MdSpatialAudio, MdStars } from "react-icons/md";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PLUS_FREE_NOTE, PLUS_PERKS, PLUS_PLANS, PLUS_PROCEEDS_NOTE } from "../../domain/plus";
import { applyRowOrder, moveRow } from "../../domain/homeRows";
import { useProviders } from "../../domain/registry";
import type { HomeSection } from "../../domain/types";
import { pluralize } from "../../lib/format";
import { playPreview } from "../../lib/sounds";
import { routes } from "../../lib/routes";
import { useAddons, CINEMETA_MANIFEST_URL } from "../../state/addons";
import { useAuth } from "../../state/auth";
import { useAddonsReady } from "../../state/hooks";
import { buildGenreList } from "../../domain/genreList";
import { ApiClientError } from "../../lib/api";
import { usePlus, watchForPurchase, type PlusPlanId } from "../../state/plus";
import { activeProfileOf, useProfiles } from "../../state/profiles";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { RecommendationsPane } from "../components/RecommendationsPane";
import { WatchStats } from "../components/WatchStats";
import { useSmartPicking } from "../../state/smartPicking";
import { useHasPlus } from "../../state/plusAccess";
import { useBlockedGenres } from "../../state/blockedGenres";
import { useSettings } from "../../state/settings";
import { signOutAndWipe } from "../../state/sync";
import { ArcButton, Pill, Switch } from "../components/Buttons";
import { Spinner } from "../components/States";
import { Surface } from "../components/Surface";

type Tab = "account" | "addons" | "home-rows" | "blocked-genres" | "plus" | "plus-settings" | "recommendations" | "stats" | "sounds" | "subtitles" | "audio";
type Category = { id: Tab; icon: ReactNode; title: string; subtitle: string; /** Greyed out and not clickable without ArcTV Plus. */ plusOnly?: boolean };
const GROUPS: Array<{ label: string; items: Category[] }> = [
  {
    label: "You",
    items: [
      { id: "account", icon: <MdAccountCircle />, title: "Account", subtitle: "Manage your ArcTV account" },
      { id: "plus", icon: <MdWorkspacePremium />, title: "ArcTV Plus", subtitle: "Extra features for supporters" },
      { id: "plus-settings", icon: <MdTune />, title: "Plus settings", subtitle: "Switches for your Plus features", plusOnly: true },
      { id: "recommendations", icon: <MdStars />, title: "Recommendations", subtitle: "What shapes your Picked for you row", plusOnly: true },
      { id: "stats", icon: <MdBarChart />, title: "Your stats", subtitle: "How much you watch, at a glance", plusOnly: true },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "addons", icon: <MdExtension />, title: "Addons", subtitle: "Manage installed content providers" },
      { id: "home-rows", icon: <MdGridView />, title: "Home Rows", subtitle: "Choose which rows show up on Home" },
      { id: "blocked-genres", icon: <MdBlock />, title: "Blocked Genres", subtitle: "Hide genres you don't want to see" },
    ],
  },
  {
    label: "Playback & sound",
    items: [
      { id: "subtitles", icon: <MdSubtitles />, title: "Subtitles", subtitle: "Default on/off and preferred language" },
      { id: "audio", icon: <MdSpatialAudio />, title: "Audio", subtitle: "Preferred audio language" },
      { id: "sounds", icon: <MdMusicNote />, title: "Sounds", subtitle: "Choose your app boot sound" },
    ],
  },
];
const CATEGORIES: Category[] = GROUPS.flatMap((g) => g.items);
const isTab = (value: string | undefined): value is Tab => CATEGORIES.some((c) => c.id === value);

/** ui/settings/SettingsScreen.kt — a side navigation of grouped categories; the selected category's settings open beside it. */
export function SettingsScreen() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const selected: Tab = isTab(tab) ? tab : "account";
  const hasPlus = useHasPlus();
  const category = CATEGORIES.find((c) => c.id === selected)!;
  useEffect(() => {
    document.title = `Settings · ${category.title} · Arc TV`;
  }, [category]);
  // on a phone the categories scroll sideways: keep the open one in view
  useEffect(() => {
    document.querySelector<HTMLElement>('.settings__cat[data-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [selected]);
  if (tab && !isTab(tab) && tab !== "addons") return <Navigate to="/settings" replace />;

  return (
    <div className="page">
      <h1 className="t-display-md page__title">Settings</h1>
      <div className="settings">
        <nav className="settings__side" aria-label="Settings categories">
          {GROUPS.map((group) => (
            <div className="settings__group" key={group.label}>
              <div className="settings__grouplabel">{group.label}</div>
              {group.items.map((c) => {
                // A Plus-only category stays in the list but can't be opened without Plus, and says so.
                const locked = c.plusOnly === true && !hasPlus;
                return (
                  <Surface key={c.id} className="settings__cat" onClick={() => navigate(routes.settings(c.id))} scale={1.02} disabled={locked} ariaLabel={locked ? `${c.title}, only for ArcTV Plus` : undefined} ariaCurrent={c.id === selected ? "page" : undefined} dataAttrs={{ selected: c.id === selected, locked, autofocus: c.id === selected }}>
                    <span className="settings__caticon" aria-hidden="true">{locked ? <MdLock /> : c.icon}</span>
                    <span className="t-title-md">{c.title}</span>
                    {locked ? <span className="plus__soon settings__plustag" data-kind="plus" aria-hidden="true">Plus</span> : null}
                  </Surface>
                );
              })}
            </div>
          ))}
        </nav>
        <section className="settings__pane" aria-labelledby="pane-title">
          <header className="settings__head">
            <span className="settings__headicon" aria-hidden="true">{category.icon}</span>
            <div>
              <h2 id="pane-title" className="t-title-lg" style={{ margin: 0 }}>{category.title}</h2>
              <p className="t-body-sm c-text-2" style={{ margin: "2px 0 0" }}>{category.subtitle}</p>
            </div>
          </header>
          {selected === "account" ? <AccountPane /> : null}
          {selected === "addons" ? <AddonsPane /> : null}
          {selected === "home-rows" ? <HomeRowsPane /> : null}
          {selected === "blocked-genres" ? <BlockedGenresPane /> : null}
          {selected === "plus" ? <PlusPane /> : null}
          {selected === "plus-settings" ? <PlusSettingsPane /> : null}
          {selected === "recommendations" ? <RecommendationsPane /> : null}
          {selected === "stats" ? <WatchStats /> : null}
          {selected === "sounds" ? <SoundsPane /> : null}
          {selected === "subtitles" ? <SubtitlesPane /> : null}
          {selected === "audio" ? <AudioPane /> : null}
        </section>
      </div>
    </div>
  );
}

/** Genres the person never wants to see: hidden from Home, Movies, TV Shows, Search, Genres and "You may also like". */
function BlockedGenresPane() {
  const providers = useProviders((s) => s.providers);
  const ready = useAddonsReady();
  const blocked = useBlockedGenres((s) => s.genres);
  const toggle = useBlockedGenres((s) => s.toggle);
  const clear = useBlockedGenres((s) => s.clear);
  const [available, setAvailable] = useState<string[] | null>(null);
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    void Promise.all(providers.map((p) => p.getAvailableGenres().catch(() => [] as string[]))).then((lists) => !cancelled && setAvailable(buildGenreList(lists.flat()).filter((g) => !/^\d{4}$/.test(g))));
    return () => {
      cancelled = true;
    };
  }, [providers, ready]);
  // blocked genres always show (so they can be unblocked even if no addon lists them now), then the rest
  const all = useMemo(() => {
    const lower = new Set(blocked.map((g) => g.toLowerCase()));
    return [...blocked, ...(available ?? []).filter((g) => !lower.has(g.toLowerCase()))];
  }, [blocked, available]);
  const isOn = (genre: string) => blocked.some((g) => g.toLowerCase() === genre.toLowerCase());
  return (
    <div>
      <p className="t-body-sm c-text-2" style={{ margin: 0 }}>Titles in these genres are hidden from Home, Movies, TV Shows, Search and Genres. Titles an addon doesn't give genres for can't be filtered. When you're signed in it is saved to your account, so it applies on every device.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0" }}>
        <span className="t-title-md">{blocked.length === 0 ? "Nothing blocked" : `${blocked.length} blocked`}</span>
        {blocked.length > 0 ? <ArcButton text="Clear all" icon={<MdDelete />} compact onClick={clear} /> : null}
      </div>
      {!ready || (available === null && blocked.length === 0) ? (
        <Spinner />
      ) : all.length === 0 ? (
        <p className="t-body-sm c-text-2">Install an addon first — its genres will show up here.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }} role="group" aria-label="Genres">
          {all.map((genre) => (
            <Pill key={genre} label={genre} selected={isOn(genre)} large icon={isOn(genre) ? <MdBlock aria-hidden="true" /> : undefined} onClick={() => toggle(genre)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** ArcTV Plus: what it adds, whether you have it, and how to subscribe. Nothing here changes what the free app does. */
const PERK_ICONS: Record<string, ReactNode> = {
  "Picked for you": <MdFavorite />,
  Profiles: <MdGroups />,
  "Parental controls": <MdLock />,
  "Smart source picking": <MdBolt />,
  "Your stats": <MdBarChart />,
  Download: <MdDownload />,
};

function PlusPane() {
  const plus = usePlus();
  const profilesSupported = useProfiles((s) => s.supported);
  const [busy, setBusy] = useState<PlusPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const stopWatching = useRef<(() => void) | null>(null);
  useEffect(() => {
    void usePlus.getState().pull();
    return () => stopWatching.current?.();
  }, []);
  useEffect(() => {
    if (plus.active) setWaiting(false);
  }, [plus.active]);

  async function choose(plan: PlusPlanId) {
    setBusy(plan);
    setError(null);
    // Opened straight from the click (a window opened after an await is blocked as a pop-up), then pointed at the checkout page.
    const tab = window.open("", "_blank");
    try {
      const url = await plus.checkout(plan);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setWaiting(true);
      stopWatching.current?.();
      stopWatching.current = watchForPurchase();
    } catch (e) {
      tab?.close();
      setError(e instanceof ApiClientError && e.status === 409 ? "You already have Plus for life." : e instanceof ApiClientError && e.status === 503 ? "Plus checkout isn't available yet." : "Couldn't start checkout. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const planLabel = PLUS_PLANS.find((p) => p.id === plus.plan)?.label;
  const owned = plus.paywall && plus.active;
  return (
    <div className="plus">
      <div className="plus__status">
        {!plus.paywall ? (
          <>
            <span className="plus__badge">Early access</span>
            <span className="t-body-sm c-text-2">ArcTV Plus is in early access: its features are free for now and will need a Plus subscription once it launches.</span>
          </>
        ) : owned ? (
          <>
            <span className="plus__badge">ArcTV Plus</span>
            <span className="t-body-sm c-text-2">
              You have ArcTV Plus{planLabel ? ` (${planLabel})` : ""}
              {plus.validUntil ? `. Your current period runs to ${new Date(plus.validUntil).toLocaleDateString()}.` : ", for life."} Thank you for supporting ArcTV.
            </span>
          </>
        ) : (
          <>
            <span className="plus__badge">Free plan</span>
            <span className="t-body-sm c-text-2">You're on the free plan.</span>
          </>
        )}
      </div>
      <PlusSubscription />
      <p className="t-body-md plus__free">{PLUS_FREE_NOTE}</p>
      <p className="plus__proceeds">
        <MdFavorite aria-hidden="true" /> <span>{PLUS_PROCEEDS_NOTE}</span>
      </p>

      <h3 className="t-title-md plus__h">What Plus adds</h3>
      <ul className="plus__perks">
        {PLUS_PERKS.map((perk) => {
          const soon = (perk.needs === "profiles" && !profilesSupported ? "soon" : perk.status) === "soon";
          return (
            <li key={perk.title} className="plus__perk" data-soon={soon ? "true" : undefined}>
              <span className="plus__perkicon" aria-hidden="true">{PERK_ICONS[perk.title] ?? <MdWorkspacePremium />}</span>
              <span className="t-title-md plus__perktitle">{perk.title}</span>
              <p className="t-body-sm c-text-2 plus__perkdetail">{perk.detail}</p>
              <div className="plus__perktags">
                <span className="plus__soon" data-kind={soon ? "soon" : "plus"}>{soon ? "Coming soon" : plus.paywall ? "Plus" : "Included in early access"}</span>
                {perk.webOnly ? <span className="plus__web"><MdLanguage aria-hidden="true" /> Web and Mac only</span> : null}
              </div>
            </li>
          );
        })}
      </ul>

      {plus.paywall && !plus.active ? (
        <>
          <h3 className="t-title-md plus__h">How to subscribe</h3>
          <ol className="plus__steps t-body-md">
            <li>Pick a plan below: monthly, yearly, or a one-time Lifetime payment.{plus.trialDays > 0 ? ` Yearly starts with ${plus.trialDays} days free.` : ""}</li>
            <li>Complete the secure checkout in the page that opens. It is added to your account (you're already signed in here).</li>
            <li>Come back to this tab: Plus switches on by itself within a minute.</li>
          </ol>

          <div className="plus__plans" role="group" aria-label="Plans">
            {PLUS_PLANS.map((plan) => (
              <div key={plan.id} className="plus__plan" data-featured={plan.note ? "true" : undefined}>
                {plan.id === "yearly" && plus.trialDays > 0 ? <span className="plus__note">{plus.trialDays} days free</span> : plan.note ? <span className="plus__note">{plan.note}</span> : null}
                <div className="t-title-md">{plan.label}</div>
                <div className="plus__price">{plan.price ?? "Price at checkout"}</div>
                <div className="t-label-sm c-text-3">{plan.per}</div>
                <p className="t-body-sm c-text-2" style={{ margin: "8px 0 14px" }}>{plan.blurb}</p>
                <ArcButton text={busy === plan.id ? "Opening…" : plan.id === "lifetime" ? "Get Lifetime" : plan.id === "yearly" && plus.trialDays > 0 ? `Start ${plus.trialDays}-day free trial` : `Choose ${plan.label}`} icon={<MdWorkspacePremium />} variant="filled" compact disabled={busy !== null} onClick={() => void choose(plan.id)} />
              </div>
            ))}
          </div>
          {waiting ? <p className="t-body-sm c-text-2" style={{ margin: "12px 0 0" }}>Waiting for your payment… this switches on by itself when it goes through.</p> : null}
          {error ? <p className="t-body-sm" role="alert" style={{ margin: "12px 0 0", color: "var(--error)" }}>{error}</p> : null}
          {plus.trialDays > 0 ? <p className="t-body-sm c-text-3" style={{ margin: "12px 0 0" }}>Your card is taken at checkout, but nothing is charged for the first {plus.trialDays} days. Cancel before then and you pay nothing. The free trial is for the yearly plan, once per account.</p> : null}
          <p className="t-body-sm c-text-3" style={{ margin: "12px 0 0" }}>Payments are handled by Stripe's secure checkout page; we never see your card.</p>
        </>
      ) : null}
    </div>
  );
}

function AccountPane() {
  const user = useAuth((s) => s.user);
  const profile = useProfiles((s) => (s.supported && s.plus ? activeProfileOf(s) : undefined));
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {profile ? (
        <div className="accountprofile">
          <div className="accountprofile__avatar">
            <ProfileAvatar avatar={profile.avatar} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-label-sm c-text-3">Watching as</div>
            <div className="t-title-md">{profile.name}</div>
          </div>
          <ArcButton text="Switch or manage profiles" icon={<MdSwitchAccount />} compact onClick={() => navigate(routes.profiles, { state: { from: routes.settings() } })} />
        </div>
      ) : null}
      {user ? (
        <>
          <div className="t-title-md">{user.displayName ?? user.email}</div>
          {user.displayName ? <div className="t-body-sm c-text-2">{user.email}</div> : null}
        </>
      ) : null}
      {user?.isAdmin ? (
        <div style={{ marginTop: 16 }}>
          <ArcButton text="Developer panel" icon={<MdTune />} compact onClick={() => navigate(routes.admin)} />
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <ArcButton
          text={busy ? "Signing Out…" : "Sign Out"}
          icon={<MdLogout />}
          compact
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void signOutAndWipe();
          }}
        />
      </div>
      <p className="t-label-sm c-text-3" style={{ marginTop: 18, maxWidth: 520 }}>
        Signing out flushes any unsynced changes, then removes this account's data from this browser. Your library stays safe in your ArcTV account.
      </p>
    </div>
  );
}

/** Settings → Plus settings: the switches for Plus features. Without Plus it says what it is and where to get it. */
function PlusSettingsPane() {
  const plus = useHasPlus();
  const navigate = useNavigate();
  if (!plus) {
    return (
      <div className="stats__locked">
        <MdLock aria-hidden="true" />
        <p className="t-body-md" style={{ margin: 0 }}><strong>Plus settings are only for ArcTV Plus.</strong></p>
        <p className="t-body-sm c-text-2" style={{ margin: 0 }}>Switch Smart source picking and your other Plus features on and off here.</p>
        <ArcButton text="See ArcTV Plus" icon={<MdWorkspacePremium />} compact onClick={() => navigate(routes.settings("plus"))} />
      </div>
    );
  }
  return <SmartPickingToggle />;
}

/** The switch for Smart source picking. Kept on this device (see state/smartPicking.ts). */
function SmartPickingToggle() {
  const enabled = useSmartPicking((s) => s.enabled);
  const setEnabled = useSmartPicking((s) => s.setEnabled);
  return (
    <div className="plus__setting">
      <Surface className="homerow__toggle" scale={1.02} borderColor="var(--text)" onClick={() => setEnabled(!enabled)} role="switch" ariaLabel="Smart source picking" ariaChecked={enabled}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="t-body-md" style={{ display: "block", color: enabled ? "var(--text)" : "var(--text-2)" }}>Smart source picking</span>
          <span className="t-label-sm c-text-3" style={{ display: "block" }}>Skip the source list and start the best source this device can play. If none surely plays, you still get the list.</span>
        </span>
        <Switch checked={enabled} white />
      </Surface>
    </div>
  );
}

/** Settings → ArcTV Plus: for a paying monthly or yearly subscriber, when it renews and a way to cancel it. Lifetime (and no Plus) shows nothing. */
function PlusSubscription() {
  const plus = usePlus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void usePlus.getState().pull();
  }, []);
  if (!plus.paywall || !plus.active || (plus.plan !== "monthly" && plus.plan !== "yearly")) return null;
  const planLabel = PLUS_PLANS.find((p) => p.id === plus.plan)?.label ?? "";
  const until = plus.validUntil ? new Date(plus.validUntil).toLocaleDateString() : null;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await plus.cancelSubscription();
      setConfirming(false);
    } catch (e) {
      setError(
        e instanceof ApiClientError && e.status === 409
          ? "Lifetime Plus has no subscription to cancel."
          : e instanceof ApiClientError && e.status === 404 && /subscription/i.test(e.message)
            ? "We couldn't find a subscription to cancel on this account."
            : e instanceof ApiClientError && e.status === 429
              ? e.message
              : "Couldn't cancel your subscription. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="accountplus">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-label-sm c-text-3">ArcTV Plus · {planLabel}</div>
        <div className="t-body-md">
          {plus.cancelAtPeriodEnd ? `Your subscription won't renew.${until ? ` You keep Plus until ${until}.` : ""}` : until ? `Renews on ${until}.` : "Active."}
        </div>
      </div>
      {plus.cancelAtPeriodEnd ? null : <ArcButton text="Cancel subscription" icon={<MdCancel />} compact onClick={() => { setError(null); setConfirming(true); }} />}
      {confirming ? (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && setConfirming(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label={`Cancel your ${planLabel.toLowerCase()} subscription?`} data-spatial-trap="true" style={{ flexDirection: "column", width: "min(480px, 100%)" }}>
            <h2 className="t-title-lg" style={{ margin: 0 }}>Cancel your {planLabel.toLowerCase()} subscription?</h2>
            <p className="c-text-2 t-body-md">{until ? `You keep ArcTV Plus until ${until}. After that it won't renew and you won't be charged again.` : "You keep ArcTV Plus until the end of the period you've paid for. After that it won't renew and you won't be charged again."}</p>
            {error ? <p className="t-body-sm" role="alert" style={{ margin: 0, color: "var(--coral)" }}>{error}</p> : null}
            <div className="dialog__actions">
              <ArcButton text="Keep Plus" icon={<MdCheck />} variant="filled" disabled={busy} onClick={() => setConfirming(false)} dataAttrs={{ autofocus: true }} />
              <ArcButton text={busy ? "Cancelling…" : "Cancel subscription"} icon={<MdCancel />} disabled={busy} onClick={() => void cancel()} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddonsPane() {
  const addons = useAddons((s) => s.addons);
  const setEnabled = useAddons((s) => s.setEnabled);
  const remove = useAddons((s) => s.remove);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState<string | null>(null);
  const target = addons.find((a) => a.manifestUrl === confirming);
  return (
    <div className="addons">
      <div className="addons__head">
        <p className="t-body-sm c-text-2" style={{ margin: 0, flex: 1 }}>Stremio-compatible addons contribute their catalogs directly into Home.</p>
        <ArcButton text="Add Addon" icon={<MdAdd />} variant="filled" compact onClick={() => navigate(routes.addAddon)} />
      </div>
      <p className="addons__notice t-body-sm" role="note">
        <MdInfo aria-hidden="true" />
        <span>
          <strong>Only addons with a debrid service will play.</strong> Arc TV plays links, not torrents: <Link to={routes.debridGuide}>Step-by-step guide to setting one up</Link>.
        </span>
      </p>
      {addons.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <MdExtension className="c-text-3" size={32} aria-hidden="true" />
          <div className="t-title-md" style={{ marginTop: 12 }}>No addons installed yet</div>
          <p className="t-body-sm c-text-2" style={{ margin: "6px 0 0" }}>Add a Stremio-compatible addon to bring its catalog into Arc TV.</p>
        </div>
      ) : (
        <ul className="addons__list">
          {addons.map((addon) => (
            <li className="addon" key={addon.manifestUrl}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="t-title-md">{addon.manifest.name}</span>
                  <span className="t-label-sm c-text-3">v{addon.manifest.version}</span>
                </div>
                {addon.manifest.description ? <p className="t-body-sm c-text-2 clamp-2" style={{ margin: "4px 0 0" }}>{addon.manifest.description}</p> : null}
                {addon.manifest.types.length ? <p className="t-label-sm c-text-3" style={{ margin: "6px 0 0" }}>{addon.manifest.types.map((t) => t[0]!.toUpperCase() + t.slice(1)).join("  ·  ")}</p> : null}
              </div>
              <button type="button" role="switch" aria-checked={addon.enabled} aria-label={`${addon.manifest.name} enabled`} className="switchbtn" onClick={() => setEnabled(addon.manifestUrl, !addon.enabled)}>
                <Switch checked={addon.enabled} />
              </button>
              <Surface className="ibtn ibtn--flat" radius="8px" background="var(--bg)" borderColor="var(--text)" onClick={() => setConfirming(addon.manifestUrl)} ariaLabel={`Remove ${addon.manifest.name}`} title={`Remove ${addon.manifest.name}`}>
                <MdDelete />
              </Surface>
            </li>
          ))}
        </ul>
      )}
      {target ? (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setConfirming(null)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label={`Remove ${target.manifest.name}?`} data-spatial-trap="true" style={{ flexDirection: "column", maxWidth: 480 }}>
            <h2 className="t-title-lg" style={{ margin: 0 }}>Remove {target.manifest.name}?</h2>
            <p className="c-text-2 t-body-md">Its catalogs will disappear from Home on every device signed in to this account.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <ArcButton text="Cancel" icon={<MdCheck />} onClick={() => setConfirming(null)} dataAttrs={{ autofocus: true }} />
              <ArcButton
                text="Remove"
                icon={<MdDelete />}
                variant="filled"
                onClick={() => {
                  remove(target.manifestUrl);
                  setConfirming(null);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** AddAddonScreen.kt — the Firestick pairs a phone over the LAN; in a browser you simply paste the manifest URL. */
export function AddAddonScreen() {
  const install = useAddons((s) => s.install);
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "installing" } | { kind: "success"; name: string } | { kind: "error"; message: string }>({ kind: "idle" });
  useEffect(() => {
    document.title = "Add Addon · Arc TV";
  }, []);
  useEffect(() => {
    if (state.kind !== "success") return;
    const t = window.setTimeout(() => navigate(routes.settings("addons")), 1100);
    return () => window.clearTimeout(t);
  }, [state, navigate]);
  const submit = async (raw: string) => {
    setState({ kind: "installing" });
    try {
      const addon = await install(raw);
      setState({ kind: "success", name: addon.manifest.name });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message || "Couldn't install that addon." });
    }
  };
  return (
    <div className="page">
      <h1 className="t-display-md page__title">Add Addon</h1>
      <form
        className="addaddon"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(url);
        }}
      >
        <h2 className="t-title-lg" style={{ margin: 0 }}>Enter the manifest URL</h2>
        <p className="t-body-sm c-text-2" style={{ margin: "6px 0 16px" }}>Paste the addon's link — <code>https://…/manifest.json</code> or a <code>stremio://</code> link.</p>
        <label className="sr-only" htmlFor="addon-url">Addon manifest URL</label>
        <input id="addon-url" className="mfield" type="url" inputMode="url" placeholder="https://example.com/manifest.json" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus="true" />
        <div style={{ marginTop: 18 }}>
          <ArcButton text="Install" icon={<MdCloudUpload />} variant="filled" type="submit" disabled={state.kind === "installing"} />
        </div>
        <div style={{ marginTop: 24 }} aria-live="polite">
          {state.kind === "installing" ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Spinner small /><span className="c-text-2 t-body-md">Installing…</span></div> : null}
          {state.kind === "success" ? <p className="c-accent t-body-lg" style={{ margin: 0 }}>{state.name} installed ✓</p> : null}
          {state.kind === "error" ? <p className="c-coral t-body-md" role="alert" style={{ margin: 0 }}>Couldn't install that addon: {state.message}</p> : null}
        </div>
        <div className="addaddon__suggest">
          <p className="t-label-md c-text-2" style={{ margin: "0 0 8px" }}>Official</p>
          <ArcButton text="Add Cinemeta (default catalogs)" icon={<MdExtension />} compact onClick={() => { setUrl(CINEMETA_MANIFEST_URL); void submit(CINEMETA_MANIFEST_URL); }} />
        </div>
      </form>
    </div>
  );
}

function HomeRowsPane() {
  const providers = useProviders((s) => s.providers);
  const ready = useAddonsReady();
  const prefs = useSettings((s) => s.homeRows);
  const setRowHidden = useSettings((s) => s.setRowHidden);
  const setRowOrder = useSettings((s) => s.setRowOrder);
  const [rows, setRows] = useState<HomeSection[] | null>(null);
  useEffect(() => {
    if (!ready || providers.length === 0) return setRows(null);
    let cancelled = false;
    setRows(null);
    void Promise.all(
      providers.map(async (p) => {
        const out: HomeSection[] = [];
        try {
          for await (const batch of p.getHomeSections()) out.push(...batch);
        } catch {
          /* a failing addon just contributes no rows */
        }
        return out;
      }),
    ).then((lists) => !cancelled && setRows(lists.flat()));
    return () => {
      cancelled = true;
    };
  }, [providers, ready]);
  const ordered = useMemo(() => (rows ? applyRowOrder(rows, prefs) : []), [rows, prefs]);
  const displayOrder = useMemo(() => ordered.map((r) => r.id), [ordered]);

  if (!ready) return <Spinner />;
  if (providers.length === 0) return <p className="c-text-2 t-body-md">Install an addon first — its rows will show up here once it's added.</p>;
  if (rows === null) return <Spinner />;
  if (rows.length === 0) return <p className="c-text-2 t-body-md">Your installed addons aren't reporting any rows right now.</p>;
  return (
    <div>
      <p className="t-body-sm c-text-2" style={{ margin: "0 0 8px" }}>Toggle categories on or off, and use the arrows to reorder them.</p>
      <ul className="homerows">
        {ordered.map((row, index) => {
          const visible = !prefs.hiddenRowIds.includes(row.id);
          const move = (delta: number) => {
            const next = moveRow(displayOrder, row.id, delta);
            if (next) setRowOrder(next);
          };
          return (
            <li key={row.id} className="homerow">
              <Surface className="homerow__toggle" scale={1.02} borderColor="var(--text)" onClick={() => setRowHidden(row.id, visible)} role="switch" ariaLabel={row.title} ariaChecked={visible}>
                <span className="t-body-md" style={{ flex: 1, color: visible ? "var(--text)" : "var(--text-3)" }}>{row.title}</span>
                <span className="t-label-sm" style={{ color: visible ? "var(--text-2)" : "var(--text-3)" }}>{pluralize(row.items.length, "title")}</span>
                <Switch checked={visible} white />
              </Surface>
              <Surface className="homerow__move" radius="8px" background="var(--surface)" borderColor="var(--text)" onClick={() => move(-1)} disabled={index === 0} ariaLabel={`Move ${row.title} up`}><MdArrowUpward /></Surface>
              <Surface className="homerow__move" radius="8px" background="var(--surface)" borderColor="var(--text)" onClick={() => move(1)} disabled={index === ordered.length - 1} ariaLabel={`Move ${row.title} down`}><MdArrowDownward /></Surface>
            </li>
          );
        })}
      </ul>
      <p className="t-label-sm c-text-3" style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}><MdInfo aria-hidden="true" /> Changes are saved automatically</p>
    </div>
  );
}

function SoundsPane() {
  const volume = useSettings((s) => s.navigationVolume);
  const setVolume = useSettings((s) => s.setNavigationVolume);
  return (
    <div>
      <p className="t-body-sm c-text-2" style={{ margin: "0 0 10px" }}>Applies to the navigation and click sounds.</p>
      <div className="volume">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <MdVolumeUp aria-hidden="true" />
          <label htmlFor="volume" className="t-body-lg" style={{ flex: 1 }}>Navigation Volume</label>
          <span className="t-label-md c-text-2">{Math.round(volume * 100)}%</span>
        </div>
        <input id="volume" className="range" type="range" min={0} max={100} step={10} style={{ ["--fill" as string]: `${Math.round(volume * 100)}%` }} value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} onPointerUp={playPreview} onKeyUp={playPreview} aria-valuetext={`${Math.round(volume * 100)} percent`} data-autofocus="true" />
      </div>
    </div>
  );
}

export const SUBTITLE_LANGUAGES: Array<{ code: string | null; label: string }> = [
  { code: null, label: "System Default" }, { code: "en", label: "English" }, { code: "es", label: "Spanish" }, { code: "fr", label: "French" }, { code: "de", label: "German" }, { code: "it", label: "Italian" }, { code: "pt", label: "Portuguese" }, { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" }, { code: "pl", label: "Polish" }, { code: "tr", label: "Turkish" }, { code: "ar", label: "Arabic" }, { code: "hi", label: "Hindi" }, { code: "ja", label: "Japanese" }, { code: "ko", label: "Korean" }, { code: "zh", label: "Chinese" },
];

function SubtitlesPane() {
  const player = useSettings((s) => s.player);
  const setPlayer = useSettings((s) => s.setPlayer);
  return (
    <div>
      <Surface className="settingrow" scale={1.02} borderColor="var(--text)" onClick={() => setPlayer({ subtitlesEnabled: !player.subtitlesEnabled })} role="switch" ariaChecked={player.subtitlesEnabled} ariaLabel="Subtitles" dataAttrs={{ autofocus: true }}>
        <span className="t-title-md" style={{ flex: 1 }}>Subtitles</span>
        <Switch checked={player.subtitlesEnabled} />
      </Surface>
      <h3 className="t-title-md" style={{ margin: "16px 0 0" }}>Default Language</h3>
      <p className="t-body-sm c-text-2" style={{ margin: "4px 0 8px" }}>Used to automatically pick a matching subtitle track when Subtitles is on.</p>
      <div className="langlist" role="radiogroup" aria-label="Default subtitle language">
        {SUBTITLE_LANGUAGES.map((option) => {
          const selected = option.code === player.defaultSubtitleLanguage;
          return (
            <Surface key={option.code ?? "system"} className="settingrow settingrow--lang" scale={1.02} borderColor="var(--text)" role="radio" ariaChecked={selected} onClick={() => setPlayer({ defaultSubtitleLanguage: option.code })}>
              <span className="t-body-lg" style={{ flex: 1 }}>{option.label}</span>
              {selected ? <MdCheck className="c-accent" aria-hidden="true" /> : null}
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

function AudioPane() {
  const player = useSettings((s) => s.player);
  const setPlayer = useSettings((s) => s.setPlayer);
  return (
    <div>
      <h3 className="t-title-md" style={{ margin: "0" }}>Preferred Audio Language</h3>
      <p className="t-body-sm c-text-2" style={{ margin: "4px 0 8px" }}>Picked automatically when a video has a matching audio track. Shared with your Firestick.</p>
      <div className="langlist" role="radiogroup" aria-label="Preferred audio language">
        {SUBTITLE_LANGUAGES.map((option, index) => {
          const selected = option.code === player.defaultAudioLanguage;
          return (
            <Surface key={option.code ?? "auto"} className="settingrow settingrow--lang" scale={1.02} borderColor="var(--text)" role="radio" ariaChecked={selected} onClick={() => setPlayer({ defaultAudioLanguage: option.code })} dataAttrs={index === 0 ? { autofocus: true } : undefined}>
              <span className="t-body-lg" style={{ flex: 1 }}>{option.code === null ? "Automatic" : option.label}</span>
              {selected ? <MdCheck className="c-accent" aria-hidden="true" /> : null}
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
