import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MdAdd, MdChevronRight, MdEdit, MdPerson, MdQrCode2, MdVisibility, MdVisibilityOff, MdWifiOff } from "react-icons/md";
import QRCode from "qrcode";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import heroImage from "../../assets/img/auth_hero_living_room.webp";
import { api, ApiClientError } from "../../lib/api";
import { routes } from "../../lib/routes";
import { useAuth, validateCredentials, type SessionUser } from "../../state/auth";
import { MangoButton } from "../components/Buttons";
import { MangoLogo } from "../components/Logo";
import { FullScreenError, Spinner } from "../components/States";

/** Where to go once signed in: the deep link the person was heading to, else Home. */
function useAfterAuth(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return useCallback(() => navigate(from && from !== routes.auth ? from : "/", { replace: true }), [navigate, from]);
}

const intentOf = (value: string | undefined): "login" | "register" => (value === "register" ? "register" : "login");

/** AuthStartScreen.kt — "Your Entertainment, Your Way", hero photo fading into the background, Log In / Sign Up. */
export function AuthStartScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = useAuth((s) => s.notice);
  const clearNotice = useAuth((s) => s.clearNotice);
  useEffect(() => {
    document.title = "Welcome · Mango TV";
  }, []);
  return (
    <div className="authstart">
      <img className="authstart__hero" src={heroImage} alt="" />
      <div className="authstart__scrim" />
      <div className="authstart__col">
        <MangoLogo size={32} />
        {notice ? (
          <p className="authstart__notice" role="status" onAnimationEnd={undefined}>
            {notice}
          </p>
        ) : null}
        <h1 className="t-display-md authstart__headline">
          Your Entertainment,
          <br />
          <span className="brand-text">Your Way</span>
        </h1>
        <p className="t-body-lg c-text-2">Stream the latest movies, TV shows and more. Create an account to get the full experience.</p>
        <div className="authstart__buttons">
          <MangoButton text="Log In" icon={<MdPerson />} trailingChevron variant="filled" fullWidth dataAttrs={{ autofocus: true }} onClick={() => { clearNotice(); navigate(routes.authMethod("login"), { state: location.state }); }} />
          <MangoButton text="Sign Up" icon={<MdAdd />} trailingChevron fullWidth onClick={() => { clearNotice(); navigate(routes.authMethod("register"), { state: location.state }); }} />
        </div>
        <p className="authstart__qr t-label-md c-text-3">
          <MdQrCode2 aria-hidden="true" /> Scan a QR code to create an account from your phone
        </p>
      </div>
    </div>
  );
}

/** AuthMethodScreen.kt — "Scan a QR Code" or type credentials (on the TV: "Type on My Remote"). */
export function AuthMethodScreen() {
  const { intent: raw } = useParams();
  const intent = intentOf(raw);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="authcenter">
      <div className="authcenter__col">
        <h1 className="t-headline-sm" style={{ textAlign: "center", margin: 0 }}>{intent === "register" ? "How would you like to create your account?" : "How would you like to sign in?"}</h1>
        <div className="authcenter__buttons">
          <MangoButton text="Scan a QR Code" icon={<MdQrCode2 />} variant="filled" fullWidth dataAttrs={{ autofocus: true }} onClick={() => navigate(routes.authQr(intent), { state: location.state })} />
          <MangoButton text="Use Email & Password" icon={<MdEdit />} fullWidth onClick={() => navigate(routes.authPassword(intent), { state: location.state })} />
        </div>
      </div>
    </div>
  );
}

/** PasswordSignInScreen.kt — email + password (+ display name when creating). Same validation rules as the TV. */
export function PasswordSignInScreen() {
  const { intent: raw } = useParams();
  const [mode, setMode] = useState<"login" | "register">(intentOf(raw));
  const login = useAuth((s) => s.loginWithPassword);
  const register = useAuth((s) => s.registerWithPassword);
  const afterAuth = useAfterAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateCredentials(email, password);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(email, password, displayName);
      else await login(email, password);
      afterAuth();
    } catch (e) {
      const err = e as ApiClientError;
      setError(err.code === "invalid_credentials" ? "Invalid email or password." : err.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="authcenter">
      <form className="authcenter__col authform" onSubmit={submit} noValidate>
        <h1 className="t-headline-sm" style={{ margin: 0 }}>{isRegister ? "Create Your Account" : "Log In"}</h1>
        <label className="sr-only" htmlFor="email">Email</label>
        <input id="email" className="mfield" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus="true" autoCapitalize="none" spellCheck={false} />
        {isRegister ? (
          <>
            <label className="sr-only" htmlFor="name">Display name (optional)</label>
            <input id="name" className="mfield" type="text" autoComplete="nickname" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </>
        ) : null}
        <label className="sr-only" htmlFor="password">Password</label>
        <input id="password" className="mfield" type={visible ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div>
          <MangoButton text={visible ? "Hide Password" : "Show Password"} icon={visible ? <MdVisibilityOff /> : <MdVisibility />} compact onClick={() => setVisible((v) => !v)} />
        </div>
        {error ? <p className="c-coral t-body-md" role="alert" style={{ margin: 0, textAlign: "center" }}>{error}</p> : null}
        <MangoButton text={isRegister ? "Create Account" : "Log In"} icon={isRegister ? <MdAdd /> : <MdPerson />} variant="filled" fullWidth type="submit" disabled={busy} />
        {busy ? <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}><Spinner small /><span className="c-text-2 t-body-md">{isRegister ? "Creating account…" : "Signing in…"}</span></div> : null}
        <MangoButton text={isRegister ? "Already have an account? Log in" : "New here? Create an account"} icon={<MdChevronRight />} compact onClick={() => { setMode(isRegister ? "login" : "register"); setError(null); }} />
      </form>
    </div>
  );
}

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_FAILURES = 4;

/**
 * QrSignInScreen.kt — this browser shows a QR code; the person scans it with their phone, which opens MangoTV's own
 * activation page to sign in or create the account. The browser polls every 2.5 s and is signed in the moment the phone
 * finishes. An expired code is silently replaced.
 */
export function QrSignInScreen() {
  const { intent: raw } = useParams();
  const intent = intentOf(raw);
  const completeQr = useAuth((s) => s.completeQr);
  const afterAuth = useAfterAuth();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ready"; activationUrl: string; qr: string } | { kind: "error"; message: string }>({ kind: "loading" });
  const [degraded, setDegraded] = useState(false);
  const generation = useRef(0);

  const start = useCallback(async () => {
    const gen = ++generation.current;
    setState({ kind: "loading" });
    setDegraded(false);
    let session: { token: string; activationUrl: string; expiresAt: string };
    try {
      session = await api("/auth/qr/create", { method: "POST", body: {}, authFlow: true });
      const qr = await QRCode.toDataURL(session.activationUrl, { margin: 1, width: 560, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "M" });
      if (gen !== generation.current) return;
      setState({ kind: "ready", activationUrl: session.activationUrl, qr });
    } catch (e) {
      if (gen === generation.current) setState({ kind: "error", message: (e as Error).message || "Couldn't reach the server." });
      return;
    }
    const expires = Date.parse(session.expiresAt);
    let failures = 0;
    while (gen === generation.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (gen !== generation.current) return;
      if (Date.now() >= expires) return void start();
      try {
        const result = await api<{ status: string; user?: SessionUser }>(`/auth/qr/status?token=${encodeURIComponent(session.token)}`, { authFlow: true });
        failures = 0;
        setDegraded(false);
        if (result.status === "completed" && result.user) {
          completeQr(result.user);
          afterAuth();
          return;
        }
        if (result.status === "expired" || result.status === "not_found" || result.status === "consumed") return void start();
      } catch (e) {
        if (e instanceof ApiClientError && e.status === 429) continue;
        if (++failures >= MAX_CONSECUTIVE_FAILURES) setDegraded(true);
      }
    }
  }, [completeQr, afterAuth]);

  useEffect(() => {
    const token = generation;
    void start();
    return () => {
      token.current++;
    };
  }, [start]);

  return (
    <div className="authcenter">
      {state.kind === "loading" ? <Spinner /> : null}
      {state.kind === "error" ? <FullScreenError message={state.message} onRetry={() => void start()} /> : null}
      {state.kind === "ready" ? (
        <div className="authcenter__col" style={{ alignItems: "center", textAlign: "center" }}>
          <h1 className="t-headline-sm" style={{ margin: 0 }}>{intent === "register" ? "Scan to create your account" : "Scan to sign in"}</h1>
          <img className="qr" src={state.qr} alt={`QR code that opens ${state.activationUrl}`} width={280} height={280} />
          <a className="t-body-md c-text-2" href={state.activationUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{state.activationUrl}</a>
          <p className="t-label-sm c-text-3" style={{ margin: 0, maxWidth: 420 }}>Scan with your phone, or open this link. This code refreshes automatically if it expires.</p>
          {degraded ? <p className="t-label-sm c-text-3" style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }} role="status"><MdWifiOff aria-hidden="true" /> Can't reach the server right now — still trying…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Guards the signed-in app: signed-out visitors are sent to the welcome screen and returned to where they were heading. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  const location = useLocation();
  if (status === "signedOut") return <Navigate to={routes.auth} replace state={{ from: location.pathname + location.search }} />;
  if (status === "offline") return <FullScreenError title="You're offline" message="MangoTV can't reach its servers and there's no saved session on this browser yet. Check your connection and try again." onRetry={() => void init()} />;
  if (status === "unknown") return <div className="gate" aria-busy="true"><MangoLogo size={32} /></div>;
  return <>{children}</>;
}

/** Signed-in people never see the auth screens. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === "signedIn") return <Navigate to="/" replace />;
  if (status === "unknown") return <div className="gate" aria-busy="true"><MangoLogo size={32} /></div>;
  return <>{children}</>;
}
