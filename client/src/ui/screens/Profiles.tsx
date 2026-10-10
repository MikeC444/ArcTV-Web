import { useEffect, useRef, useState, type FormEvent } from "react";
import { MdAdd, MdCheck, MdClose, MdDelete, MdEdit, MdLock, MdWorkspacePremium } from "react-icons/md";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AVATARS, avatarById, isValidPin, PIN_LENGTH, PROFILE_NAME_MAX, type Profile, type ProfileKind } from "../../domain/profiles";
import { ApiClientError } from "../../lib/api";
import { routes } from "../../lib/routes";
import { useProfiles } from "../../state/profiles";
import { signOutAndWipe } from "../../state/sync";
import { ArcButton, Switch } from "../components/Buttons";
import { ArcLogo } from "../components/Logo";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { Surface } from "../components/Surface";

const messageOf = (error: unknown): string => (error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.");

/** Where to go once a profile is open: the page the picker interrupted, else Home. */
function useFrom(): string {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return from && from !== routes.profiles ? from : "/";
}

/** Escape closes a dialog wherever focus is (it may still be on the page behind, or nowhere, after a tile was clicked). */
function useEscape(onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

/** The 4-digit PIN field every PIN prompt uses: digits only, masked, with the numeric keypad on phones. */
function PinInput({ value, onChange, label, autoFocus, id }: { value: string; onChange: (pin: string) => void; label: string; autoFocus?: boolean; id?: string }) {
  return (
    <input
      id={id}
      className="pinfield"
      type="password"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      maxLength={PIN_LENGTH}
      value={value}
      aria-label={label}
      placeholder="••••"
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
    />
  );
}

/** "Who's watching?" — also where profiles are added, edited and removed ("Manage profiles"). */
export function ProfilesScreen() {
  const { profiles, plus, supported, limit, activeId, ready, chosen } = useProfiles();
  const select = useProfiles((s) => s.select);
  const navigate = useNavigate();
  const from = useFrom();
  const [managing, setManaging] = useState(false);
  const [locked, setLocked] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${managing ? "Manage profiles" : "Who's watching?"} · Arc TV`;
  }, [managing]);

  /** Opens a profile. A different profile means a different library, so the app starts over on it (nothing of the last one stays in memory). */
  async function open(profile: Profile, pin?: string) {
    setBusy(true);
    setError(null);
    try {
      const different = await select(profile.id, pin);
      if (different) window.location.assign(from);
      else navigate(from, { replace: true });
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "pin_required") setLocked(profile);
      else setError(messageOf(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const onTile = (profile: Profile) => {
    if (managing) setEditing(profile);
    else if (profile.hasPin) setLocked(profile);
    else void open(profile).catch(() => undefined);
  };

  const canAdd = supported && plus && profiles.length < limit;

  return (
    <main className="profiles" id="main" aria-busy={!ready}>
      <header className="profiles__top">
        <ArcLogo size={32} />
        <button type="button" className="profiles__switch" onClick={() => void signOutAndWipe()}>
          Switch account
        </button>
      </header>
      <div className="profiles__body">
        <h1 className="t-display-md profiles__title">{managing ? "Manage profiles." : "Welcome back to ArcTV."}</h1>
        <p className="profiles__ask">{managing ? "Choose a profile to change." : "Who's watching today?"}</p>
        <p className="t-body-lg c-text-2 profiles__hint">{managing ? "Rename it, change its picture, lock it with a PIN or remove it." : "Choose your profile to pick up where you left off."}</p>
        {error ? (
          <p className="profiles__error" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="profiles__grid" aria-label="Profiles">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <Surface
                className="profiletile"
                radius="calc(14 * var(--dp))"
                borderColor="var(--text)"
                alwaysBorder={!managing && profile.id === activeId}
                onClick={() => onTile(profile)}
                disabled={busy}
                ariaLabel={`${managing ? "Edit " : ""}${profile.name}${profile.kind === "kids" ? ", kids profile" : ""}${profile.hasPin ? ", locked with a PIN" : ""}`}
                dataAttrs={{ autofocus: profile.id === activeId, current: profile.id === activeId }}
              >
                <ProfileAvatar avatar={profile.avatar} />
                {profile.hasPin ? (
                  <span className="profiletile__badge" aria-hidden="true">
                    <MdLock />
                  </span>
                ) : null}
                {managing ? (
                  <span className="profiletile__edit" aria-hidden="true">
                    <MdEdit />
                  </span>
                ) : null}
              </Surface>
              <div className="profiletile__name">{profile.name}</div>
              {profile.kind === "kids" ? <div className="profiletile__kind">Kids</div> : null}
            </li>
          ))}
          {canAdd ? (
            <li>
              <Surface className="profiletile profiletile--add" radius="calc(14 * var(--dp))" borderColor="var(--text)" onClick={() => setEditing("new")} ariaLabel="Add profile">
                <span className="profiletile__plus" aria-hidden="true">
                  <MdAdd />
                </span>
              </Surface>
              <div className="profiletile__name">Add profile</div>
            </li>
          ) : null}
        </ul>

        {supported && plus ? (
          <div className="profiles__actions">
            <ArcButton text={managing ? "Done" : "Manage profiles"} icon={managing ? <MdCheck /> : <MdEdit />} compact onClick={() => setManaging((m) => !m)} />
            {profiles.length >= limit ? <p className="t-label-sm c-text-3">An account can have up to {limit} profiles.</p> : null}
          </div>
        ) : null}

        {ready && supported && !plus ? (
          <div className="profiles__upsell">
            <MdWorkspacePremium aria-hidden="true" />
            <div>
              <div className="t-title-md">More profiles come with ArcTV Plus</div>
              <p className="t-body-sm c-text-2" style={{ margin: "4px 0 0" }}>
                Give everyone at home their own My List, Continue Watching and recommendations, add kids profiles, and lock any profile with a PIN.
              </p>
            </div>
            <Link className="profiles__link" to={routes.settings("plus")}>
              See ArcTV Plus
            </Link>
          </div>
        ) : null}
        {ready && !supported ? <p className="t-body-sm c-text-2 profiles__hint">Profiles aren't available yet. Everything you watch stays in your account's one library for now.</p> : null}
        {!managing && ready && (chosen || !plus || !supported) ? (
          <p className="profiles__skip">
            <Link to={from}>Back</Link>
          </p>
        ) : null}
      </div>

      {locked ? (
        <PinDialog
          profile={locked}
          onCancel={() => setLocked(null)}
          onSubmit={async (pin) => {
            await open(locked, pin);
          }}
        />
      ) : null}
      {editing ? <ProfileEditor profile={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </main>
  );
}

/** Asks for a locked profile's PIN. A wrong one keeps the box open with the reason. */
function PinDialog({ profile, onCancel, onSubmit }: { profile: Profile; onCancel: () => void; onSubmit: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  useEscape(onCancel);

  async function submit(value: string) {
    if (submitting.current || !isValidPin(value)) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (e) {
      setError(messageOf(e));
      setPin("");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="dialog profilepin"
        role="dialog"
        aria-modal="true"
        aria-label={`Enter the PIN for ${profile.name}`}
        data-spatial-trap="true"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit(pin);
        }}
      >
        <ProfileAvatar avatar={profile.avatar} size="calc(72 * var(--dp))" />
        <h2 className="t-title-lg" style={{ margin: 0 }}>
          Enter PIN for {profile.name}
        </h2>
        <PinInput
          value={pin}
          label={`PIN for ${profile.name}`}
          autoFocus
          onChange={(value) => {
            setPin(value);
            if (value.length === PIN_LENGTH) void submit(value);
          }}
        />
        <p className="profiles__error" role="alert" style={{ minHeight: "1.4em" }}>
          {error}
        </p>
        <div className="profilepin__buttons">
          <ArcButton text="Cancel" icon={<MdClose />} onClick={onCancel} />
          <ArcButton text="Open" icon={<MdLock />} variant="filled" type="submit" disabled={busy || !isValidPin(pin)} />
        </div>
      </form>
    </div>
  );
}

/** Add a profile, or change / remove one. A locked profile asks for its current PIN to be changed or removed. */
function ProfileEditor({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const { create, update, remove, profiles } = useProfiles();
  const [name, setName] = useState(profile?.name ?? "");
  const [avatar, setAvatar] = useState(profile ? avatarById(profile.avatar).id : AVATARS[profiles.length % AVATARS.length]!.id);
  const [kind, setKind] = useState<ProfileKind>(profile?.kind ?? "adult");
  const [lock, setLock] = useState(profile?.hasPin ?? false);
  const [newPin, setNewPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = profile !== null;
  const wasLocked = profile?.hasPin === true;
  const kindFixed = profile?.isDefault === true;
  useEscape(() => !busy && onClose());

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim() === "") return setError("Give the profile a name.");
    if (wasLocked && !isValidPin(currentPin)) return setError("Enter this profile's current PIN to change it.");
    if (lock && (!wasLocked || newPin !== "") && !isValidPin(newPin)) return setError(`A PIN is ${PIN_LENGTH} digits.`);
    setBusy(true);
    try {
      if (!profile) await create({ name: name.trim(), avatar, kind, ...(lock ? { pin: newPin } : {}) });
      else {
        const pin = lock ? (newPin !== "" ? newPin : undefined) : wasLocked ? null : undefined;
        await update(profile.id, { name: name.trim(), avatar, ...(kindFixed ? {} : { kind }), ...(pin !== undefined ? { pin } : {}) }, wasLocked ? currentPin : undefined);
      }
      onClose();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function doRemove() {
    if (!profile) return;
    if (wasLocked && !isValidPin(currentPin)) {
      setConfirmRemove(false);
      return setError("Enter this profile's current PIN to remove it.");
    }
    setBusy(true);
    try {
      await remove(profile.id, wasLocked ? currentPin : undefined);
      onClose();
    } catch (err) {
      setConfirmRemove(false);
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? `Edit ${profile.name}` : "Add profile";
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="dialog profileedit" role="dialog" aria-modal="true" aria-label={title} data-spatial-trap="true" onSubmit={(e) => void save(e)}>
        <h2 className="t-title-lg" style={{ margin: 0 }}>
          {title}
        </h2>

        <div className="profileedit__row">
          <ProfileAvatar avatar={avatar} size="calc(84 * var(--dp))" label={`${avatarById(avatar).label} picture`} />
          <div className="profileedit__field">
            <label htmlFor="profile-name" className="t-label-md c-text-2">
              Name
            </label>
            <input id="profile-name" className="mfield" value={name} maxLength={PROFILE_NAME_MAX} autoComplete="off" autoFocus={!editing} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          </div>
        </div>

        <fieldset className="profileedit__group">
          <legend className="t-label-md c-text-2">Picture</legend>
          <div className="profileedit__avatars" role="radiogroup" aria-label="Picture">
            {AVATARS.map((a) => (
              <Surface key={a.id} className="profileedit__avatar" radius="calc(10 * var(--dp))" borderColor="var(--text)" scale={1.06} role="radio" ariaChecked={a.id === avatar} alwaysBorder={a.id === avatar} ariaLabel={a.label} onClick={() => setAvatar(a.id)}>
                <ProfileAvatar avatar={a.id} />
              </Surface>
            ))}
          </div>
        </fieldset>

        <fieldset className="profileedit__group">
          <legend className="t-label-md c-text-2">Who is it for?</legend>
          <div className="profileedit__kinds" role="radiogroup" aria-label="Profile type">
            {(["adult", "kids"] as const).map((k) => (
              <Surface key={k} className="pill" radius="999px" role="radio" ariaChecked={kind === k} disabled={kindFixed && k === "kids"} onClick={() => setKind(k)} dataAttrs={{ selected: kind === k ? "true" : "false" }}>
                {k === "adult" ? "Adult" : "Kids"}
              </Surface>
            ))}
          </div>
          <p className="t-label-sm c-text-3" style={{ margin: "6px 0 0" }}>
            {kindFixed ? "The account's own profile is always an adult profile." : "A kids profile hides horror, thriller, crime, war and mystery titles, and has no Settings."}
          </p>
        </fieldset>

        <div className="profileedit__group">
          <div className="profileedit__lock">
            <div style={{ flex: 1 }}>
              <div className="t-title-md">Lock with a PIN</div>
              <div className="t-label-sm c-text-3">Asked when this profile is opened, changed or removed.</div>
            </div>
            <button type="button" role="switch" aria-checked={lock} aria-label="Lock with a PIN" className="switchbtn" onClick={() => setLock((l) => !l)}>
              <Switch checked={lock} />
            </button>
          </div>
          {wasLocked ? (
            <div className="profileedit__pin">
              <label htmlFor="profile-current-pin" className="t-label-md c-text-2">
                Current PIN
              </label>
              <PinInput id="profile-current-pin" value={currentPin} onChange={setCurrentPin} label="Current PIN" />
            </div>
          ) : null}
          {lock ? (
            <div className="profileedit__pin">
              <label htmlFor="profile-new-pin" className="t-label-md c-text-2">
                {wasLocked ? "New PIN (leave empty to keep it)" : "PIN"}
              </label>
              <PinInput id="profile-new-pin" value={newPin} onChange={setNewPin} label={wasLocked ? "New PIN" : "PIN"} />
            </div>
          ) : null}
        </div>

        <p className="profiles__error" role="alert" style={{ minHeight: "1.4em", margin: 0 }}>
          {error}
        </p>

        {confirmRemove && profile ? (
          <div className="profileedit__confirm" role="alertdialog" aria-label={`Remove ${profile.name}?`}>
            <p className="c-text-2 t-body-md" style={{ margin: 0 }}>
              Remove {profile.name}? Its My List, Continue Watching, settings and recommendations are deleted for good.
            </p>
            <div className="profilepin__buttons">
              <ArcButton text="Keep it" icon={<MdCheck />} onClick={() => setConfirmRemove(false)} dataAttrs={{ autofocus: true }} />
              <ArcButton text="Remove" icon={<MdDelete />} variant="filled" disabled={busy} onClick={() => void doRemove()} />
            </div>
          </div>
        ) : (
          <div className="profilepin__buttons">
            {editing && !profile.isDefault ? <ArcButton text="Remove" icon={<MdDelete />} onClick={() => setConfirmRemove(true)} disabled={busy} /> : null}
            <span style={{ flex: 1 }} />
            <ArcButton text="Cancel" icon={<MdClose />} onClick={onClose} disabled={busy} />
            <ArcButton text={editing ? "Save" : "Create"} icon={<MdCheck />} variant="filled" type="submit" disabled={busy} />
          </div>
        )}
      </form>
    </div>
  );
}
