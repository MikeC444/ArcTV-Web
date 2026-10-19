import type { ContentType } from "../domain/types";

/** The Fire TV app's navigation routes, for the browser. IDs are percent-encoded (Stremio ids can contain ":" or "/"). */
const enc = encodeURIComponent;

/** The addon the readable title addresses belong to (Stremio's Cinemeta), and the id shape they end with. */
export const CINEMETA_PROVIDER_ID = "com.linvo.cinemeta";
const IMDB_ID = /^tt\d+$/;

/** "Prison Break" → "prison-break-" (with the trailing dash, ready for the id). Only decoration: the id on the end is what finds the title. */
export function slugify(title: string | null | undefined): string {
  const words = (title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return words ? `${words}-` : "";
}

/** The id at the end of a readable title address ("prison-break-tt0455275" → "tt0455275"), or null. */
export const idFromSlug = (slug: string | undefined): string | null => /(?:^|-)(tt\d+)$/.exec(slug ?? "")?.[1] ?? null;

/** Is this path a title page (the long form or a readable one)? Title pages count as Home in the nav and sit over their picture. */
export const isDetailPath = (pathname: string): boolean => pathname.startsWith("/detail") || /^\/(?:movies|tv-shows)\/[^/]+$/.test(pathname);

export const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Movies", to: "/movies" },
  { label: "TV Shows", to: "/tv" },
  { label: "Search", to: "/search" },
  { label: "My List", to: "/my-list" },
  { label: "Settings", to: "/settings" },
] as const;

/** The Anime tab, which sits after TV Shows and only exists while an installed addon has anime catalogues. */
const ANIME_NAV_ITEM = { label: "Anime", to: "/anime" } as const;

/** The Live TV tab, after Anime (or TV Shows): it only exists while an installed addon has channel or event catalogues. */
const LIVE_NAV_ITEM = { label: "Live TV", to: "/live" } as const;

/** The nav bar's items: always the six above, with Anime and Live TV after TV Shows when an installed addon has those catalogues. */
export function navItems(hasAnime: boolean, hasLiveTv = false): ReadonlyArray<{ readonly label: string; readonly to: string }> {
  if (!hasAnime && !hasLiveTv) return NAV_ITEMS;
  return [...NAV_ITEMS.slice(0, 3), ...(hasAnime ? [ANIME_NAV_ITEM] : []), ...(hasLiveTv ? [LIVE_NAV_ITEM] : []), ...NAV_ITEMS.slice(3)];
}

export const routes = {
  home: "/",
  movies: "/movies",
  tv: "/tv",
  anime: "/anime",
  /** One streaming service's titles (Netflix, Disney+ ...), from an installed addon that has a catalogue for it. */
  streaming: (service: string) => `/streaming/${enc(service)}`,
  live: "/live",
  /** Watching one channel (or event). Full screen, like the player. The addon's own type ("tv" / "events") says what to ask it for. */
  liveChannel: (providerId: string, type: string, id: string) => `/live/watch/${enc(providerId)}/${enc(type)}/${enc(id)}`,
  search: "/search",
  admin: "/admin",
  myList: "/my-list",
  settings: (tab?: "account" | "addons" | "home-rows" | "blocked-genres" | "plus" | "plus-settings" | "recommendations" | "stats" | "sounds" | "subtitles" | "audio") => (tab ? `/settings/${tab}` : "/settings"),
  addAddon: "/settings/addons/add",
  /** Hidden guide: debrid service → Torrentio → Arc TV. Not linked from the app yet. */
  debridGuide: "/guides/debrid",
  /** A title page. Cinemeta titles get a readable address (/movies/inception-tt1375666, /tv-shows/prison-break-tt0455275); everything else keeps the long one. */
  detail: (providerId: string, type: ContentType, id: string, title?: string | null) =>
    providerId === CINEMETA_PROVIDER_ID && IMDB_ID.test(id)
      ? `/${type === "TV_SHOW" ? "tv-shows" : "movies"}/${slugify(title)}${id}`
      : `/detail/${enc(providerId)}/${type}/${enc(id)}`,
  sources: (providerId: string, type: ContentType, id: string, season?: number | null, episode?: number | null, skipAutoSelect = false) =>
    `/sources/${enc(providerId)}/${type}/${enc(id)}/${season ?? -1}/${episode ?? -1}${skipAutoSelect ? "?skip=1" : ""}`,
  player: (providerId: string, type: ContentType, id: string, season: number | null | undefined, episode: number | null | undefined, streamId: string) =>
    `/player/${enc(providerId)}/${type}/${enc(id)}/${season ?? -1}/${episode ?? -1}/${enc(streamId)}`,
  profiles: "/profiles",
  auth: "/auth",
  authMethod: (intent: "login" | "register") => `/auth/method/${intent}`,
  authPassword: (intent: "login" | "register") => `/auth/password/${intent}`,
  authQr: (intent: "login" | "register") => `/auth/qr/${intent}`,
  /** Change the signed-in account's password (Settings → Account opens it in a new tab). */
  changePassword: "/change-password",
  /** Ask for a password-reset email. */
  forgotPassword: "/forgot-password",
  /** Where the emailed link lands (the token is in the #fragment). */
  resetPassword: "/reset-password",
};

export const parseOptionalInt = (value: string | undefined): number | null => {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
