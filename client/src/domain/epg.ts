import { api } from "../lib/api";

/** The TV guide's data, as the web server's /api/epg answers (see server/src/epg). Times are seconds since 1970. */
export interface GuideProgramme {
  s: number;
  e: number;
  /** Title. */
  t: string;
  /** Episode title. */
  st?: string;
  /** Description. */
  d?: string;
  /** Category. */
  c?: string;
}
export interface GuideChannel {
  key: string;
  epgId: string;
  name: string;
  icon: string | null;
  programmes: GuideProgramme[];
}
export interface Guide {
  source: string;
  from: number;
  to: number;
  updatedAt: number;
  channels: GuideChannel[];
  unmatched: string[];
}
export interface GuideSource {
  id: string;
  label: string;
}

export const fetchGuideSources = async (): Promise<GuideSource[]> => (await api<{ sources: GuideSource[] }>("/epg/sources")).sources;
export const fetchGuide = (source: string, channels: Array<{ key: string; name: string }>, from: number, to: number) =>
  api<Guide>("/epg/guide", { method: "POST", body: { source, channels, from, to } });

/** The most channels one request may ask about (the server's limit). */
export const GUIDE_BATCH = 250;
/** How wide the grid is: an hour before now, then this many hours on. */
export const GUIDE_HOURS_BEFORE = 1;
export const GUIDE_HOURS_AFTER = 23;
/** Horizontal size of one minute in the grid. */
export const PX_PER_MINUTE = 5;
const MINUTE = 60;

/** The country whose listings are the likely ones for a browser language ("en-GB" → UK1), or null. */
export function defaultGuideSource(language: string | undefined): string | null {
  const region = /[-_]([A-Za-z]{2})\b/.exec(language ?? "")?.[1]?.toUpperCase();
  const lang = (language ?? "").slice(0, 2).toLowerCase();
  const byRegion: Record<string, string> = { GB: "UK1", UK: "UK1", US: "US2", CA: "CA2", IE: "IE1", AU: "AU1", NZ: "NZ1", ZA: "ZA1", IN: "IN1", DE: "DE1", AT: "AT1", CH: "CH1", FR: "FR1", ES: "ES1", IT: "IT1", NL: "NL1", BE: "BE2", PT: "PT1", SE: "SE1", NO: "NO1", DK: "DK1", FI: "FI1", PL: "PL1", CZ: "CZ1", GR: "GR1", TR: "TR1", BR: "BR1", MX: "MX1", AR: "AR1", CL: "CL1", CO: "CO1", AE: "AE1", SA: "SA1", PK: "PK1", PH: "PH1", MY: "MY1", SG: "SG1", HK: "HK1", JP: "JP1", KR: "KR1" };
  if (region && byRegion[region]) return byRegion[region]!;
  const byLanguage: Record<string, string> = { en: "UK1", de: "DE1", fr: "FR1", es: "ES1", it: "IT1", nl: "NL1", pt: "PT1", sv: "SE1", no: "NO1", nb: "NO1", da: "DK1", fi: "FI1", pl: "PL1", cs: "CZ1", el: "GR1", tr: "TR1", ja: "JP1", ko: "KR1" };
  return byLanguage[lang] ?? null;
}

export interface GuideWindow {
  from: number;
  to: number;
}
/** The grid's window around [nowMs]: starts on a half hour, an hour or so before now. */
export function guideWindow(nowMs: number): GuideWindow {
  const start = Math.floor((nowMs / 1000 - GUIDE_HOURS_BEFORE * 3600) / 1800) * 1800;
  return { from: start, to: start + (GUIDE_HOURS_BEFORE + GUIDE_HOURS_AFTER) * 3600 };
}

/** How far from the left of the grid a time is, in pixels (clamped to the window). */
export const offsetPx = (time: number, window: GuideWindow): number => ((Math.min(Math.max(time, window.from), window.to) - window.from) / MINUTE) * PX_PER_MINUTE;
export const gridWidthPx = (window: GuideWindow): number => offsetPx(window.to, window);

export interface Block {
  programme: GuideProgramme;
  left: number;
  width: number;
}
/** Where each programme sits in a row: left edge and width in pixels; programmes outside the window are dropped, and one that overlaps the one before starts after it. */
export function layoutRow(programmes: GuideProgramme[], window: GuideWindow): Block[] {
  const blocks: Block[] = [];
  let edge = 0;
  for (const programme of [...programmes].sort((a, b) => a.s - b.s)) {
    if (programme.e <= window.from || programme.s >= window.to) continue;
    const left = Math.max(offsetPx(programme.s, window), edge);
    const right = offsetPx(programme.e, window);
    if (right - left < 1) continue;
    blocks.push({ programme, left, width: right - left });
    edge = right;
  }
  return blocks;
}

/** The programme on at [nowS], if any. */
export const programmeAt = (programmes: GuideProgramme[], nowS: number): GuideProgramme | null => programmes.find((p) => p.s <= nowS && nowS < p.e) ?? null;
/** How far through a programme it is, 0 to 1. */
export const progressOf = (p: GuideProgramme, nowS: number): number => Math.min(1, Math.max(0, (nowS - p.s) / (p.e - p.s)));

export interface Tick {
  time: number;
  left: number;
  label: string;
  /** True on the hour. */
  major: boolean;
}
export const formatClock = (seconds: number, locale?: string): string => new Date(seconds * 1000).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
export const formatDayName = (seconds: number, nowMs: number, locale?: string): string => {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(seconds * 1000) === day(nowMs)) return "Today";
  if (day(seconds * 1000) === day(nowMs + 86_400_000)) return "Tomorrow";
  if (day(seconds * 1000) === day(nowMs - 86_400_000)) return "Yesterday";
  return new Date(seconds * 1000).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
};
/** A mark every half hour across the window, labelled with the clock time. */
export function timeTicks(window: GuideWindow, locale?: string): Tick[] {
  const ticks: Tick[] = [];
  for (let time = Math.ceil(window.from / 1800) * 1800; time < window.to; time += 1800) {
    ticks.push({ time, left: offsetPx(time, window), label: formatClock(time, locale), major: time % 3600 === 0 });
  }
  return ticks;
}
/** "20:00 – 21:00" for a programme. */
export const formatRange = (p: Pick<GuideProgramme, "s" | "e">, locale?: string): string => `${formatClock(p.s, locale)} – ${formatClock(p.e, locale)}`;
