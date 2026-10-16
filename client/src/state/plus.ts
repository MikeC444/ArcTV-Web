import { create } from "zustand";
import { parsePrices, type PlanPrices } from "../domain/plus";
import { api } from "../lib/api";
import { readJson, userKey, writeJson } from "./persist";

export type PlusPlanId = "monthly" | "yearly" | "lifetime";

/** What GET /user/plus answers (the backend decides; this app never works out who has Plus itself). */
export interface PlusStatus {
  active: boolean;
  /** "early_access" while the paywall is off and everyone has Plus; null when there is no Plus. */
  plan: PlusPlanId | "early_access" | null;
  validUntil: string | null;
  /** A monthly or yearly subscription that has been cancelled: Plus runs to validUntil and then ends. */
  cancelAtPeriodEnd: boolean;
  /** True once Plus is paid; false while it is free for everyone (early access). */
  paywall: boolean;
  /** Free days a first monthly or yearly subscription starts with, when this account is offered them; 0 otherwise. */
  trialDays: number;
  /** The list price of each plan, for the plan cards; null when the backend didn't send them. Promo codes can lower what checkout charges. */
  prices: PlanPrices | null;
  /** For a Lifetime member: whether they have chosen to have their display name on the supporters board (off until they say so). null for everyone else. */
  supporterBoard: boolean | null;
  /** With the board on: listed as "Anonymous" (no name, no picture) instead. null when not on the board. */
  supporterAnonymous: boolean | null;
}

const NONE: PlusStatus = { active: false, plan: null, validUntil: null, cancelAtPeriodEnd: false, paywall: false, trialDays: 0, prices: null, supporterBoard: null, supporterAnonymous: null };

/** The backend's answer as a PlusStatus, with anything missing or malformed read as "none". */
function parseStatus(status: Partial<Record<keyof PlusStatus, unknown>>): PlusStatus {
  return {
    active: status.active === true,
    plan: (status.plan as PlusStatus["plan"]) ?? null,
    validUntil: (status.validUntil as string | null) ?? null,
    cancelAtPeriodEnd: status.cancelAtPeriodEnd === true,
    paywall: status.paywall === true,
    trialDays: typeof status.trialDays === "number" && status.trialDays > 0 ? Math.floor(status.trialDays) : 0,
    prices: parsePrices(status.prices),
    supporterBoard: typeof status.supporterBoard === "boolean" ? status.supporterBoard : null,
    supporterAnonymous: typeof status.supporterAnonymous === "boolean" ? status.supporterAnonymous : null,
  };
}

interface PlusState extends PlusStatus {
  userId: string | null;
  hydrate(userId: string): void;
  reset(): void;
  /** Reads this account's Plus status. Returns false when it could not be read (the last known status is kept). */
  pull(): Promise<boolean>;
  /** Starts a checkout for one plan and returns the hosted payment page's URL. */
  checkout(plan: PlusPlanId): Promise<string>;
  /** Cancels a monthly or yearly subscription at the end of the period already paid for; Plus stays on until then. */
  cancelSubscription(): Promise<void>;
  /** A Lifetime member chooses to be on the supporters board (by display name, or as Anonymous), or takes it off. */
  setSupporterBoard(show: boolean, anonymous?: boolean): Promise<void>;
}

/**
 * ArcTV Plus status for the signed-in account. The last answer is kept per user, so a launch shows what the person had
 * straight away and the fresh answer replaces it a moment later; features that need Plus read `active`.
 */
export const usePlus = create<PlusState>((set, get) => ({
  ...NONE,
  userId: null,

  hydrate(userId) {
    set({ userId, ...NONE, ...readJson<Partial<PlusStatus>>(userKey(userId, "plus"), {}) });
  },
  reset() {
    set({ userId: null, ...NONE });
  },

  async pull() {
    const { userId } = get();
    if (!userId) return false;
    try {
      const status = await api<Partial<Record<keyof PlusStatus, unknown>>>("/user/plus");
      if (get().userId !== userId) return false; // signed out or switched account while waiting
      const next = parseStatus(status);
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

  async setSupporterBoard(show, anonymous = false) {
    const { userId } = get();
    const status = await api<Partial<Record<keyof PlusStatus, unknown>>>("/user/plus/supporter", { method: "PUT", body: { show, anonymous } });
    if (!userId || get().userId !== userId) return;
    set({
      supporterBoard: typeof status.supporterBoard === "boolean" ? status.supporterBoard : show,
      supporterAnonymous: typeof status.supporterAnonymous === "boolean" ? status.supporterAnonymous : show ? anonymous : null,
    });
    const { active, plan, validUntil, cancelAtPeriodEnd, paywall, trialDays, prices, supporterBoard, supporterAnonymous } = get();
    writeJson(userKey(userId, "plus"), { active, plan, validUntil, cancelAtPeriodEnd, paywall, trialDays, prices, supporterBoard, supporterAnonymous } satisfies PlusStatus);
  },

  async cancelSubscription() {
    const { userId } = get();
    const status = await api<Partial<Record<keyof PlusStatus, unknown>>>("/user/plus/cancel", { method: "POST", body: {} });
    if (!userId || get().userId !== userId) return;
    const next = parseStatus(status);
    set(next);
    writeJson(userKey(userId, "plus"), next);
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
