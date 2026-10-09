import { create } from "zustand";
import { readJson, userKey, writeJson } from "./persist";

/** Which version of the Plus welcome tour this is. A revised tour later gets a new id and so shows once more. */
export const WELCOME_ID = "2026-10-features";

interface WelcomeState {
  userId: string | null;
  /** The last announcement this account has seen (closed, or followed). */
  seen: string | null;
  /** True once it has been on screen in this tab, so it is never shown twice in one visit. */
  shownThisSession: boolean;
  hydrate(userId: string): void;
  reset(): void;
  markShown(): void;
  /** Close or "See my Plus settings": it will not come back. */
  markSeen(): void;
}

/** Whether the announcement may appear now. Pure, so the rule is testable. */
export const welcomeDue = (s: Pick<WelcomeState, "seen" | "shownThisSession">): boolean => s.seen !== WELCOME_ID && !s.shownThisSession;

const keyFor = (userId: string) => userKey(userId, "plus-welcome");

/**
 * Remembers, per account in this browser, whether the "Everything in ArcTV Plus" welcome popup has been seen. It shows once. Whether it is
 * *eligible* (signed in, has Plus, adult profile, on Home) is decided by the caller.
 */
export const usePlusWelcome = create<WelcomeState>((set, get) => ({
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
    set({ seen: WELCOME_ID });
    if (userId) writeJson(keyFor(userId), { seen: WELCOME_ID });
  },
}));
