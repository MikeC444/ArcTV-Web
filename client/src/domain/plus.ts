/**
 * ArcTV Plus — the optional paid tier. The whole app stays free; Plus adds extras.
 * Everything the Settings → ArcTV Plus tab shows comes from here, so launching is a matter of filling this in:
 *  - PLUS_CHECKOUT_URL: a hosted checkout page (for example a Stripe Payment Link). Empty = "coming soon".
 *  - price on each plan: shown as-is (e.g. "$3.99"); null = "Price announced soon".
 */
export const PLUS_CHECKOUT_URL = "";

export interface PlusPlan {
  id: "monthly" | "yearly";
  label: string;
  price: string | null;
  per: string;
  note?: string;
}

export const PLUS_PLANS: PlusPlan[] = [
  { id: "monthly", label: "Monthly", price: null, per: "per month" },
  { id: "yearly", label: "Yearly", price: null, per: "per year", note: "Best value" },
];

export interface PlusPerk {
  title: string;
  detail: string;
  /** "soon" perks are announced but not switched on yet. */
  status: "soon";
}

export const PLUS_PERKS: PlusPerk[] = [
  { title: "Profiles", detail: "Separate profiles on one account, each with its own My List, Continue Watching and blocked genres.", status: "soon" },
  { title: "Parental controls", detail: "A PIN, plus locks on genres and titles, built on Blocked Genres.", status: "soon" },
  { title: "Bigger stream relay allowance", detail: "More room for sources a browser can't play directly.", status: "soon" },
  { title: "Smart source picking", detail: "Automatically choose the best playable source for your device.", status: "soon" },
];

export const PLUS_FREE_NOTE = "Everything you use today stays free: browsing, playing, My List, Continue Watching, addons and Blocked Genres.";

export const PLUS_PROCEEDS_NOTE = "Every subscription goes straight back into building and running ArcTV: new features, faster servers and keeping the free app free.";
