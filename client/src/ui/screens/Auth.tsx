import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MdAdd, MdArrowBack, MdChevronRight, MdEdit, MdLock, MdMail, MdPerson, MdQrCode2, MdVisibility, MdVisibilityOff, MdWifiOff } from "react-icons/md";
import QRCode from "qrcode";
import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import heroImage from "../../assets/img/auth_hero_living_room.webp";
import { api, ApiClientError } from "../../lib/api";
import { routes } from "../../lib/routes";
import { DISPLAY_NAME_MAX, useAuth, validateCredentials, validateDisplayName, validateEmail, validateNewPassword, type SessionUser } from "../../state/auth";
import { ArcButton } from "../components/Buttons";
import { ArcLogo } from "../components/Logo";
import { FullScreenError, Spinner } from "../components/States";
import { PRIVACY_URL } from "../../domain/links";

/** Where to go once signed in: the deep link the person was heading to, else Home. */
function useAfterAuth(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return useCallback(() => navigate(from && from !== routes.auth ? from : "/", { replace: true }), [navigate, from]);
}

const intentOf = (value: string | undefined): "login" | "register" => (value === "register" ? "register" : "login");

/**
 * The page every sign-in step shares: the hero photo, the scrim and the logo stay put while the left column swaps between
 * Log In / Sign Up, the method choice, the password form and the QR code — so choosing "Log In" never leaves the page.
 */
export function AuthLayout() {
  return (
    <RedirectIfAuthed>
      <AuthFrame />
    </RedirectIfAuthed>
  );
}

/** The same page without sending a signed-in visitor away: the password-reset pages work whether or not this browser is signed in. */
export function AuthFrame() {
  return (
    <main className="authstart" id="main">
      <img className="authstart__hero" src={heroImage} alt="" />
      <div className="authstart__scrim" />
      <div className="authstart__col">
        <ArcLogo size={32} />
        <Outlet />
      </div>
    </main>
  );
}

/** A "Back" button for the steps after Log In / Sign Up; returns to the first step on the same page. */
function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  return <ArcButton text="Back" icon={<MdArrowBack />} compact onClick={() => navigate(routes.auth, { state: location.state })} />;
}

/** AuthStartScreen.kt — "Your Entertainment, Your Way", Log In / Sign Up (the hero photo is drawn by AuthLayout). */
export function AuthStartScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const notice = useAuth((s) => s.notice);
  const clearNotice = useAuth((s) => s.clearNotice);
  useEffect(() => {
    document.title = "Welcome · Arc TV";
  }, []);
  return (
    <>
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
        <ArcButton text="Log In" icon={<MdPerson />} trailingChevron variant="filled" fullWidth dataAttrs={{ autofocus: true }} onClick={() => { clearNotice(); navigate(routes.authMethod("login"), { state: location.state }); }} />
        <ArcButton text="Sign Up" icon={<MdAdd />} trailingChevron fullWidth onClick={() => { clearNotice(); navigate(routes.authMethod("register"), { state: location.state }); }} />
      </div>
      <p className="authstart__qr t-label-md c-text-3">
        <MdQrCode2 aria-hidden="true" /> Scan a QR code to create an account from your phone
      </p>
    </>
  );
}

/** AuthMethodScreen.kt — "Scan a QR Code" or type credentials (on the TV: "Type on My Remote"). */
export function AuthMethodScreen() {
  const { intent: raw } = useParams();
  const intent = intentOf(raw);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="authpane">
      <div className="authcenter__col">
        <h1 className="t-headline-sm" style={{ margin: 0 }}>{intent === "register" ? "How would you like to create your account?" : "How would you like to sign in?"}</h1>
        <div className="authcenter__buttons">
          <ArcButton text="Use Email & Password" icon={<MdEdit />} variant="filled" fullWidth dataAttrs={{ autofocus: true }} onClick={() => navigate(routes.authPassword(intent), { state: location.state })} />
          <ArcButton text="Scan a QR Code" icon={<MdQrCode2 />} fullWidth onClick={() => navigate(routes.authQr(intent), { state: location.state })} />
        </div>
        <div><BackButton /></div>
      </div>
    </div>
  );
}

/** Whole seconds left until `until` (ms epoch), ticking once a second; 0 when there is nothing to wait for. */
function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** PasswordSignInScreen.kt — email + password (+ display name when creating). Same validation rules as the TV. */
export function PasswordSignInScreen() {
  const { intent: raw } = useParams();
  const [mode, setMode] = useState<"login" | "register">(intentOf(raw));
  const login = useAuth((s) => s.loginWithPassword);
  const register = useAuth((s) => s.registerWithPassword);
  const afterAuth = useAfterAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the service says "too many attempts": the time (ms epoch) the button works again. */
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const waitLeft = useCountdown(waitUntil);
  const isRegister = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (waitLeft > 0) return;
    const problem = (isRegister ? validateDisplayName(displayName) : null) ?? validateCredentials(email, password);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      if (isRegister) await register(email, password, displayName);
      else await login(email, password);
      afterAuth();
    } catch (e) {
      const err = e as ApiClientError;
      if (err.status === 429) {
        // The service only accepts a few sign-ins a minute, and every visitor of this site counts toward the same allowance. Pressing the
        // button again only uses more of it, so say how long to wait and keep the button off until then.
        const seconds = Math.min(Math.max(err.retryAfterSeconds ?? 30, 5), 90);
        setWaitUntil(Date.now() + seconds * 1000);
        setError(null);
      } else {
        setError(err.code === "invalid_credentials" ? "Invalid email or password." : err.message || "Something went wrong. Please try again.");
      }
      setBusy(false);
    }
  };

  return (
    <div className="authpane">
      <form className="authcenter__col authform" onSubmit={submit} noValidate>
        <h1 className="t-headline-sm" style={{ margin: 0 }}>{isRegister ? "Create Your Account" : "Log In"}</h1>
        <label className="sr-only" htmlFor="email">Email</label>
        <input id="email" className="mfield" aria-invalid={error ? true : undefined} aria-describedby={error ? "auth-error" : undefined} type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus="true" autoCapitalize="none" spellCheck={false} />
        {isRegister ? (
          <>
            <label className="sr-only" htmlFor="name">Display name</label>
            <input id="name" className="mfield" type="text" autoComplete="nickname" required aria-required="true" maxLength={DISPLAY_NAME_MAX} aria-invalid={error ? true : undefined} aria-describedby="name-hint" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <p id="name-hint" className="t-label-sm c-text-3" style={{ margin: "-4px 0 0" }}>This is also the name of your first profile.</p>
          </>
        ) : null}
        <label className="sr-only" htmlFor="password">Password</label>
        <input id="password" className="mfield" aria-invalid={error ? true : undefined} aria-describedby={error ? "auth-error" : undefined} type={visible ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div>
          <ArcButton text={visible ? "Hide Password" : "Show Password"} icon={visible ? <MdVisibilityOff /> : <MdVisibility />} compact onClick={() => setVisible((v) => !v)} />
        </div>
        {error ? <p id="auth-error" className="c-coral t-body-md" role="alert" style={{ margin: 0, textAlign: "center" }}>{error}</p> : null}
        {waitLeft > 0 ? (
          <p className="c-coral t-body-md" role="alert" style={{ margin: 0, textAlign: "center" }}>
            Too many sign-in attempts right now — ArcTV only accepts a few a minute, shared by everyone using this site. You can try again in {waitLeft} s.
          </p>
        ) : null}
        <ArcButton text={waitLeft > 0 ? `Try again in ${waitLeft} s` : isRegister ? "Create Account" : "Log In"} icon={isRegister ? <MdAdd /> : <MdPerson />} variant="filled" fullWidth type="submit" disabled={busy || waitLeft > 0} />
        {busy ? <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}><Spinner small /><span className="c-text-2 t-body-md">{isRegister ? "Creating account…" : "Signing in…"}</span></div> : null}
        {isRegister ? (
          <p className="t-body-sm c-text-3" style={{ margin: 0, textAlign: "center" }}>
            How we handle your data: <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          </p>
        ) : null}
        {!isRegister ? <ArcButton text="Forgot your password?" icon={<MdLock />} compact onClick={() => navigate(routes.forgotPassword)} /> : null}
        <ArcButton text={isRegister ? "Already have an account? Log in" : "New here? Create an account"} icon={<MdChevronRight />} compact onClick={() => { setMode(isRegister ? "login" : "register"); setError(null); }} />
        <div><BackButton /></div>
      </form>
    </div>
  );
}

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_FAILURES = 4;

/**
 * QrSignInScreen.kt — this browser shows a QR code; the person scans it with their phone, which opens ArcTV's own
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
    <div className="authpane">
      {state.kind === "loading" ? <Spinner /> : null}
      {state.kind === "error" ? <FullScreenError message={state.message} onRetry={() => void start()} /> : null}
      {state.kind === "ready" ? (
        <div className="authcenter__col">
          <h1 className="t-headline-sm" style={{ margin: 0 }}>{intent === "register" ? "Scan to create your account" : "Scan to sign in"}</h1>
          <img className="qr" src={state.qr} alt={`QR code that opens ${state.activationUrl}`} width={280} height={280} />
          <a className="t-body-md c-text-2" href={state.activationUrl} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>{state.activationUrl}</a>
          <p className="t-label-sm c-text-3" style={{ margin: 0, maxWidth: 420 }}>Scan with your phone, or open this link. This code refreshes automatically if it expires.</p>
          {degraded ? <p className="t-label-sm c-text-3" style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }} role="status"><MdWifiOff aria-hidden="true" /> Can't reach the server right now — still trying…</p> : null}
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}><BackButton /></div>
    </div>
  );
}

/** Guards the signed-in app: signed-out visitors are sent to the welcome screen and returned to where they were heading. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  const location = useLocation();
  if (status === "signedOut") return <Navigate to={routes.auth} replace state={{ from: location.pathname + location.search }} />;
  if (status === "offline") return <FullScreenError title="You're offline" message="ArcTV can't reach its servers and there's no saved session on this browser yet. Check your connection and try again." onRetry={() => void init()} />;
  if (status === "unknown") return <div className="gate" aria-busy="true"><ArcLogo size={32} /></div>;
  return <>{children}</>;
}

/** Browsing is open to everyone: only the first paint waits (to learn whether a session exists). Play, My List and Settings use RequireAuth. */
export function AllowGuests({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === "unknown") return <div className="gate" aria-busy="true"><ArcLogo size={32} /></div>;
  return <>{children}</>;
}

/** Signed-in people never see the auth screens. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === "signedIn") return <Navigate to="/" replace />;
  if (status === "unknown") return <div className="gate" aria-busy="true"><ArcLogo size={32} /></div>;
  return <>{children}</>;
}

/** "Forgot your password?": asks the account to email a one-time link. Says the same whether or not the address has an account. */
export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateEmail(email);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password/forgot", { method: "POST", body: { email: email.trim() }, authFlow: true });
      setSent(true);
    } catch (e) {
      const err = e as ApiClientError;
      setError(err.status === 429 ? "Too many requests right now. Please wait a minute and try again." : err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toLogIn = <ArcButton text="Back to log in" icon={<MdArrowBack />} compact onClick={() => navigate(routes.authPassword("login"))} />;
  if (sent) {
    return (
      <div className="authpane">
        <div className="authcenter__col authform">
          <h1 className="t-headline-sm" style={{ margin: 0 }}>Check your email</h1>
          <p className="t-body-md c-text-2" role="status" style={{ margin: 0 }}>
            If {email.trim()} has an Arc TV account, we&rsquo;ve sent it a link to choose a new password. The link works once, for 1 hour. If you don&rsquo;t see it, check your spam folder.
          </p>
          <div>{toLogIn}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="authpane">
      <form className="authcenter__col authform" onSubmit={submit} noValidate>
        <h1 className="t-headline-sm" style={{ margin: 0 }}>Reset your password</h1>
        <p className="t-body-md c-text-2" style={{ margin: 0 }}>Enter your account&rsquo;s email and we&rsquo;ll send you a link to choose a new password.</p>
        <label className="sr-only" htmlFor="forgot-email">Email</label>
        <input id="forgot-email" className="mfield" type="email" inputMode="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "forgot-error" : undefined} data-autofocus="true" autoCapitalize="none" spellCheck={false} />
        {error ? <p id="forgot-error" className="c-coral t-body-md" role="alert" style={{ margin: 0, textAlign: "center" }}>{error}</p> : null}
        <ArcButton text={busy ? "Sending…" : "Send reset link"} icon={<MdMail />} variant="filled" fullWidth type="submit" disabled={busy} />
        <div>{toLogIn}</div>
      </form>
    </div>
  );
}

/** The page the emailed link opens: choose a new password. The token comes from the address's #fragment and is taken out of it at once. */
export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useAuth((s) => s.status === "signedIn");
  const markSignedOut = useAuth((s) => s.markSignedOut);
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // keep the one-time token out of the browser's history
  useEffect(() => {
    if (location.hash) navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateNewPassword(password, again);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/password/reset", { method: "POST", body: { token, newPassword: password }, authFlow: true });
      setDone(true);
      if (signedIn) markSignedOut(); // every session was signed out, this browser's too
    } catch (e) {
      const err = e as ApiClientError;
      setError(err.status === 429 ? "Too many requests right now. Please wait a minute and try again." : err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toLogIn = <ArcButton text="Log in" icon={<MdPerson />} variant="filled" fullWidth onClick={() => navigate(routes.authPassword("login"))} />;
  if (done) {
    return (
      <div className="authpane">
        <div className="authcenter__col authform">
          <h1 className="t-headline-sm" style={{ margin: 0 }}>Password changed</h1>
          <p className="t-body-md c-text-2" role="status" style={{ margin: 0 }}>For your security, every device has been signed out. Log in with your new password.</p>
          {toLogIn}
        </div>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="authpane">
        <div className="authcenter__col authform">
          <h1 className="t-headline-sm" style={{ margin: 0 }}>This link isn&rsquo;t complete</h1>
          <p className="t-body-md c-text-2" style={{ margin: 0 }}>Open the link from the email again, or ask for a new one.</p>
          <ArcButton text="Ask for a new link" icon={<MdMail />} variant="filled" fullWidth onClick={() => navigate(routes.forgotPassword)} />
        </div>
      </div>
    );
  }
  return (
    <div className="authpane">
      <form className="authcenter__col authform" onSubmit={submit} noValidate>
        <h1 className="t-headline-sm" style={{ margin: 0 }}>Choose a new password</h1>
        <label className="sr-only" htmlFor="reset-password">New password</label>
        <input id="reset-password" className="mfield" type={visible ? "text" : "password"} autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "reset-error" : undefined} data-autofocus="true" />
        <label className="sr-only" htmlFor="reset-again">New password again</label>
        <input id="reset-again" className="mfield" type={visible ? "text" : "password"} autoComplete="new-password" placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "reset-error" : undefined} />
        <div>
          <ArcButton text={visible ? "Hide Password" : "Show Password"} icon={visible ? <MdVisibilityOff /> : <MdVisibility />} compact onClick={() => setVisible((v) => !v)} />
        </div>
        {error ? <p id="reset-error" className="c-coral t-body-md" role="alert" style={{ margin: 0, textAlign: "center" }}>{error}</p> : null}
        {error && /expired|invalid/i.test(error) ? <ArcButton text="Ask for a new link" icon={<MdMail />} compact onClick={() => navigate(routes.forgotPassword)} /> : null}
        <ArcButton text={busy ? "Saving…" : "Save new password"} icon={<MdLock />} variant="filled" fullWidth type="submit" disabled={busy} />
      </form>
    </div>
  );
}
