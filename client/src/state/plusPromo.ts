import { create } from "zustand";
import { readJson, userKey, writeJson } from "./persist";

/** After "Close" the popup stays away this long before it may appear again. */
export const PROMO_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

interface PromoRecord {
  /** "Don't show me again": never again for this account. */
  never: boolean;
  /** Epoch ms before which the popup stays hidden (set by Close). */
  snoozedUntil: number;
}

const NONE: PromoRecord = { never: false, snoozedUntil: 0 };

interface PromoState extends PromoRecord {
  userId: string | null;
  /** True once the popup has been on screen in this tab, so it is never shown twice in one visit. */
  shownThisSession: boolean;
  hydrate(userId: string): void;
  reset(): void;
  markShown(): void;
  /** Close: hide now and come back after the snooze. */
  snooze(now?: number): void;
  /** Don't show me again. */
  dismissForever(): void;
}

/** Whether the popup may appear now. Pure, so the rules are testable. */
export function promoDue(s: Pick<PromoState, "never" | "snoozedUntil" | "shownThisSession">, now: number = Date.now()): boolean {
  return !s.never && !s.shownThisSession && now >= s.snoozedUntil;
}

/**
 * Remembers what the person told the ArcTV Plus popup, per account in this browser: Close snoozes it for a week,
 * "Don't show me again" switches it off for good. Whether it is *eligible* (signed in, no Plus, paywall on) is decided by the caller.
 */
export const usePlusPromo = create<PromoState>((set, get) => {
  const save = (next: PromoRecord) => {
    const { userId } = get();
    set(next);
    if (userId) writeJson(userKey(userId, "plus-promo"), next);
  };
  return {
    ...NONE,
    userId: null,
    shownThisSession: false,
    hydrate(userId) {
      set({ userId, ...NONE, ...readJson<Partial<PromoRecord>>(userKey(userId, "plus-promo"), {}) });
    },
    reset() {
      set({ userId: null, ...NONE });
    },
    markShown() {
      set({ shownThisSession: true });
    },
    snooze(now = Date.now()) {
      save({ never: get().never, snoozedUntil: now + PROMO_SNOOZE_MS });
    },
    dismissForever() {
      save({ never: true, snoozedUntil: get().snoozedUntil });
    },
  };
});
