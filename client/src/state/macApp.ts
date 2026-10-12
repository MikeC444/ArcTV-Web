import { create } from "zustand";
import { readJson, userKey, writeJson } from "./persist";

/** Which announcement this is. A revised one later gets a new id and so shows once more. */
export const MAC_APP_ID = "2026-10-mac-app-2";

interface MacAppState {
  userId: string | null;
  /** The last announcement this account has seen (closed, or followed). */
  seen: string | null;
  /** True once it has been on screen in this tab, so it is never shown twice in one visit. */
  shownThisSession: boolean;
  hydrate(userId: string): void;
  reset(): void;
  markShown(): void;
  /** Close or "Get the Mac app": it will not come back. */
  markSeen(): void;
}

/** Whether the announcement may appear now. Pure, so the rule is testable. */
export const macAppDue = (s: Pick<MacAppState, "seen" | "shownThisSession">): boolean => s.seen !== MAC_APP_ID && !s.shownThisSession;

const keyFor = (userId: string) => userKey(userId, "mac-app-popup");

/**
 * Remembers, per account in this browser, whether the "Arc TV is on your Mac" popup has been seen. It shows once. Whether it is
 * *eligible* (signed in, on a Mac, on Home) is decided by the caller.
 */
export const useMacApp = create<MacAppState>((set, get) => ({
  userId: null,
  seen: null,
  shownThisSession: false,
  hydrate(userId) {
    set({ userId, seen: readJson<{ seen?: string | null }>(keyFor(userId), {}).seen ?? null });
  },
  reset() {
    set({ userId: null, seen: null });
  },
  markShown() {
    set({ shownThisSession: true });
  },
  markSeen() {
    const { userId } = get();
    set({ seen: MAC_APP_ID });
    if (userId) writeJson(keyFor(userId), { seen: MAC_APP_ID });
  },
}));
