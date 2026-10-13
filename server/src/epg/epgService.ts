import { createGunzip } from "node:zlib";
import { request as undiciRequest } from "undici";
import { buildChannelIndex, matchChannel, type ChannelIndex } from "./match.js";
import { parseXmltv, type EpgData, type EpgProgramme } from "./xmltv.js";

/**
 * TV-guide listings for the Live TV tab. The addons only name channels (they carry no schedule), so the listings come from public XMLTV
 * files, one per country, fetched by this server, trimmed to a day or so around now, and matched to an addon's channels by name.
 * Only the fixed addresses below are ever fetched: a visitor chooses a country, never a web address.
 */
const BASE = "https://epgshare01.online/epgshare01/";
export const EPG_SOURCES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "UK1", label: "United Kingdom" },
  { id: "US2", label: "United States" },
  { id: "US_SPORTS1", label: "United States sports" },
  { id: "CA2", label: "Canada" },
  { id: "IE1", label: "Ireland" },
  { id: "AU1", label: "Australia" },
  { id: "NZ1", label: "New Zealand" },
  { id: "ZA1", label: "South Africa" },
  { id: "IN1", label: "India" },
  { id: "DE1", label: "Germany" },
  { id: "FR1", label: "France" },
  { id: "ES1", label: "Spain" },
  { id: "IT1", label: "Italy" },
  { id: "NL1", label: "Netherlands" },
  { id: "BE2", label: "Belgium" },
  { id: "PT1", label: "Portugal" },
  { id: "CH1", label: "Switzerland" },
  { id: "AT1", label: "Austria" },
  { id: "SE1", label: "Sweden" },
  { id: "NO1", label: "Norway" },
  { id: "DK1", label: "Denmark" },
  { id: "FI1", label: "Finland" },
  { id: "PL1", label: "Poland" },
  { id: "CZ1", label: "Czechia" },
  { id: "GR1", label: "Greece" },
  { id: "TR1", label: "Türkiye" },
  { id: "BR1", label: "Brazil" },
  { id: "MX1", label: "Mexico" },
  { id: "AR1", label: "Argentina" },
  { id: "CL1", label: "Chile" },
  { id: "CO1", label: "Colombia" },
  { id: "AE1", label: "United Arab Emirates" },
  { id: "SA1", label: "Saudi Arabia" },
  { id: "PK1", label: "Pakistan" },
  { id: "PH1", label: "Philippines" },
  { id: "MY1", label: "Malaysia" },
  { id: "SG1", label: "Singapore" },
  { id: "HK1", label: "Hong Kong" },
  { id: "JP1", label: "Japan" },
  { id: "KR1", label: "South Korea" },
];
const sourceUrl = (id: string) => `${BASE}epg_ripper_${id}.xml.gz`;

const HOUR = 3600;
/** What a loaded file keeps: from this long before now to this long after. */
const KEEP_BEFORE_S = 3 * HOUR;
const KEEP_AFTER_S = 40 * HOUR;
/** A file is read again after this long; if that fails, the old copy is served for up to a day. */
const FRESH_MS = 3 * HOUR * 1000;
const STALE_OK_MS = 24 * HOUR * 1000;
const MAX_CACHED_SOURCES = 4;
const MAX_COMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 600 * 1024 * 1024;
/** The most a guide request may cover, and how far back it may reach. */
const MAX_SPAN_S = 36 * HOUR;
const MAX_BACK_S = 6 * HOUR;

export interface GuideChannelRequest {
  key: string;
  name: string;
}
export interface GuideProgramme {
  s: number;
  e: number;
  t: string;
  st?: string;
  d?: string;
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
  /** When the listings were read, in seconds since 1970. */
  updatedAt: number;
  channels: GuideChannel[];
  /** The keys of channels that matched nothing in this country's listings. */
  unmatched: string[];
}

interface Loaded {
  at: number;
  data: EpgData;
  index: ChannelIndex;
}

export type FetchListings = (sourceId: string) => Promise<AsyncIterable<Uint8Array | string>>;

/** The real fetch: the country's gzip file, unpacked as it arrives, with limits on what it may be. */
export const fetchListings: FetchListings = async (sourceId) => {
  const response = await undiciRequest(sourceUrl(sourceId), { headersTimeout: 20_000, bodyTimeout: 60_000, maxRedirections: 3, headers: { "user-agent": "ArcTV-Guide/1.0", "accept-encoding": "identity" } });
  if (response.statusCode !== 200) {
    void response.body.dump?.().catch(() => undefined);
    throw new Error(`The listings host answered ${response.statusCode}.`);
  }
  const gunzip = createGunzip();
  let packed = 0;
  response.body.on("data", (chunk: Buffer) => {
    packed += chunk.length;
    if (packed > MAX_COMPRESSED_BYTES) gunzip.destroy(new Error("The listings file is too large."));
  });
  response.body.on("error", (error) => gunzip.destroy(error));
  response.body.pipe(gunzip);
  return (async function* () {
    let unpacked = 0;
    for await (const chunk of gunzip) {
      unpacked += (chunk as Buffer).length;
      if (unpacked > MAX_UNPACKED_BYTES) throw new Error("The listings file is too large.");
      yield chunk as Buffer;
    }
  })();
};

export interface EpgService {
  guide(sourceId: string, channels: GuideChannelRequest[], from?: number, to?: number): Promise<Guide>;
}

export function createEpgService(options: { fetchListings?: FetchListings; now?: () => number } = {}): EpgService {
  const read = options.fetchListings ?? fetchListings;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, Loaded>();
  const loading = new Map<string, Promise<Loaded>>();

  async function load(sourceId: string): Promise<Loaded> {
    const nowS = Math.floor(now() / 1000);
    const data = await parseXmltv(await read(sourceId), { from: nowS - KEEP_BEFORE_S, to: nowS + KEEP_AFTER_S });
    const index = buildChannelIndex(data.channels.values(), (id) => (data.programmes.get(id)?.length ?? 0) > 0);
    return { at: now(), data, index };
  }

  async function listings(sourceId: string): Promise<Loaded> {
    const cached = cache.get(sourceId);
    if (cached && now() - cached.at < FRESH_MS) return cached;
    let pending = loading.get(sourceId);
    if (!pending) {
      pending = load(sourceId).finally(() => loading.delete(sourceId));
      loading.set(sourceId, pending);
    }
    try {
      const fresh = await pending;
      cache.delete(sourceId);
      cache.set(sourceId, fresh);
      while (cache.size > MAX_CACHED_SOURCES) cache.delete(cache.keys().next().value as string);
      return fresh;
    } catch (error) {
      if (cached && now() - cached.at < STALE_OK_MS) return cached; // the host is down: yesterday's guide beats none
      throw error;
    }
  }

  return {
    async guide(sourceId, channels, from, to) {
      if (!EPG_SOURCES.some((s) => s.id === sourceId)) throw new Error("Unknown guide source.");
      const loaded = await listings(sourceId);
      const nowS = Math.floor(now() / 1000);
      const start = Math.max(from ?? nowS - HOUR, nowS - MAX_BACK_S);
      const end = Math.min(to ?? start + 12 * HOUR, start + MAX_SPAN_S);
      const out: GuideChannel[] = [];
      const unmatched: string[] = [];
      for (const requested of channels) {
        const epg = matchChannel(loaded.index, requested.name);
        if (!epg) {
          unmatched.push(requested.key);
          continue;
        }
        const programmes = (loaded.data.programmes.get(epg.id) ?? []).filter((p) => p.e > start && p.s < end).map(toGuideProgramme);
        out.push({ key: requested.key, epgId: epg.id, name: epg.names[0] ?? requested.name, icon: epg.icon, programmes });
      }
      return { source: sourceId, from: start, to: end, updatedAt: Math.floor(loaded.at / 1000), channels: out, unmatched };
    },
  };
}

function toGuideProgramme(p: EpgProgramme): GuideProgramme {
  const out: GuideProgramme = { s: p.s, e: p.e, t: p.title };
  if (p.subtitle) out.st = p.subtitle;
  if (p.desc) out.d = p.desc;
  if (p.category) out.c = p.category;
  return out;
}
