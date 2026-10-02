import { create } from "zustand";
import { api } from "../lib/api";
import { readJson, userKey, writeJson } from "./persist";

export type PlusPlanId = "monthly" | "yearly" | "lifetime";

/** What GET /user/plus answers (the backend decides; this app never works out who has Plus itself). */
export interface PlusStatus {
  active: boolean;
  /** "early_access" while the paywall is off and everyone has Plus; null when there is no Plus. */
  plan: PlusPlanId | "early_access" | null;
  validUntil: string | null;
  /** True once Plus is paid; false while it is free for everyone (early access). */
  paywall: boolean;
}

const NONE: PlusStatus = { active: false, plan: null, validUntil: null, paywall: false };

interface PlusState extends PlusStatus {
  userId: string | null;
  hydrate(userId: string): void;
  reset(): void;
  /** Reads this account's Plus status. Returns false when it could not be read (the last known status is kept). */
  pull(): Promise<boolean>;
  /** Starts a checkout for one plan and returns the hosted payment page's URL. */
  checkout(plan: PlusPlanId): Promise<string>;
}

/**
 * ArcTV Plus status for the signed-in account. The last answer is kept per user, so a launch shows what the person had
 * straight away and the fresh answer replaces it a moment later; features that need Plus read `active`.
 */
export const usePlus = create<PlusState>((set, get) => ({
  ...NONE,
  userId: null,

  hydrate(userId) {
    set({ userId, ...readJson<PlusStatus>(userKey(userId, "plus"), NONE) });
  },
  reset() {
    set({ userId: null, ...NONE });
  },

  async pull() {
    const { userId } = get();
    if (!userId) return false;
    try {
      const status = await api<PlusStatus>("/user/plus");
      if (get().userId !== userId) return false; // signed out or switched account while waiting
      const next: PlusStatus = { active: status.active === true, plan: status.plan ?? null, validUntil: status.validUntil ?? null, paywall: status.paywall === true };
      set(next);
      writeJson(userKey(userId, "plus"), next);
      return true;
    } catch {
      return false;
    }
  },

  async checkout(plan) {
    const { url } = await api<{ url: string }>("/user/plus/checkout", { method: "POST", body: { plan } });
    return url;
  },
}));

/**
 * After sending someone to pay, asks again every few seconds (and when they come back to this tab) until Plus is on, then stops.
 * Returns a function that stops it sooner.
 */
export function watchForPurchase(options: { everyMs?: number; forMs?: number } = {}): () => void {
  const { everyMs = 4000, forMs = 10 * 60_000 } = options;
  const until = Date.now() + forMs;
  let stopped = false;
  const check = async () => {
    if (stopped) return;
    await usePlus.getState().pull();
    if (usePlus.getState().active || Date.now() > until) stop();
  };
  const timer = setInterval(() => void check(), everyMs);
  const onFocus = () => void check();
  window.addEventListener("focus", onFocus);
  function stop() {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", onFocus);
  }
  return stop;
}
