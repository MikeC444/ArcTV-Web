import type { ContentType } from "../domain/types";

/** navigation/MangoRoutes.kt for the browser. IDs are percent-encoded (Stremio ids can contain ":" or "/"). */
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

export const routes = {
  home: "/",
  movies: "/movies",
  tv: "/tv",
  search: "/search",
  admin: "/admin",
  myList: "/my-list",
  settings: (tab?: "account" | "addons" | "home-rows" | "blocked-genres" | "plus" | "sounds" | "subtitles" | "audio") => (tab ? `/settings/${tab}` : "/settings"),
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
};

export const parseOptionalInt = (value: string | undefined): number | null => {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
