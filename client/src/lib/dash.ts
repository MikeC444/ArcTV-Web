import type { AdminSummary } from "../state/admin";
import { newestVersion } from "../state/admin";
import { leftEarly, percent, standsOut, type PlaybackGroup } from "./playbackHealth";

/** The pure logic behind the developer dashboard: names, version adoption, the "Needs attention" rules and the little chart shapes. */

export const platformName = (p: string): string =>
  p === "fire_tv" ? "Fire TV" : p === "web" ? "Web" : p === "android_tv" ? "Android TV" : p === "android_mobile" ? "Phone" : p === "mac" ? "Mac" : p === "windows" ? "Windows" : p;

/** Brand-ish colours for each platform, in the order the legends use. */
export const PLATFORM_COLORS: Record<string, string> = {
  fire_tv: "#19e6ff",
  web: "#2f80ff",
  android_mobile: "#9b5cff",
  mac: "#ff7ac8",
  windows: "#ffb347",
  android_tv: "#3ddc97",
};
export const platformColor = (p: string): string => PLATFORM_COLORS[p] ?? "#a9a9b4";

export interface PlatformVersions {
  platform: string;
  devices: number;
  /** The newest numbered version seen for this app, or null (the web app has none). */
  newest: string | null;
  /** Devices on a numbered version older than [newest]. */
  behind: number;
  versions: Array<{ version: string; devices: number; old: boolean }>;
}

/** Version adoption per app: each app is compared with its own newest version, not with the newest number anywhere. Biggest app first. */
export function versionsByPlatform(versions: AdminSummary["versions"]): PlatformVersions[] {
  const byPlatform = new Map<string, AdminSummary["versions"]>();
  for (const v of versions) byPlatform.set(v.platform, [...(byPlatform.get(v.platform) ?? []), v]);
  const result: PlatformVersions[] = [];
  for (const [platform, list] of byPlatform) {
    const newest = newestVersion(list.map((v) => v.version));
    const rows = list
      .map((v) => ({ version: v.version, devices: v.devices, old: newest != null && /^\d/.test(v.version) && v.version !== newest }))
      .sort((a, b) => b.devices - a.devices || b.version.localeCompare(a.version));
    result.push({ platform, devices: rows.reduce((n, r) => n + r.devices, 0), newest, behind: rows.filter((r) => r.old).reduce((n, r) => n + r.devices, 0), versions: rows });
  }
  return result.sort((a, b) => b.devices - a.devices || a.platform.localeCompare(b.platform));
}

/** Whether a device's version is behind its own app's newest. */
export function isOldVersion(platformVersions: PlatformVersions[], platform: string, version: string | null): boolean {
  if (version == null || !/^\d/.test(version)) return false;
  const newest = platformVersions.find((p) => p.platform === platform)?.newest;
  return newest != null && newest !== version;
}

export type AlertLevel = "bad" | "warn" | "ok";
export interface DashAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  /** The dashboard view that has the full picture. */
  view: "overview" | "users" | "playback" | "downloads" | "addons" | "versions";
}

const RANK: Record<AlertLevel, number> = { bad: 0, warn: 1, ok: 2 };

/** A viewing group that people leave early more than others, worded for a person. */
function groupAlerts(kind: string, groups: PlaybackGroup[], summary: NonNullable<AdminSummary["playback"]>): DashAlert[] {
  return groups
    .filter((g) => standsOut(g, summary))
    .map((g) => ({
      id: `playback-${kind}-${g.label}`,
      level: "warn" as const,
      title: `${kind} ${g.label}: people leave early`,
      detail: `${percent(leftEarly(g), g.plays)}% of its ${g.plays} viewings ended early, against ${percent(leftEarlyTotal(summary), summary.plays7d)}% overall.`,
      view: "playback" as const,
    }));
}

/** Playback "left early" total for a summary. */
function leftEarlyTotal(p: NonNullable<AdminSummary["playback"]>): number {
  return p.short7d + p.errors7d + p.neverStarted7d;
}

/**
 * The "Needs attention" list: every rule looks at numbers the panel already has, and an alert exists only while its rule holds, so it
 * clears itself when the problem does. Worst first; with nothing wrong it says so.
 */
export function attentionAlerts(summary: AdminSummary): DashAlert[] {
  const alerts: DashAlert[] = [];
  const playback = summary.playback;
  if (playback && playback.plays7d >= 10) {
    const rate = percent(leftEarlyTotal(playback), playback.plays7d);
    if (rate >= 40) {
      alerts.push({ id: "playback-early", level: "bad", title: `${rate}% of viewings end early`, detail: `${playback.short7d} short, ${playback.errors7d} player errors and ${playback.neverStarted7d} that never started, in the last 7 days.`, view: "playback" });
    }
    alerts.push(...groupAlerts("Device", playback.byDevice, playback).slice(0, 2), ...groupAlerts("Player", playback.byEngine, playback).slice(0, 1), ...groupAlerts("Quality", playback.byResolution, playback).slice(0, 1));
  }

  const platforms = versionsByPlatform(summary.versions);
  const behind = platforms.reduce((n, p) => n + p.behind, 0);
  const numbered = platforms.reduce((n, p) => n + p.versions.filter((v) => /^\d/.test(v.version)).reduce((m, v) => m + v.devices, 0), 0);
  if (behind > 0 && percent(behind, numbered) >= 20) {
    const worst = [...platforms].sort((a, b) => b.behind - a.behind)[0]!;
    alerts.push({ id: "old-versions", level: "warn", title: `${behind} ${behind === 1 ? "device is" : "devices are"} on an old version`, detail: `Most are on ${platformName(worst.platform)} (${worst.behind} behind ${worst.newest}).`, view: "versions" });
  }

  const growth = summary.userGrowth ?? [];
  if (growth.length > 15) {
    const today = growth[growth.length - 1]!;
    const before = growth.slice(-15, -1);
    const usual = before.reduce((n, p) => n + p.newUsers, 0) / before.length;
    if (today.newUsers >= 5 && today.newUsers >= Math.max(1, usual) * 3) {
      alerts.push({ id: "signup-spike", level: "warn", title: `${today.newUsers} sign-ups today`, detail: `That is well above the usual ${Math.max(1, Math.round(usual))} a day. Worth a look in case it is not real people.`, view: "users" });
    }
  }

  const dl = summary.downloads;
  if (dl && dl.openedPeople >= 10 && percent(dl.startedPeople, dl.openedPeople) < 20) {
    alerts.push({ id: "downloads-drop", level: "warn", title: "Few people press a download file", detail: `${dl.openedPeople} opened Downloads but only ${dl.startedPeople} pressed a file. The sources shown may not suit them.`, view: "downloads" });
  }

  const addons = summary.addons;
  if (addons && addons.flaggedUsers > 0) {
    alerts.push({ id: "addons-empty", level: "warn", title: `${addons.flaggedUsers} ${addons.flaggedUsers === 1 ? "person has" : "people have"} an addon that returns nothing`, detail: "Its catalogues are all of a type the apps ignore (such as anime), so it adds no rows.", view: "addons" });
  }

  alerts.sort((a, b) => RANK[a.level] - RANK[b.level]);
  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      level: "ok",
      title: "Nothing needs attention",
      detail: playback && playback.plays7d > 0 ? `Playback is healthy: ${percent(leftEarlyTotal(playback), playback.plays7d)}% of viewings end early.` : "No problems found in the numbers the panel can see.",
      view: "overview",
    });
  }
  return alerts;
}

/** An SVG path through [values] scaled into a width x height box (no padding), for sparklines. Flat for fewer than two values. */
export function sparkPath(values: number[], width: number, height: number): string {
  if (values.length < 2) return `M0 ${height / 2} L${width} ${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * width).toFixed(1)} ${(height - ((v - min) / span) * height).toFixed(1)}`).join(" ");
}

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
  /** The arc as start and end fractions of the circle. */
  from: number;
  to: number;
}

/** Splits a total into donut arcs (fractions of the circle), biggest first; empty when there is nothing. */
export function donutSlices(entries: Array<{ key: string; value: number; color: string }>): DonutSlice[] {
  const kept = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const total = kept.reduce((n, e) => n + e.value, 0);
  let at = 0;
  return kept.map((e) => {
    const from = at;
    at += e.value / total;
    return { ...e, from, to: at };
  });
}

/** The change from the previous equal-length window to the last one in a daily series: [last, previous, delta]. */
export function weekOverWeek(daily: number[], days = 7): { last: number; previous: number; delta: number } {
  const last = daily.slice(-days).reduce((n, v) => n + v, 0);
  const previous = daily.slice(-days * 2, -days).reduce((n, v) => n + v, 0);
  return { last, previous, delta: last - previous };
}
