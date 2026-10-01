import type { ContentType } from "../domain/types";

/** navigation/MangoRoutes.kt for the browser. IDs are percent-encoded (Stremio ids can contain ":" or "/"). */
const enc = encodeURIComponent;

export const NAV_ITEMS = [
  { label: "Home", to: "/" },
  { label: "Movies", to: "/movies" },
  { label: "TV Shows", to: "/tv" },
  { label: "Genres", to: "/genres" },
  { label: "Search", to: "/search" },
  { label: "My List", to: "/my-list" },
  { label: "Settings", to: "/settings" },
] as const;

export const routes = {
  home: "/",
  movies: "/movies",
  tv: "/tv",
  genres: "/genres",
  genre: (genre: string) => `/genres/${enc(genre)}`,
  search: "/search",
  myList: "/my-list",
  settings: (tab?: "account" | "addons" | "home-rows" | "blocked-genres" | "sounds" | "subtitles") => (tab ? `/settings/${tab}` : "/settings"),
  addAddon: "/settings/addons/add",
  detail: (providerId: string, type: ContentType, id: string) => `/detail/${enc(providerId)}/${type}/${enc(id)}`,
  sources: (providerId: string, type: ContentType, id: string, season?: number | null, episode?: number | null, skipAutoSelect = false) =>
    `/sources/${enc(providerId)}/${type}/${enc(id)}/${season ?? -1}/${episode ?? -1}${skipAutoSelect ? "?skip=1" : ""}`,
  player: (providerId: string, type: ContentType, id: string, season: number | null | undefined, episode: number | null | undefined, streamId: string) =>
    `/player/${enc(providerId)}/${type}/${enc(id)}/${season ?? -1}/${episode ?? -1}/${enc(streamId)}`,
  auth: "/auth",
  authMethod: (intent: "login" | "register") => `/auth/method/${intent}`,
  authPassword: (intent: "login" | "register") => `/auth/password/${intent}`,
  authQr: (intent: "login" | "register") => `/auth/qr/${intent}`,
};

export const parseOptionalInt = (value: string | undefined): number | null => {
  const n = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
