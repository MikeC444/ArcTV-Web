import { api } from "../lib/api";

/** What the developer panel reads (GET /api/admin/*, read-only; the backend only answers accounts flagged is_admin). */
export interface AdminDevice {
  name: string;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string | null;
}
/** People using ArcTV right now: distinct accounts, in total and per platform. */
export interface LiveCount {
  users: number;
  byPlatform: Record<string, number>;
}
export interface LiveSummary {
  online: LiveCount;
  watching: LiveCount;
  onlineWindowSeconds: number;
  watchingWindowSeconds: number;
}
/** "Fire TV 2 · Web 1" for a platform split, biggest first; empty when nobody. */
export const platformSplit = (byPlatform: Record<string, number>, name: (platform: string) => string): string =>
  Object.entries(byPlatform)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([platform, n]) => `${name(platform)} ${n}`)
    .join(" · ");
/** "5 minutes", "45 seconds". */
export const windowLabel = (seconds: number): string => (seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} minutes` : seconds === 60 ? "1 minute" : `${seconds} seconds`);

export interface AdminSummary {
  users: number;
  newLast7Days: number;
  activeLast7Days: number;
  plus: { monthly: number; yearly: number; lifetime: number };
  versions: Array<{ version: string; platform: string; devices: number }>;
  /** Absent from a backend that predates it. */
  externalPlayer?: ExternalPlayerSummary;
  /** Absent from a backend that predates it. */
  live?: LiveSummary;
}
export interface ExternalPlayerEvent {
  title: string | null;
  releaseTitle: string | null;
  resolution: string | null;
  codec: string | null;
  trigger: string | null;
  outcome: string;
  engine: string | null;
  errorMessage: string | null;
  appVersion: string | null;
  createdAt: string;
  email: string;
}
export interface ExternalPlayerSummary {
  opens7d: number;
  vlc7d: number;
  users7d: number;
  afterError7d: number;
  fromButton7d: number;
  noPlayer7d: number;
  opensTotal: number;
  recent: ExternalPlayerEvent[];
}
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  isAdmin: boolean;
  plan: "monthly" | "yearly" | "lifetime" | null;
  plusUntil: string | null;
  cancelling: boolean;
  profiles: number;
  addons: number;
  continueWatching: number;
  lastSeenAt: string | null;
  devices: AdminDevice[];
}
export interface AdminUserList {
  total: number;
  users: AdminUserRow[];
}
export interface AdminUserDetail {
  user: AdminUserRow & { plusStatus: string | null; hasStripeSubscription: boolean };
  profiles: Array<{ id: string; name: string; kind: string; avatar: string; isDefault: boolean; hasPin: boolean; createdAt: string }>;
  devices: Array<AdminDevice & { createdAt: string; revokedAt: string | null }>;
  addons: Array<{ profileId: string; name: string; addonId: string; host: string; configured: boolean; debrid: string | null; enabled: boolean; installedAt: string; updatedAt: string }>;
  continueWatching: Array<{ profileId: string; title: string; contentType: string; seasonNumber: number | null; episodeNumber: number | null; episodeTitle: string | null; positionMs: number; durationMs: number; lastWatchedAt: string }>;
  history: Array<{ profileId: string; title: string; contentType: string; seasonNumber: number | null; episodeNumber: number | null; positionMs: number; durationMs: number; completed: boolean; watchedAt: string }>;
  myListCount: number;
}

export const fetchAdminSummary = () => api<AdminSummary>("/admin/summary");
/** The user list filters; an empty value means "no filter". `device` is "<platform>|<app version>". */
export interface AdminFilters {
  q: string;
  plan: "" | "free" | "monthly" | "yearly" | "lifetime";
  device: string;
  addons: "" | "with" | "none";
  watching: "" | "with" | "none";
  seen: "" | "1h" | "24h" | "7d" | "30d" | "older" | "never";
}
export const NO_FILTERS: AdminFilters = { q: "", plan: "", device: "", addons: "", watching: "", seen: "" };
export const filtersActive = (f: AdminFilters): boolean => (Object.keys(NO_FILTERS) as Array<keyof AdminFilters>).some((k) => f[k] !== "");
export const adminUsersQuery = (f: AdminFilters, limit: number, offset: number): string => {
  const params = new URLSearchParams();
  for (const k of Object.keys(NO_FILTERS) as Array<keyof AdminFilters>) if (f[k]) params.set(k, f[k]);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params.toString();
};
export const fetchAdminUsers = (f: AdminFilters, limit: number, offset = 0) => api<AdminUserList>(`/admin/users?${adminUsersQuery(f, limit, offset)}`);
export const fetchAdminUser = (id: string) => api<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);

/** The newest version number among devices, comparing dotted numbers ("0.1.10" is newer than "0.1.9"); non-numeric ones (web, unknown) never count. */
export function newestVersion(versions: string[]): string | null {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  let best: string | null = null;
  let bestParts: number[] | null = null;
  for (const v of versions) {
    const parts = parse(v);
    if (parts && (!bestParts || compare(parts, bestParts) > 0)) {
      best = v;
      bestParts = parts;
    }
  }
  return best;
}
