import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MdAccountCircle, MdAdd, MdArrowDownward, MdArrowUpward, MdCheck, MdCloudUpload, MdDelete, MdExtension, MdGridView, MdInfo, MdLogout, MdMusicNote, MdSubtitles, MdVolumeUp } from "react-icons/md";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { applyRowOrder, moveRow } from "../../domain/homeRows";
import { useProviders } from "../../domain/registry";
import type { HomeSection } from "../../domain/types";
import { pluralize } from "../../lib/format";
import { playPreview } from "../../lib/sounds";
import { routes } from "../../lib/routes";
import { useAddons, CINEMETA_MANIFEST_URL } from "../../state/addons";
import { useAuth } from "../../state/auth";
import { useAddonsReady } from "../../state/hooks";
import { useSettings } from "../../state/settings";
import { signOutAndWipe } from "../../state/sync";
import { MangoButton, Switch } from "../components/Buttons";
import { Spinner } from "../components/States";
import { Surface } from "../components/Surface";

type Tab = "account" | "addons" | "home-rows" | "sounds" | "subtitles";
const CATEGORIES: Array<{ id: Tab; icon: ReactNode; title: string; subtitle: string }> = [
  { id: "account", icon: <MdAccountCircle />, title: "Account", subtitle: "Manage your ArcTV account" },
  { id: "addons", icon: <MdExtension />, title: "Addons", subtitle: "Manage installed content providers" },
  { id: "home-rows", icon: <MdGridView />, title: "Home Rows", subtitle: "Choose which rows show up on Home" },
  { id: "sounds", icon: <MdMusicNote />, title: "Sounds", subtitle: "Choose your app boot sound" },
  { id: "subtitles", icon: <MdSubtitles />, title: "Subtitles", subtitle: "Default on/off and preferred language" },
];
const isTab = (value: string | undefined): value is Tab => CATEGORIES.some((c) => c.id === value);

/** ui/settings/SettingsScreen.kt — two panes: categories on the left, the selected category's settings on the right. */
export function SettingsScreen() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const selected: Tab = isTab(tab) ? tab : "account";
  const category = CATEGORIES.find((c) => c.id === selected)!;
  useEffect(() => {
    document.title = `Settings · ${category.title} · Arc TV`;
  }, [category]);
  if (tab && !isTab(tab) && tab !== "addons") return <Navigate to="/settings" replace />;

  return (
    <div className="page">
      <h1 className="t-display-md page__title">Settings</h1>
      <div className="settings">
        <nav className="settings__side" aria-label="Settings categories">
          {CATEGORIES.map((c) => (
            <Surface key={c.id} className="settings__cat" onClick={() => navigate(routes.settings(c.id))} alwaysBorder={c.id === selected} borderColor="var(--text)" scale={1.02} ariaCurrent={c.id === selected ? "page" : undefined} dataAttrs={{ selected: c.id === selected, autofocus: c.id === selected }}>
              {c.icon}
              <span className="t-title-md">{c.title}</span>
            </Surface>
          ))}
        </nav>
        <section className="settings__pane" aria-labelledby="pane-title">
          <h2 id="pane-title" className="t-title-lg" style={{ margin: 0 }}>{category.title}</h2>
          <p className="t-body-sm c-text-2" style={{ margin: "4px 0 14px" }}>{category.subtitle}</p>
          {selected === "account" ? <AccountPane /> : null}
          {selected === "addons" ? <AddonsPane /> : null}
          {selected === "home-rows" ? <HomeRowsPane /> : null}
          {selected === "sounds" ? <SoundsPane /> : null}
          {selected === "subtitles" ? <SubtitlesPane /> : null}
        </section>
      </div>
    </div>
  );
}

function AccountPane() {
  const user = useAuth((s) => s.user);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {user ? (
        <>
          <div className="t-title-md">{user.displayName ?? user.email}</div>
          {user.displayName ? <div className="t-body-sm c-text-2">{user.email}</div> : null}
        </>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <MangoButton
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
        <MangoButton text="Add Addon" icon={<MdAdd />} variant="filled" compact onClick={() => navigate(routes.addAddon)} />
      </div>
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
              <MangoButton text="Cancel" icon={<MdCheck />} onClick={() => setConfirming(null)} dataAttrs={{ autofocus: true }} />
              <MangoButton
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
          <MangoButton text="Install" icon={<MdCloudUpload />} variant="filled" type="submit" disabled={state.kind === "installing"} />
        </div>
        <div style={{ marginTop: 24 }} aria-live="polite">
          {state.kind === "installing" ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Spinner small /><span className="c-text-2 t-body-md">Installing…</span></div> : null}
          {state.kind === "success" ? <p className="c-amber t-body-lg" style={{ margin: 0 }}>{state.name} installed ✓</p> : null}
          {state.kind === "error" ? <p className="c-coral t-body-md" role="alert" style={{ margin: 0 }}>Couldn't install that addon: {state.message}</p> : null}
        </div>
        <div className="addaddon__suggest">
          <p className="t-label-md c-text-2" style={{ margin: "0 0 8px" }}>Official</p>
          <MangoButton text="Add Cinemeta (default catalogs)" icon={<MdExtension />} compact onClick={() => { setUrl(CINEMETA_MANIFEST_URL); void submit(CINEMETA_MANIFEST_URL); }} />
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
              {selected ? <MdCheck className="c-amber" aria-hidden="true" /> : null}
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
