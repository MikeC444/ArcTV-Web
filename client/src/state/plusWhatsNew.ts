import { create } from "zustand";
import { readJson, userKey, writeJson } from "./persist";

/** Which "What's new in Plus" announcement this is. A new announcement later gets a new id and so shows once more. */
export const WHATS_NEW_ID = "2026-10-recommendations";

interface WhatsNewState {
  userId: string | null;
  /** The last announcement this account has seen (closed, or followed). */
  seen: string | null;
  /** True once it has been on screen in this tab, so it is never shown twice in one visit. */
  shownThisSession: boolean;
  hydrate(userId: string): void;
  reset(): void;
  markShown(): void;
  /** Close or "See what's new": it will not come back. */
  markSeen(): void;
}

/** Whether the announcement may appear now. Pure, so the rule is testable. */
export const whatsNewDue = (s: Pick<WhatsNewState, "seen" | "shownThisSession">): boolean => s.seen !== WHATS_NEW_ID && !s.shownThisSession;

const keyFor = (userId: string) => userKey(userId, "plus-whatsnew");

/**
 * Remembers, per account in this browser, whether the "What's new in ArcTV Plus" popup has been seen. It shows once. Whether it is
 * *eligible* (signed in, has Plus, adult profile, on Home) is decided by the caller.
 */
export const usePlusWhatsNew = create<WhatsNewState>((set, get) => ({
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
    set({ seen: WHATS_NEW_ID });
    if (userId) writeJson(keyFor(userId), { seen: WHATS_NEW_ID });
  },
}));
