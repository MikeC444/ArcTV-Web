/**
 * ArcTV Plus — the optional paid tier. The whole app stays free; Plus adds extras.
 * What the Settings → ArcTV Plus tab shows comes from here. The real prices live in Stripe and are shown on its checkout page;
 * `price` is only a label for the plan card (e.g. "$3.99"; null = "Price at checkout").
 */
export interface PlusPlan {
  id: "monthly" | "yearly" | "lifetime";
  label: string;
  price: string | null;
  per: string;
  /** What the person is buying, shown under the price. */
  blurb: string;
  note?: string;
}

export const PLUS_PLANS: PlusPlan[] = [
  { id: "monthly", label: "Monthly", price: null, per: "per month", blurb: "Cancel any time." },
  { id: "yearly", label: "Yearly", price: null, per: "per year", blurb: "Cancel any time.", note: "Best value" },
  { id: "lifetime", label: "Lifetime", price: null, per: "one-time payment", blurb: "Pay once, keep Plus forever. No renewals.", note: "Pay once" },
];

export interface PlusPerk {
  title: string;
  detail: string;
  /** "soon" perks are announced but not switched on yet; "included" ones are on for everyone while Plus is in early access. */
  status: "soon" | "included";
  /** Shown as "Coming soon" until the backend has it (the answer of GET /profiles says whether it does). */
  needs?: "profiles";
  /** Only the website, the Mac app and the Windows app have it for now (the Fire TV and phone apps do not), shown as a "Web, Mac and Windows only" tag. */
  webOnly?: boolean;
}

export const PLUS_PERKS: PlusPerk[] = [
  { title: "Picked for you", detail: "A Home row chosen from the movies and shows you like, finish and save, with the reason under each poster, plus Like and Not for me on movies and shows.", status: "included" },
  { title: "Profiles", detail: "Up to 5 profiles on one account, each with its own My List, Continue Watching, settings and recommendations. Add kids profiles, and lock any profile with a PIN.", status: "included", needs: "profiles" },
  { title: "Parental controls", detail: "Locks on individual genres and titles, built on kids profiles and Blocked Genres.", status: "soon" },
  { title: "Smart source picking", detail: "Skips Select a Source and starts the best source your device can play, once every addon has answered. Turn it on below.", status: "included" },
  { title: "Your stats", detail: "How much you watch, how this week compares, your streak, a map of your last 13 weeks and your busiest day, under Settings → Your stats.", status: "included" },
  { title: "Download", detail: "A Download button on a movie or episode lists the files from your debrid service, best quality at the smallest size first, to save to your device.", status: "included", webOnly: true },
];

export const PLUS_FREE_NOTE = "Everything you use today stays free: browsing, playing, My List, Continue Watching, addons and Blocked Genres.";

export const PLUS_PROCEEDS_NOTE = "Every subscription goes straight back into building and running ArcTV: new features, faster servers and keeping the free app free.";

/** A plan's list price from the backend: the amount in the currency's smallest unit (pence, cents) and its lower-case ISO code. */
export interface PlanPrice {
  amount: number;
  currency: string;
}
export type PlanPrices = Record<PlusPlan["id"], PlanPrice>;

/** Digits after the decimal point in this currency (2 for pounds and dollars, 0 for yen); 2 when the code isn't one the browser knows. */
function fractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "£39.99" from 3999 and "gbp". Null when the code isn't a currency the browser can format. */
export function formatMoney(minor: number, currency: string, locale?: string): string | null {
  try {
    const digits = fractionDigits(currency);
    const major = minor / 10 ** digits;
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: Number.isInteger(major) ? 0 : digits, maximumFractionDigits: digits }).format(major);
  } catch {
    return null;
  }
}

/** What the yearly plan comes to per month, in the smallest unit. */
export const yearlyPerMonth = (yearly: PlanPrice): number => Math.round(yearly.amount / 12);

/** How much cheaper per month the yearly plan is than paying monthly, as a whole percent. Null unless it really is cheaper (same currency, at least 1%). */
export function savingPercent(prices: PlanPrices): number | null {
  if (prices.monthly.currency !== prices.yearly.currency || prices.monthly.amount <= 0) return null;
  const percent = Math.round((1 - prices.yearly.amount / 12 / prices.monthly.amount) * 100);
  return percent >= 1 ? percent : null;
}

/** What the yearly plan costs per day, in the smallest unit. */
export const yearlyPerDay = (yearly: PlanPrice): number => Math.round(yearly.amount / 365);

/** Reads the backend's `prices` field defensively: all three plans with a positive whole amount and a currency, else null. */
export function parsePrices(raw: unknown): PlanPrices | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Partial<PlanPrices> = {};
  for (const id of ["monthly", "yearly", "lifetime"] as const) {
    const entry = (raw as Record<string, unknown>)[id] as { amount?: unknown; currency?: unknown } | undefined;
    if (!entry || typeof entry.amount !== "number" || !Number.isFinite(entry.amount) || entry.amount <= 0 || typeof entry.currency !== "string" || entry.currency.length !== 3) return null;
    out[id] = { amount: Math.round(entry.amount), currency: entry.currency.toLowerCase() };
  }
  return out as PlanPrices;
}

/** Where the supporters board is (the landing page's own page for it). */
export const SUPPORTERS_URL = "https://arctv.org/supporters/";

/** The short line on the Lifetime plan card. */
export const LIFETIME_BOARD_TAG = "Join the supporters board";

/** Said under the plan cards: the supporters board is a choice, asked at checkout and changeable in Settings. */
export const LIFETIME_BOARD_NOTE = "Go Lifetime and you'll be asked at checkout whether you want your display name and profile picture on the supporters board on arctv.org, as a thank you. You can change your mind any time in Settings.";
