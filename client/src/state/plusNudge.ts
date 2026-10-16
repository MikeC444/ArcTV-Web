import { create } from "zustand";
import { useAuth } from "./auth";
import { readJson, userKey, writeJson } from "./persist";
import { usePlus } from "./plus";
import { activeProfileOf, useProfiles } from "./profiles";

/** At most one unprompted Plus nudge in this long, whatever triggered it. */
export const NUDGE_GAP_MS = 3 * 24 * 60 * 60 * 1000;
/** Each kind of nudge is shown at most this many times to one account, then never again. */
export const NUDGE_MAX_PER_TRIGGER = 3;

export type NudgeTrigger = "watch-end";

interface NudgeRecord {
  /** Epoch ms of the last nudge of any kind (0: none yet). */
  lastShownAt: number;
  /** How many times each kind has been shown. */
  shown: Partial<Record<NudgeTrigger, number>>;
}

const NONE: NudgeRecord = { lastShownAt: 0, shown: {} };

interface NudgeState extends NudgeRecord {
  userId: string | null;
  hydrate(userId: string): void;
  reset(): void;
  /** Records that a nudge was just shown. */
  markShown(trigger: NudgeTrigger, now?: number): void;
}

/** Whether an unprompted nudge may be shown now. Pure, so the rules are testable. */
export function nudgeDue(s: Pick<NudgeRecord, "lastShownAt" | "shown">, trigger: NudgeTrigger, now: number = Date.now()): boolean {
  return now - s.lastShownAt >= NUDGE_GAP_MS && (s.shown[trigger] ?? 0) < NUDGE_MAX_PER_TRIGGER;
}

/**
 * What the person has been shown, per account in this browser, so Plus nudges stay rare: one every few days at most, a few of each kind,
 * ever. Nudges that answer a press on a locked feature (Download, Add profile, Like) are the person's own doing and are not counted here.
 */
export const usePlusNudge = create<NudgeState>((set, get) => ({
  ...NONE,
  userId: null,
  hydrate(userId) {
    set({ userId, ...NONE, ...readJson<Partial<NudgeRecord>>(userKey(userId, "plus-nudge"), {}) });
  },
  reset() {
    set({ userId: null, ...NONE });
  },
  markShown(trigger, now = Date.now()) {
    const { userId, shown } = get();
    const next: NudgeRecord = { lastShownAt: now, shown: { ...shown, [trigger]: (shown[trigger] ?? 0) + 1 } };
    set(next);
    if (userId) writeJson(userKey(userId, "plus-nudge"), next);
  },
}));

/**
 * Whether this person is someone Plus may be offered to at all: signed in, the paywall on (while Plus is free in early access everyone has
 * it), no Plus yet, and not on a kids profile. Used by every Plus ask.
 */
export function useCanOfferPlus(): boolean {
  const signedIn = useAuth((s) => s.status === "signedIn");
  const paywall = usePlus((s) => s.paywall);
  const hasPlus = usePlus((s) => s.active);
  const adult = useProfiles((s) => !(s.plus && activeProfileOf(s)?.kind === "kids"));
  return signedIn && paywall && !hasPlus && adult;
}
