/**
 * ArcTV Plus — the optional paid tier. The whole app stays free; Plus adds extras.
 * Everything the Settings → ArcTV Plus tab shows comes from here, so launching is a matter of filling this in, per plan:
 *  - checkoutUrl: a hosted checkout page (for example a Stripe Payment Link). Empty = "opens soon".
 *  - price: shown as-is (e.g. "$3.99"); null = "Price announced soon".
 */
export interface PlusPlan {
  id: "monthly" | "yearly" | "lifetime";
  label: string;
  price: string | null;
  per: string;
  /** What the person is buying, shown under the price. */
  blurb: string;
  note?: string;
  checkoutUrl: string;
}

export const PLUS_PLANS: PlusPlan[] = [
  { id: "monthly", label: "Monthly", price: null, per: "per month", blurb: "Cancel any time.", checkoutUrl: "" },
  { id: "yearly", label: "Yearly", price: null, per: "per year", blurb: "Cancel any time.", note: "Best value", checkoutUrl: "" },
  { id: "lifetime", label: "Lifetime", price: null, per: "one-time payment", blurb: "Pay once, keep Plus forever. No renewals.", note: "Pay once", checkoutUrl: "" },
];

export interface PlusPerk {
  title: string;
  detail: string;
  /** "soon" perks are announced but not switched on yet; "included" ones are on for everyone while Plus is in early access. */
  status: "soon" | "included";
}

export const PLUS_PERKS: PlusPerk[] = [
  { title: "Picked for you", detail: "A Home row chosen from the movies you like, finish and save, with the reason under each poster, plus Like and Not for me on movies.", status: "included" },
  { title: "Profiles", detail: "Separate profiles on one account, each with its own My List, Continue Watching and blocked genres.", status: "soon" },
  { title: "Parental controls", detail: "A PIN, plus locks on genres and titles, built on Blocked Genres.", status: "soon" },
  { title: "Bigger stream relay allowance", detail: "More room for sources a browser can't play directly.", status: "soon" },
  { title: "Smart source picking", detail: "Automatically choose the best playable source for your device.", status: "soon" },
];

export const PLUS_FREE_NOTE = "Everything you use today stays free: browsing, playing, My List, Continue Watching, addons and Blocked Genres.";

export const PLUS_PROCEEDS_NOTE = "Every subscription goes straight back into building and running ArcTV: new features, faster servers and keeping the free app free.";
