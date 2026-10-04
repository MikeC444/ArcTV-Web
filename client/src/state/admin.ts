import { api } from "../lib/api";

/** What the developer panel reads (GET /api/admin/*, read-only; the backend only answers accounts flagged is_admin). */
export interface AdminDevice {
  name: string;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string | null;
}
export interface AdminSummary {
  users: number;
  newLast7Days: number;
  activeLast7Days: number;
  plus: { monthly: number; yearly: number; lifetime: number };
  versions: Array<{ version: string; platform: string; devices: number }>;
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
export const fetchAdminUsers = (q: string, limit: number, offset = 0) => api<AdminUserList>(`/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), limit: String(limit), offset: String(offset) })}`);
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
