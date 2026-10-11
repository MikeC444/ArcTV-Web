import type { AddonManifest, InstalledAddon } from "../types";
import { fetchJson } from "./client";
import { encodeSegment, resourceBase } from "./url";

/** A subtitle file an addon offers for the video being played (the Stremio protocol's `/subtitles/{type}/{id}.json`). */
export interface AddonSubtitle {
  addonName: string;
  /** The language as the addon wrote it ("eng"). */
  languageCode: string;
  /** The language as a person reads it ("English"). */
  languageName: string;
  url: string;
}

interface RawSubtitle {
  url?: unknown;
  lang?: unknown;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/**
 * Whether this manifest offers subtitles for a title of `type` ("movie" or "series") with this `id`. An addon that doesn't list "subtitles"
 * among its resources isn't asked. A resource is a plain name or an object that narrows it to some types and id prefixes; the manifest's own
 * types and id prefixes apply where the resource says nothing.
 */
export function offersSubtitles(manifest: Pick<AddonManifest, "resources" | "types" | "idPrefixes">, type: string, id: string): boolean {
  for (const resource of manifest.resources) {
    let name: unknown = resource;
    let types: string[] = [];
    let prefixes: string[] = [];
    if (resource && typeof resource === "object") {
      const object = resource as Record<string, unknown>;
      name = object.name;
      types = strings(object.types);
      prefixes = strings(object.idPrefixes);
    }
    if (name !== "subtitles") continue;
    const allowedTypes = types.length ? types : manifest.types;
    const allowedPrefixes = prefixes.length ? prefixes : manifest.idPrefixes;
    if (allowedTypes.length && !allowedTypes.includes(type)) continue;
    if (allowedPrefixes.length && !allowedPrefixes.some((p) => id.startsWith(p))) continue;
    return true;
  }
  return false;
}

/** ISO 639-2 codes ("eng", "fre") to the two-letter codes a language preference ("en") uses. */
const ISO3_TO_ISO1: Record<string, string> = Object.fromEntries(
  (
    "eng en,spa es,fra fr,fre fr,deu de,ger de,ita it,por pt,nld nl,dut nl,swe sv,pol pl,tur tr,ara ar,hin hi,jpn ja,kor ko,zho zh,chi zh,rus ru," +
    "ukr uk,ces cs,cze cs,slk sk,slo sk,hun hu,ron ro,rum ro,bul bg,ell el,gre el,heb he,fas fa,per fa,tha th,vie vi,ind id,msa ms,may ms,fin fi," +
    "dan da,nor no,nob nb,isl is,ice is,hrv hr,srp sr,slv sl,lit lt,lav lv,est et,cat ca,eus eu,baq eu,glg gl,ben bn,tam ta,tel te,urd ur,fil tl,sqi sq,alb sq,mkd mk,mac mk,hye hy,arm hy,kat ka,geo ka"
  )
    .split(",")
    .map((pair) => pair.split(" ") as [string, string]),
);

const DISPLAY_NAMES = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

function displayName(code: string): string | null {
  try {
    const name = DISPLAY_NAMES?.of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

/** The two-letter code for whatever an addon sent: "eng", "en", "en-US", "pt-BR", "English" all give a code a language preference ("en") can be compared with; null when it can't be told. */
export function languageKey(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;
  const base = text.split(/[-_]/)[0]!;
  if (base.length === 2) return base;
  const fromIso3 = ISO3_TO_ISO1[base];
  if (fromIso3) return fromIso3;
  // A written-out name ("english").
  for (const key of Object.values(ISO3_TO_ISO1)) if (displayName(key)?.toLowerCase() === text) return key;
  return null;
}

/** "English" for "eng"; the code in capitals when the language isn't known, so the list never shows a blank. */
export function languageDisplayName(raw: string | null | undefined): string {
  const key = languageKey(raw);
  return (key && displayName(key)) || (raw ?? "").trim().toUpperCase() || "Unknown";
}

/** Turns one addon's answer into list entries: only files with a web address, one per address, each with a readable language. */
export function toAddonSubtitles(subtitles: unknown, addonName: string): AddonSubtitle[] {
  if (!Array.isArray(subtitles)) return [];
  const seen = new Set<string>();
  const out: AddonSubtitle[] = [];
  for (const s of subtitles as RawSubtitle[]) {
    const url = typeof s?.url === "string" ? s.url.trim() : "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    const lang = typeof s.lang === "string" ? s.lang.trim() : "";
    out.push({ addonName, languageCode: lang, languageName: languageDisplayName(lang), url });
  }
  return out;
}

/** Puts the person's preferred language first, then the rest by language name (each addon's own order within one language), at most `perLanguage` files per language and `total` overall so the menu stays short. */
export function rankSubtitles(found: AddonSubtitle[], preferredLanguage: string | null | undefined, perLanguage = 5, total = 60): AddonSubtitle[] {
  const preferred = languageKey(preferredLanguage);
  const groups = new Map<string, AddonSubtitle[]>();
  for (const s of found) {
    const key = languageKey(s.languageCode) ?? s.languageName.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()]
    .sort(([ka, a], [kb, b]) => (ka === preferred ? 0 : 1) - (kb === preferred ? 0 : 1) || a[0]!.languageName.localeCompare(b[0]!.languageName))
    .flatMap(([, files]) => files.slice(0, perLanguage))
    .slice(0, total);
}

/** `/subtitles/{type}/{id}.json`, with the file name as an extra (`/subtitles/{type}/{id}/filename=....json`) when known, which addons use to match a release. */
export async function fetchSubtitles(manifestUrl: string, type: string, id: string, filename?: string | null): Promise<unknown> {
  const encodedId = id.split(":").map(encodeSegment).join(":");
  const extra = filename?.trim() ? `/filename=${encodeSegment(filename.trim())}` : "";
  const json = (await fetchJson(`${resourceBase(manifestUrl)}/subtitles/${type}/${encodedId}${extra}.json`, 0)) as { subtitles?: unknown };
  return json?.subtitles;
}

const ADDON_TIMEOUT_MS = 8_000;

/**
 * Asks the person's addons that offer subtitles which files they have for the video being played. Best-effort: an addon that is slow, down
 * or answers badly just adds nothing, and this never rejects, since a missing subtitle list must never get in the way of the video.
 */
export async function findAddonSubtitles(
  addons: InstalledAddon[],
  args: { type: "MOVIE" | "TV_SHOW"; id: string; season: number | null; episode: number | null; filename: string | null; preferredLanguage: string | null },
): Promise<AddonSubtitle[]> {
  const stremioType = args.type === "TV_SHOW" ? "series" : "movie";
  const requestId = args.season != null && args.episode != null ? `${args.id}:${args.season}:${args.episode}` : args.id;
  const asked = addons.filter((a) => a.enabled && offersSubtitles(a.manifest, stremioType, requestId));
  const answers = await Promise.all(
    asked.map(async (addon) => {
      try {
        const raw = await Promise.race([
          fetchSubtitles(addon.manifestUrl, stremioType, requestId, args.filename),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ADDON_TIMEOUT_MS)),
        ]);
        return toAddonSubtitles(raw, addon.manifest.name);
      } catch {
        return [];
      }
    }),
  );
  return rankSubtitles(answers.flat(), args.preferredLanguage);
}

// ── turning a downloaded file into cues the <video> element can show ───────────

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const TIMING = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

const seconds = (h: string | undefined, m: string, s: string, ms: string): number => Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;

/** Reads SubRip (.srt) and WebVTT text into cues. Anything that isn't a timing line followed by text is ignored. */
export function parseSubtitleCues(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => TIMING.test(l));
    if (at < 0) continue;
    const m = TIMING.exec(lines[at]!)!;
    const body = lines
      .slice(at + 1)
      .join("\n")
      .replace(/\{\\an?\d+\}/g, "")
      .replace(/<\/?font[^>]*>/gi, "")
      .trim();
    if (!body) continue;
    const start = seconds(m[1], m[2]!, m[3]!, m[4]!);
    const end = seconds(m[5], m[6]!, m[7]!, m[8]!);
    if (end > start) cues.push({ start, end, text: body });
  }
  return cues;
}
