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
}

export const PLUS_PERKS: PlusPerk[] = [
  { title: "Picked for you", detail: "A Home row chosen from the movies and shows you like, finish and save, with the reason under each poster, plus Like and Not for me on movies and shows.", status: "included" },
  { title: "Profiles", detail: "Up to 5 profiles on one account, each with its own My List, Continue Watching, settings and recommendations. Add kids profiles, and lock any profile with a PIN.", status: "included", needs: "profiles" },
  { title: "Parental controls", detail: "Locks on individual genres and titles, built on kids profiles and Blocked Genres.", status: "soon" },
  { title: "Smart source picking", detail: "Skips Select a Source and starts the best source your device can play, once every addon has answered. Turn it on below.", status: "included" },
  { title: "Your stats", detail: "How much you watch, how this week compares, your streak, a map of your last 13 weeks and your busiest day, under Settings → Your stats.", status: "included" },
  { title: "Download (web only)", detail: "A Download button on the details page of a movie or episode on the web app lists the files from your debrid service, best quality at the smallest size first, to save to your device.", status: "included" },
];

export const PLUS_FREE_NOTE = "Everything you use today stays free: browsing, playing, My List, Continue Watching, addons and Blocked Genres.";

export const PLUS_PROCEEDS_NOTE = "Every subscription goes straight back into building and running ArcTV: new features, faster servers and keeping the free app free.";
