import { api } from "../../lib/api";
import type { AddonManifest } from "../types";
import type { StremioMeta, StremioMetaPreview, StremioStream } from "./models";
import { encodeSegment, resourceBase } from "./url";

/**
 * Talks the Stremio addon protocol (data/addon/StremioAddonClient.kt). Addons built with the official SDK send
 * `Access-Control-Allow-Origin: *`, so the browser calls them directly, exactly like the TV app does. If the direct
 * call fails at the network layer (an addon without CORS headers, or an http:// addon behind our https page) the
 * request is retried once through the signed-in-only, SSRF-hardened /api/addon-proxy.
 */
export class AddonHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AddonHttpError";
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

interface CacheEntry {
  at: number;
  pending: boolean;
  promise: Promise<unknown>;
}
const cache = new Map<string, CacheEntry>();

export function clearAddonCache(): void {
  cache.clear();
}

async function directFetch(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (!response.ok) throw new AddonHttpError(`HTTP ${response.status}`, response.status);
  return response.json();
}

async function fetchJsonOnce(url: string): Promise<unknown> {
  try {
    return await directFetch(url);
  } catch (error) {
    if (error instanceof AddonHttpError) throw error; // the addon answered — no point asking a proxy
    if (error instanceof SyntaxError) throw new AddonHttpError("The addon didn't return valid JSON.");
    try {
      return await api(`/addon-proxy?url=${encodeURIComponent(url)}`);
    } catch (proxyError) {
      const message = (proxyError as Error).message || "The addon couldn't be reached.";
      throw new AddonHttpError(message, (proxyError as { status?: number }).status);
    }
  }
}

/** Identical concurrent requests share one round trip; `ttlMs` also serves repeats (Home → Detail → Similar). */
export function fetchJson(url: string, ttlMs = 0): Promise<unknown> {
  const hit = cache.get(url);
  if (hit && (hit.pending || Date.now() - hit.at <= ttlMs)) return hit.promise;
  const entry: CacheEntry = { at: Date.now(), pending: true, promise: fetchJsonOnce(url) };
  cache.set(url, entry);
  entry.promise.then(
    () => {
      entry.pending = false;
      entry.at = Date.now();
      if (ttlMs === 0 && cache.get(url) === entry) cache.delete(url);
    },
    () => {
      if (cache.get(url) === entry) cache.delete(url);
    },
  );
  return entry.promise;
}

const CATALOG_TTL = 5 * 60_000;

export function normalizeManifest(raw: unknown): AddonManifest {
  if (!raw || typeof raw !== "object") throw new AddonHttpError("That URL didn't return an addon manifest.");
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id || typeof m.name !== "string" || !m.name) {
    throw new AddonHttpError("That doesn't look like a Stremio addon manifest (missing id or name).");
  }
  const catalogs = Array.isArray(m.catalogs) ? m.catalogs : [];
  return {
    id: m.id,
    name: m.name,
    version: typeof m.version === "string" ? m.version : "0.0.0",
    description: typeof m.description === "string" ? m.description : null,
    logo: typeof m.logo === "string" ? m.logo : null,
    background: typeof m.background === "string" ? m.background : null,
    types: Array.isArray(m.types) ? m.types.filter((t): t is string => typeof t === "string") : [],
    resources: Array.isArray(m.resources) ? m.resources : [],
    idPrefixes: Array.isArray(m.idPrefixes) ? m.idPrefixes.filter((t): t is string => typeof t === "string") : [],
    catalogs: catalogs
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as { type?: unknown }).type === "string" && typeof (c as { id?: unknown }).id === "string")
      .map((c) => ({
        type: c.type as string,
        id: c.id as string,
        name: typeof c.name === "string" ? c.name : null,
        extra: (Array.isArray(c.extra) ? c.extra : [])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && typeof (e as { name?: unknown }).name === "string")
          .map((e) => ({
            name: e.name as string,
            isRequired: e.isRequired === true,
            options: Array.isArray(e.options) ? e.options.filter((o): o is string => typeof o === "string") : null,
            optionsLimit: typeof e.optionsLimit === "number" ? e.optionsLimit : null,
          })),
      })),
  };
}

export async function fetchManifest(manifestUrl: string): Promise<{ manifest: AddonManifest; raw: Record<string, unknown> }> {
  const raw = await fetchJson(manifestUrl, 0);
  return { manifest: normalizeManifest(raw), raw: raw as Record<string, unknown> };
}

export async function fetchCatalog(manifestUrl: string, type: string, catalogId: string, extra: Record<string, string> = {}): Promise<StremioMetaPreview[]> {
  const entries = Object.entries(extra);
  const extraSegment = entries.length ? "/" + entries.map(([k, v]) => `${encodeSegment(k)}=${encodeSegment(v)}`).join("&") : "";
  const json = (await fetchJson(`${resourceBase(manifestUrl)}/catalog/${type}/${encodeSegment(catalogId)}${extraSegment}.json`, CATALOG_TTL)) as { metas?: StremioMetaPreview[] };
  return Array.isArray(json?.metas) ? json.metas : [];
}

/** Series stream ids are "imdbId:season:episode": each part is encoded separately so the colons stay literal. */
export async function fetchStreams(manifestUrl: string, type: string, id: string): Promise<StremioStream[]> {
  const encodedId = id.split(":").map(encodeSegment).join(":");
  const json = (await fetchJson(`${resourceBase(manifestUrl)}/stream/${type}/${encodedId}.json`, 0)) as { streams?: StremioStream[] };
  return Array.isArray(json?.streams) ? json.streams : [];
}

export async function fetchMeta(manifestUrl: string, type: string, id: string): Promise<StremioMeta | null> {
  const json = (await fetchJson(`${resourceBase(manifestUrl)}/meta/${type}/${encodeSegment(id)}.json`, CATALOG_TTL)) as { meta?: StremioMeta | null };
  return json?.meta ?? null;
}
