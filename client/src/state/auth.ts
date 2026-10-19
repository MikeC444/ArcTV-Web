import { create } from "zustand";
import { api, ApiClientError, onSessionExpired } from "../lib/api";
import { globalKey, readJson, removeKey, writeJson } from "./persist";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  /** The developer panel is for flagged accounts only (the backend decides; this only shows or hides the link). */
  isAdmin?: boolean;
}

/**
 * "unknown"  — first paint, asking the server whether the cookie is still a live session
 * "offline"  — server unreachable and there's no remembered user → we can't tell yet
 */
export type AuthStatus = "unknown" | "signedOut" | "signedIn" | "offline";

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** Shown once on the sign-in screen after an involuntary sign-out. */
  notice: string | null;
  init(): Promise<void>;
  loginWithPassword(email: string, password: string): Promise<SessionUser>;
  registerWithPassword(email: string, password: string, displayName?: string): Promise<SessionUser>;
  completeQr(user: SessionUser): void;
  clearNotice(): void;
  /** Explicit sign-out (Settings → Account). Data flushing/wiping is orchestrated by the sync manager. */
  signOutRemote(): Promise<void>;
  markSignedOut(notice?: string | null): void;
}

const LAST_USER_KEY = globalKey("lastUser");

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Loose client-side check (validateCredentials in PasswordSignInViewModel) — the server stays the authority. */
/** The longest display name an account can be created with: it is also the account's first profile, whose name has the same limit. */
export const DISPLAY_NAME_MAX = 24;

/** Creating an account needs a display name; null when this one is fine. */
export function validateDisplayName(displayName: string): string | null {
  if (displayName.trim() === "") return "Enter a display name.";
  if (displayName.trim().length > DISPLAY_NAME_MAX) return `Display name can be at most ${DISPLAY_NAME_MAX} characters.`;
  return null;
}

export function validateEmail(email: string): string | null {
  if (email.trim() === "") return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
  return null;
}

/** A new password (changing it, or from a reset link): long enough, and typed the same twice. */
export function validateNewPassword(password: string, again: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== again) return "The two passwords don't match.";
  return null;
}

export function validateCredentials(email: string, password: string): string | null {
  const emailProblem = validateEmail(email);
  if (emailProblem) return emailProblem;
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export const useAuth = create<AuthState>((set) => ({
  status: "unknown",
  user: null,
  notice: null,

  async init() {
    try {
      const { user } = await api<{ user: SessionUser }>("/auth/session", { authFlow: true });
      writeJson(LAST_USER_KEY, user);
      set({ status: "signedIn", user });
    } catch (error) {
      if (error instanceof ApiClientError && error.isNetwork) {
        // Offline (or the server is restarting). A remembered user lets the cached library keep working; the next
        // successful request re-validates the session. A confirmed 401 — never a network error — is what signs people out.
        const remembered = readJson<SessionUser | null>(LAST_USER_KEY, null);
        set(remembered ? { status: "signedIn", user: remembered } : { status: "offline", user: null });
        return;
      }
      set({ status: "signedOut", user: null });
    }
  },

  async loginWithPassword(email, password) {
    const { user } = await api<{ user: SessionUser }>("/auth/login", { method: "POST", body: { email: email.trim(), password }, authFlow: true });
    writeJson(LAST_USER_KEY, user);
    set({ status: "signedIn", user, notice: null });
    return user;
  },

  async registerWithPassword(email, password, displayName) {
    const body: Record<string, string> = { email: email.trim(), password };
    if (displayName && displayName.trim() !== "") body.displayName = displayName.trim();
    const { user } = await api<{ user: SessionUser }>("/auth/register", { method: "POST", body, authFlow: true });
    writeJson(LAST_USER_KEY, user);
    set({ status: "signedIn", user, notice: null });
    return user;
  },

  completeQr(user) {
    writeJson(LAST_USER_KEY, user);
    set({ status: "signedIn", user, notice: null });
  },

  clearNotice() {
    set({ notice: null });
  },

  async signOutRemote() {
    try {
      await api("/auth/logout", { method: "POST", authFlow: true });
    } catch {
      /* the server clears its cookie even when the backend is down; local state is wiped regardless */
    }
  },

  markSignedOut(notice = null) {
    removeKey(LAST_USER_KEY);
    set({ status: "signedOut", user: null, notice });
  },
}));

// Any API call that proves the session is over ends it, with an explanation on the sign-in screen.
onSessionExpired(() => {
  if (useAuth.getState().status === "signedIn") {
    useAuth.getState().markSignedOut("Your session has expired. Please sign in again.");
  }
});
