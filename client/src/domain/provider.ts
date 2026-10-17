import { homeGenresFor, pickPage, varyOrder } from "./homeVariety";
import { featuresFromMeta, type Features } from "./recommend/features";
import { distinctBy, interleave } from "../lib/format";
import { AddonHttpError, describeAddonError, fetchCatalog, fetchMeta, fetchStreams } from "./stremio/client";
import { isLiveType, type LiveChannel, type LiveType } from "./live";
import { metaToContent, previewToChannel, previewToContent, streamToStream } from "./stremio/mapper";
import type { AddonCatalogDef, AddonManifest, Content, ContentType, HomeSection, Stream } from "./types";
import { serviceOfCatalog } from "./streamingServices";

/**
 * Port of data/provider/{CatalogProvider,StremioAddonProvider}.kt. The UI only ever talks to providers through
 * this interface and the normalised Content / HomeSection models — it never sees an addon's wire format.
 */
/** What one addon answered when asked for the streams of a title (shown on Select a Source so nothing fails silently). */
export type StreamLookup =
  | { kind: "ok"; count: number }
  | { kind: "none" } // it answered, with no streams for this title
  | { kind: "unsupported" } // its manifest says it doesn't provide streams (e.g. Cinemeta) — it isn't asked
  | { kind: "failed"; reason: string };

export interface StreamReport {
  addonName: string;
  streams: Stream[];
  lookup: StreamLookup;
}

export interface CatalogProvider {
  readonly id: string;
  readonly name: string;
  getHomeSections(): AsyncGenerator<HomeSection[], void, void>;
  getDetails(type: ContentType, id: string): Promise<Content | null>;
  getStreams(type: ContentType, id: string, season?: number | null, episode?: number | null): Promise<Stream[]>;
  /** Like getStreams, but says what happened (streams / none / not a stream addon / failed and why). Never throws. */
  getStreamReport(type: ContentType, id: string, season?: number | null, episode?: number | null): Promise<StreamReport>;
  /** The titles of one type, optionally only one genre (for the Movies / TV Shows genre drop-down). */
  getSectionsByType(type: ContentType, genre?: string): Promise<HomeSection[]>;
  getAvailableGenres(): Promise<string[]>;
  getGenreSection(genre: string): Promise<HomeSection | null>;
  /** `onPartial` is handed the merged matches so far each time one of the addon's catalogs answers, so a slow catalog does not hold up a fast one. */
  search(query: string, onPartial?: (items: Content[]) => void): Promise<Content[]>;
  getMoreItemsByType(type: ContentType, page: number, genre?: string): Promise<Content[]>;
  getMoreGenreItems(genre: string, page: number): Promise<Content[]>;
  /** Genres / directors / cast of one title (normalised), for the recommendation engine. Null when the addon has no metadata for it. Never throws. */
  getFeatures?(type: ContentType, id: string): Promise<Features | null>;
  /** True when the addon has catalogues of type "anime" (Anime tab). Absent on providers that never do. */
  readonly hasAnime?: boolean;
  /** The genres its anime catalogues list (read from the manifest, no request). */
  animeGenres?(): string[];
  /** The addon's anime titles, optionally one genre; `getMoreAnimeItems` reads the following pages. */
  getAnimeItems?(genre?: string): Promise<Content[]>;
  getMoreAnimeItems?(page: number, genre?: string): Promise<Content[]>;
  /** The streaming services (Netflix, Disney+ ...) the addon has catalogues for, read from the manifest with no request. */
  streamingServices?(): string[];
  /** One service's titles (movies and series together); `getMoreServiceItems` reads the following pages. */
  getServiceItems?(service: string): Promise<Content[]>;
  getMoreServiceItems?(page: number, service: string): Promise<Content[]>;
  /** True when the addon can be searched for anime (it has anime catalogues): Search then adds an anime-only line. */
  readonly hasAnimeSearch?: boolean;
  searchAnime?(query: string, onPartial?: (items: Content[]) => void): Promise<Content[]>;
  /** True when the addon has catalogues of type "tv" or "events" (Live TV tab). Absent on providers that never do. */
  readonly hasLiveTv?: boolean;
  /** The categories its live catalogues list (read from the manifest, no request). */
  liveGenres?(): string[];
  /** Which of "tv" / "events" its live catalogues cover (read from the manifest, no request). */
  liveTypes?(): LiveType[];
  /** The addon's channels (or events), optionally one category and one of the two types; `page` 0 is the first. */
  getLiveChannels?(options?: { genre?: string; type?: LiveType; page?: number }): Promise<LiveChannel[]>;
  /** Channels matching a search, from the live catalogues that can be searched; never throws. */
  searchLiveChannels?(query: string): Promise<LiveChannel[]>;
  /** A channel's name and picture from the addon, for when it is opened by address (not from the list); null when the addon doesn't know it. Never throws. */
  getLiveChannel?(channel: Pick<LiveChannel, "id" | "type">): Promise<LiveChannel | null>;
  /** What the addon offers to play for one channel; never throws. */
  getLiveStreamReport?(channel: Pick<LiveChannel, "id" | "type">): Promise<StreamReport>;
}

/** Set by Home before it fetches (account + day), so the rows draw the same pages and order all day and a different mix tomorrow. */
let varietySeed = "";
export const setHomeVarietySeed = (seed: string): void => {
  varietySeed = seed;
};
/** Chance of reading page 1, 2 or 3 (100 titles each) of a ranking today: mostly the top, sometimes deeper. New releases go stale faster, so only two pages. */
const PAGE_WEIGHTS = [5, 3, 2];
const NEW_PAGE_WEIGHTS = [6, 4];

const SUPPORTED_CATALOG_TYPES = new Set(["movie", "series"]);
/** The catalogue type anime addons use. Its titles are shown on the Anime tab, which only exists while an installed addon has such a catalogue. */
const ANIME_TYPE = "anime";
/** A catalogue the Anime tab can read: nothing is required of it except (at most) a genre. */
const isUsableAnimeCatalog = (catalog: AddonCatalogDef) => catalog.type === ANIME_TYPE && catalog.extra.every((extra) => !extra.isRequired || extra.name === "genre");
/** An anime catalogue that can be searched: it takes a "search" and asks for nothing else (a genre or paging is optional). */
const isSearchableAnimeCatalog = (catalog: AddonCatalogDef) => catalog.type === ANIME_TYPE && catalog.extra.some((e) => e.name === "search") && catalog.extra.every((e) => !e.isRequired || e.name === "search");
/** A live catalogue the Live TV tab can read: channels or events that ask for nothing but (at most) a category. */
const isUsableLiveCatalog = (catalog: AddonCatalogDef) => isLiveType(catalog.type) && catalog.extra.every((extra) => !extra.isRequired || extra.name === "genre");
/** A live catalogue that can be searched: it takes a "search" and asks for nothing else. */
const isSearchableLiveCatalog = (catalog: AddonCatalogDef) => isLiveType(catalog.type) && catalog.extra.some((e) => e.name === "search") && catalog.extra.every((e) => !e.isRequired || e.name === "search");
const IMDB_ID = /^tt\d+$/;
/** Id types anime addons use that put only the episode number after the id ("kitsu:7442:3"), not a season and an episode. */
const EPISODE_ONLY_IDS = /^(kitsu|mal|anilist|anidb):/;

/** Episode video ids learned from title details ("kitsu:7442:3"), by title id then "season:episode": a stream addon is asked for the episode by that id. */
const episodeVideoIds = new Map<string, Map<string, string>>();
function rememberEpisodeIds(content: Content): void {
  if (IMDB_ID.test(content.id)) return;
  const known = new Map<string, string>();
  for (const season of content.seasons) for (const episode of season.episodes) if (episode.id) known.set(`${episode.seasonNumber}:${episode.episodeNumber}`, episode.id);
  if (known.size > 0) episodeVideoIds.set(content.id, known);
}

/**
 * The id a stream addon is asked for an episode by. IMDb titles keep "tt:season:episode". Others use the episode's own video id from the
 * title's details when known (the Stremio rule), else for anime id types "id:episode", else "id:season:episode" as before.
 */
export function streamRequestId(id: string, season?: number | null, episode?: number | null): string {
  if (season == null || episode == null) return id;
  if (IMDB_ID.test(id)) return `${id}:${season}:${episode}`;
  const known = episodeVideoIds.get(id)?.get(`${season}:${episode}`);
  if (known) return known;
  return EPISODE_ONLY_IDS.test(id) ? `${id}:${episode}` : `${id}:${season}:${episode}`;
}
/** Safety ceiling against a pathological addon declaring hundreds of genres (not a curation mechanism). */
const MAX_GENRE_ROWS = 30;
/** Stremio's conventional catalog page size — `skip` is an item offset, not a page number. */
const PAGE_SIZE = 100;
/** Rows are fetched in small batches so the first rows appear fast and shared free addon servers aren't hammered. */
const HOME_BATCH_SIZE = 4;

/**
 * Ids are derived from the stream's link, so an addon that lists the same link twice would produce duplicate ids
 * (which break list keys and "play this exact source" lookups). The second and later copies get a stable "#n" suffix.
 */
export function uniqueStreamIds(streams: Stream[]): Stream[] {
  const seen = new Map<string, number>();
  return streams.map((stream) => {
    const n = seen.get(stream.id) ?? 0;
    seen.set(stream.id, n + 1);
    return n === 0 ? stream : { ...stream, id: `${stream.id}#${n}` };
  });
}

const isYear = (value: string): boolean => /^\d+$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100;
const genreExtra = (catalog: AddonCatalogDef) => catalog.extra.find((extra) => extra.name === "genre");
const isBaseCatalog = (catalog: AddonCatalogDef) => genreExtra(catalog)?.isRequired !== true;
/** A catalogue a service's page can read: it asks for nothing except (at most) a genre or a page. */
const isBrowsableCatalog = (catalog: AddonCatalogDef) => catalog.extra.every((extra) => !extra.isRequired || extra.name === "genre" || extra.name === "skip");
const stremioTypeOf = (type: ContentType) => (type === "TV_SHOW" ? "series" : "movie");

export class StremioAddonProvider implements CatalogProvider {
  readonly id: string;
  readonly name: string;
  private readonly supported: AddonCatalogDef[];
  private readonly animeCatalogs: AddonCatalogDef[];
  private readonly animeSearchCatalogs: AddonCatalogDef[];
  private readonly serviceCatalogs: Map<string, AddonCatalogDef[]>;
  private readonly liveCatalogs: AddonCatalogDef[];
  private readonly liveSearchCatalogs: AddonCatalogDef[];

  constructor(
    private readonly manifestUrl: string,
    private readonly manifest: AddonManifest,
  ) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.supported = manifest.catalogs.filter((catalog) => SUPPORTED_CATALOG_TYPES.has(catalog.type));
    this.animeCatalogs = manifest.catalogs.filter(isUsableAnimeCatalog);
    this.animeSearchCatalogs = manifest.catalogs.filter(isSearchableAnimeCatalog);
    this.serviceCatalogs = new Map();
    for (const catalog of this.supported.filter((c) => isBrowsableCatalog(c) && isBaseCatalog(c))) {
      const service = serviceOfCatalog(catalog);
      if (service) this.serviceCatalogs.set(service, [...(this.serviceCatalogs.get(service) ?? []), catalog]);
    }
    this.liveCatalogs = manifest.catalogs.filter(isUsableLiveCatalog);
    this.liveSearchCatalogs = manifest.catalogs.filter(isSearchableLiveCatalog);
  }

  get hasAnimeSearch(): boolean {
    return this.animeCatalogs.length > 0 || this.animeSearchCatalogs.length > 0;
  }

  /** Like `search`, for the anime catalogues: the addon's own search where a catalogue has one, else a title match over its ranked lists. */
  async searchAnime(query: string, onPartial?: (items: Content[]) => void): Promise<Content[]> {
    if (query.trim() === "") return [];
    if (this.animeSearchCatalogs.length > 0) {
      const perCatalog: Content[][] = this.animeSearchCatalogs.map(() => []);
      await Promise.all(
        this.animeSearchCatalogs.map(async (catalog, index) => {
          perCatalog[index] = await this.safeCatalog(catalog, { search: query });
          if (perCatalog[index]!.length > 0) onPartial?.(distinctBy(interleave(perCatalog), (c) => c.id));
        }),
      );
      const server = distinctBy(interleave(perCatalog), (c) => c.id);
      if (server.length > 0) return server;
    }
    const perBase = await Promise.all(this.animeCatalogs.filter(isBaseCatalog).map((catalog) => this.safeCatalog(catalog, {})));
    const needle = query.toLowerCase();
    return distinctBy(interleave(perBase), (c) => c.id).filter((c) => c.title.toLowerCase().includes(needle));
  }

  get hasAnime(): boolean {
    return this.animeCatalogs.length > 0;
  }

  animeGenres(): string[] {
    return this.declaredGenres(this.animeCatalogs);
  }

  /** The anime catalogues for the Anime tab: the ones that need nothing (the ranked lists) or, for a chosen genre, the ones that list that genre. */
  private animeCatalogsFor(genre?: string): AddonCatalogDef[] {
    return genre ? this.animeCatalogs.filter((catalog) => (genreExtra(catalog)?.options ?? []).includes(genre)) : this.animeCatalogs.filter(isBaseCatalog);
  }

  async getAnimeItems(genre?: string): Promise<Content[]> {
    const catalogs = this.animeCatalogsFor(genre);
    const perCatalog = await Promise.all(catalogs.map((catalog) => this.safeCatalog(catalog, genre ? { genre } : {})));
    return distinctBy(interleave(perCatalog), (c) => c.id);
  }

  async getMoreAnimeItems(page: number, genre?: string): Promise<Content[]> {
    const catalogs = this.animeCatalogsFor(genre);
    return catalogs.length === 0 ? [] : this.fetchPage(catalogs, genre ? { genre } : {}, page);
  }

  streamingServices(): string[] {
    return [...this.serviceCatalogs.keys()];
  }

  async getServiceItems(service: string): Promise<Content[]> {
    const catalogs = this.serviceCatalogs.get(service) ?? [];
    const perCatalog = await Promise.all(catalogs.map((catalog) => this.safeCatalog(catalog, {})));
    return distinctBy(interleave(perCatalog), (c) => c.id);
  }

  async getMoreServiceItems(page: number, service: string): Promise<Content[]> {
    // Only a catalogue that declares "skip" has more pages (the Streaming Catalogs addon's take no extras at all: its one page is all there is).
    const catalogs = (this.serviceCatalogs.get(service) ?? []).filter((catalog) => catalog.extra.some((extra) => extra.name === "skip"));
    return catalogs.length === 0 ? [] : this.fetchPage(catalogs, {}, page);
  }

  get hasLiveTv(): boolean {
    return this.liveCatalogs.length > 0 || this.liveSearchCatalogs.length > 0;
  }

  liveGenres(): string[] {
    return this.declaredGenres(this.liveCatalogs);
  }

  liveTypes(): LiveType[] {
    return [...new Set([...this.liveCatalogs, ...this.liveSearchCatalogs].map((c) => c.type).filter(isLiveType))];
  }

  /** The live catalogues to read: the ranked / all-channels ones, or for a chosen category the ones that list it; optionally only channels or only events. */
  private liveCatalogsFor(genre: string | undefined, type: LiveType | undefined): AddonCatalogDef[] {
    const byType = this.liveCatalogs.filter((catalog) => !type || catalog.type === type);
    return genre ? byType.filter((catalog) => (genreExtra(catalog)?.options ?? []).includes(genre)) : byType.filter(isBaseCatalog);
  }

  private async safeLiveCatalog(catalog: AddonCatalogDef, extra: Record<string, string>): Promise<LiveChannel[]> {
    try {
      const type = catalog.type as LiveType;
      return (await fetchCatalog(this.manifestUrl, catalog.type, catalog.id, extra)).map((meta) => previewToChannel(meta, type, this.id, this.name));
    } catch {
      return [];
    }
  }

  async getLiveChannels(options: { genre?: string; type?: LiveType; page?: number } = {}): Promise<LiveChannel[]> {
    const catalogs = this.liveCatalogsFor(options.genre, options.type);
    const page = options.page ?? 0;
    const extra: Record<string, string> = options.genre ? { genre: options.genre } : {};
    const canPage = (catalog: AddonCatalogDef) => catalog.extra.some((e) => e.name === "skip");
    // a catalogue that cannot page has nothing on page 2 (asked again it would repeat page 1)
    const readable = page > 0 ? catalogs.filter(canPage) : catalogs;
    const perCatalog = await Promise.all(readable.map((catalog) => this.safeLiveCatalog(catalog, page > 0 ? { ...extra, skip: String(page * PAGE_SIZE) } : extra)));
    return distinctBy(interleave(perCatalog), (c) => `${c.type}:${c.id}`);
  }

  async searchLiveChannels(query: string): Promise<LiveChannel[]> {
    if (query.trim() === "") return [];
    const perCatalog = await Promise.all(this.liveSearchCatalogs.map((catalog) => this.safeLiveCatalog(catalog, { search: query })));
    const found = distinctBy(interleave(perCatalog), (c) => `${c.type}:${c.id}`);
    if (found.length > 0 || this.liveSearchCatalogs.length > 0) return found;
    // no catalogue can be searched: match names in the ranked lists instead
    const needle = query.toLowerCase();
    const all = await this.getLiveChannels();
    return all.filter((c) => c.name.toLowerCase().includes(needle));
  }

  async getLiveChannel(channel: Pick<LiveChannel, "id" | "type">): Promise<LiveChannel | null> {
    try {
      const meta = await fetchMeta(this.manifestUrl, channel.type, channel.id);
      return meta && meta.name ? previewToChannel(meta, channel.type, this.id, this.name) : null;
    } catch {
      return null;
    }
  }

  async getLiveStreamReport(channel: Pick<LiveChannel, "id" | "type">): Promise<StreamReport> {
    const addonName = this.name;
    if (!this.offersStreams()) return { addonName, streams: [], lookup: { kind: "unsupported" } };
    try {
      const streams = uniqueStreamIds((await fetchStreams(this.manifestUrl, channel.type, channel.id)).map((stream) => streamToStream(stream, this.id, this.name)));
      return { addonName, streams, lookup: streams.length > 0 ? { kind: "ok", count: streams.length } : { kind: "none" } };
    } catch (error) {
      if (error instanceof AddonHttpError && error.status === 404) return { addonName, streams: [], lookup: { kind: "none" } };
      return { addonName, streams: [], lookup: { kind: "failed", reason: describeAddonError(error) } };
    }
  }

  /** Types an addon declares for a resource: the resource's own list when it has one, else the manifest's. */
  private declaredTypes(resource: "meta" | "stream"): string[] {
    for (const r of this.manifest.resources) {
      if (r && typeof r === "object" && (r as { name?: unknown }).name === resource) {
        const types = (r as { types?: unknown }).types;
        if (Array.isArray(types)) return types.filter((t): t is string => typeof t === "string");
      }
    }
    return this.manifest.types;
  }

  /** "series" or "movie" as before; but a show asked of an addon that only declares "anime" for that resource is asked as "anime". */
  private stremioTypeFor(resource: "meta" | "stream", type: ContentType): string {
    const base = stremioTypeOf(type);
    if (type !== "TV_SHOW") return base;
    const declared = this.declaredTypes(resource);
    return declared.length > 0 && !declared.includes(base) && declared.includes(ANIME_TYPE) ? ANIME_TYPE : base;
  }

  /** Cinemeta's shape: a Popular ("top"), a New ("year", filtered by year) and a Top rated ("imdbRating") ranking, for movies and series. */
  private get isRankedStyle(): boolean {
    const ids = new Set(this.supported.map((c) => c.id));
    return ids.has("top") && ids.has("year") && ids.has("imdbRating");
  }

  /**
   * Home for a Cinemeta-style addon: Popular, then New, then Top rated (each movies and series together, drawn from a different page each day
   * and gently reshuffled, see homeVariety.ts), then only the genres with wide appeal. Other addons keep the one-merged-row-plus-every-genre layout.
   */
  private async *rankedHomeSections(): AsyncGenerator<HomeSection[], void, void> {
    const byId = (id: string) => this.supported.filter((c) => c.id === id);
    const fetches: Array<() => Promise<HomeSection | null>> = [];
    const top = byId("top");
    fetches.push(() => this.fetchVariedSection(top, top.map((c) => c.name).find((n): n is string => !!n) ?? "Popular", {}, "base", PAGE_WEIGHTS));
    const yearCatalogs = byId("year");
    const years = [...new Set(yearCatalogs.flatMap((c) => genreExtra(c)?.options ?? []).filter(isYear))];
    const thisYear = String(new Date().getFullYear());
    const year = years.includes(thisYear) ? thisYear : years[0];
    if (year) fetches.push(() => this.fetchVariedSection(yearCatalogs, "New", { genre: year }, "new", NEW_PAGE_WEIGHTS));
    fetches.push(() => this.fetchVariedSection(byId("imdbRating"), "Top rated", {}, "toprated", PAGE_WEIGHTS));
    const declared = this.declaredGenres(this.supported).filter((g) => !isYear(g));
    for (const genre of homeGenresFor(declared)) {
      const catalogs = this.supported.filter((catalog) => (genreExtra(catalog)?.options ?? []).includes(genre));
      fetches.push(() => this.fetchVariedSection(catalogs, genre, { genre }, genre, PAGE_WEIGHTS));
    }
    for (let i = 0; i < fetches.length; i += HOME_BATCH_SIZE) {
      const batch = await Promise.all(fetches.slice(i, i + HOME_BATCH_SIZE).map((fetchRow) => fetchRow()));
      const ready = batch.filter((section): section is HomeSection => section !== null);
      if (ready.length > 0) yield ready;
    }
  }

  async *getHomeSections(): AsyncGenerator<HomeSection[], void, void> {
    if (this.isRankedStyle) {
      yield* this.rankedHomeSections();
      return;
    }
    const baseCatalogs = this.supported.filter(isBaseCatalog);
    const fetches: Array<() => Promise<HomeSection | null>> = [];
    if (baseCatalogs.length > 0) {
      // Prefer the catalog's own declared name ("Popular") over the addon's — it also lets the row rank first.
      const title = baseCatalogs.map((c) => c.name).find((n): n is string => !!n) ?? this.manifest.name;
      fetches.push(() => this.fetchMergedSection(baseCatalogs, title, {}, "base"));
    }
    for (const genre of this.declaredGenres(this.supported)) {
      const catalogs = this.supported.filter((catalog) => (genreExtra(catalog)?.options ?? []).includes(genre));
      fetches.push(() => this.fetchMergedSection(catalogs, genre, { genre }, genre));
    }
    for (let i = 0; i < fetches.length; i += HOME_BATCH_SIZE) {
      const batch = await Promise.all(fetches.slice(i, i + HOME_BATCH_SIZE).map((fetchRow) => fetchRow()));
      const ready = batch.filter((section): section is HomeSection => section !== null);
      if (ready.length > 0) yield ready;
    }
  }

  async getSectionsByType(type: ContentType, genre?: string): Promise<HomeSection[]> {
    const stremioType = stremioTypeOf(type);
    if (genre) {
      const catalogs = this.catalogsMatchingGenre(genre).filter((c) => c.type === stremioType);
      if (catalogs.length === 0) return [];
      const section = await this.fetchMergedSection(catalogs, genre, { genre }, `${stremioType}_genre_${genre}`);
      return section ? [section] : [];
    }
    const baseCatalogs = this.supported.filter((c) => c.type === stremioType).filter(isBaseCatalog);
    if (baseCatalogs.length === 0) return [];
    const title = baseCatalogs.map((c) => c.name).find((n): n is string => !!n) ?? this.manifest.name;
    const section = await this.fetchMergedSection(baseCatalogs, title, {}, `${stremioType}_base`);
    return section ? [section] : [];
  }

  async getAvailableGenres(): Promise<string[]> {
    return this.declaredGenres(this.supported);
  }

  async getGenreSection(genre: string): Promise<HomeSection | null> {
    return this.fetchMergedSection(this.catalogsMatchingGenre(genre), genre, { genre }, `genre_${genre}`);
  }

  async getMoreItemsByType(type: ContentType, page: number, genre?: string): Promise<Content[]> {
    const stremioType = stremioTypeOf(type);
    if (genre) {
      const catalogs = this.catalogsMatchingGenre(genre).filter((c) => c.type === stremioType);
      return catalogs.length === 0 ? [] : this.fetchPage(catalogs, { genre }, page);
    }
    const baseCatalogs = this.supported.filter((c) => c.type === stremioType).filter(isBaseCatalog);
    return baseCatalogs.length === 0 ? [] : this.fetchPage(baseCatalogs, {}, page);
  }

  async getMoreGenreItems(genre: string, page: number): Promise<Content[]> {
    const catalogs = this.catalogsMatchingGenre(genre);
    return catalogs.length === 0 ? [] : this.fetchPage(catalogs, { genre }, page);
  }

  /**
   * Hybrid: real server-side search for any catalog that declares a "search" extra (interleaved + deduped like any
   * merged row), falling back to a client-side title match over the base catalogs when nothing supports search or
   * the search came back empty.
   */
  async search(query: string, onPartial?: (items: Content[]) => void): Promise<Content[]> {
    if (query.trim() === "") return [];
    const searchable = this.supported.filter((catalog) => catalog.extra.some((extra) => extra.name === "search"));
    if (searchable.length > 0) {
      const perCatalog: Content[][] = searchable.map(() => []);
      await Promise.all(
        searchable.map(async (catalog, index) => {
          perCatalog[index] = await this.safeCatalog(catalog, { search: query });
          if (perCatalog[index]!.length > 0) onPartial?.(distinctBy(interleave(perCatalog), (c) => c.id));
        }),
      );
      const server = distinctBy(interleave(perCatalog), (c) => c.id);
      if (server.length > 0) return server;
    }
    const perBase = await Promise.all(this.supported.filter(isBaseCatalog).map((catalog) => this.safeCatalog(catalog, {})));
    const needle = query.toLowerCase();
    return distinctBy(interleave(perBase), (c) => c.id).filter((c) => c.title.toLowerCase().includes(needle));
  }

  async getFeatures(type: ContentType, id: string): Promise<Features | null> {
    try {
      const meta = await fetchMeta(this.manifestUrl, this.stremioTypeFor("meta", type), id);
      return meta ? featuresFromMeta(meta) : null;
    } catch {
      return null;
    }
  }

  async getDetails(type: ContentType, id: string): Promise<Content | null> {
    try {
      const meta = await fetchMeta(this.manifestUrl, this.stremioTypeFor("meta", type), id);
      if (!meta) return null;
      const content = metaToContent(meta, this.id);
      rememberEpisodeIds(content);
      return content;
    } catch {
      return null;
    }
  }

  async getStreams(type: ContentType, id: string, season?: number | null, episode?: number | null): Promise<Stream[]> {
    return (await this.getStreamReport(type, id, season, episode)).streams;
  }

  /** A manifest that lists its resources without "stream" (Cinemeta: catalog + meta) has nothing to ask; an undeclared list is asked anyway, like the TV app does. */
  private offersStreams(): boolean {
    const resources = this.manifest.resources;
    if (!Array.isArray(resources) || resources.length === 0) return true;
    return resources.some((r) => (typeof r === "string" ? r : (r as { name?: unknown } | null)?.name) === "stream");
  }

  async getStreamReport(type: ContentType, id: string, season?: number | null, episode?: number | null): Promise<StreamReport> {
    const addonName = this.name;
    if (!this.offersStreams()) return { addonName, streams: [], lookup: { kind: "unsupported" } };
    const requestId = streamRequestId(id, season, episode);
    try {
      const streams = uniqueStreamIds((await fetchStreams(this.manifestUrl, this.stremioTypeFor("stream", type), requestId)).map((stream) => streamToStream(stream, this.id, this.name)));
      return { addonName, streams, lookup: streams.length > 0 ? { kind: "ok", count: streams.length } : { kind: "none" } };
    } catch (error) {
      if (error instanceof AddonHttpError && error.status === 404) return { addonName, streams: [], lookup: { kind: "none" } }; // "I don't know this id"
      return { addonName, streams: [], lookup: { kind: "failed", reason: describeAddonError(error) } };
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async safeCatalog(catalog: AddonCatalogDef, extra: Record<string, string>): Promise<Content[]> {
    try {
      return (await fetchCatalog(this.manifestUrl, catalog.type, catalog.id, extra)).map((meta) => previewToContent(meta, this.id));
    } catch {
      return [];
    }
  }

  /**
   * Some addons declare year filters ("2026", "2025", …) under the same "genre" extra as real genre names, and the
   * picker extends that range further back — so for a year, "does this catalog support year filtering at all" is the
   * match. Plain genre names are an exact match.
   */
  private catalogsMatchingGenre(genre: string): AddonCatalogDef[] {
    return this.supported.filter((catalog) => {
      const options = genreExtra(catalog)?.options ?? [];
      return isYear(genre) ? options.some(isYear) : options.includes(genre);
    });
  }

  private declaredGenres(catalogs: AddonCatalogDef[]): string[] {
    const all = catalogs.flatMap((catalog) => genreExtra(catalog)?.options ?? []);
    return [...new Set(all)].slice(0, MAX_GENRE_ROWS);
  }

  private async fetchPage(catalogs: AddonCatalogDef[], extra: Record<string, string>, page: number): Promise<Content[]> {
    const paged = { ...extra, skip: String(page * PAGE_SIZE) };
    const perCatalog = await Promise.all(catalogs.map((catalog) => this.safeCatalog(catalog, paged)));
    return interleave(perCatalog);
  }

  /**
   * A Home row that reads today's page of its ranking (not always the first) and shuffles gently within it. Falls back to the first page if the
   * chosen one is empty. Pages are only asked of catalogs that declare "skip".
   */
  private async fetchVariedSection(catalogs: AddonCatalogDef[], title: string, extra: Record<string, string>, rowKey: string, weights: readonly number[]): Promise<HomeSection | null> {
    if (catalogs.length === 0) return null;
    const read = async (page: number) => {
      const perCatalog = await Promise.all(
        catalogs.map((catalog) => this.safeCatalog(catalog, page > 0 && catalog.extra.some((e) => e.name === "skip") ? { ...extra, skip: String(page * PAGE_SIZE) } : extra)),
      );
      return distinctBy(interleave(perCatalog), (c) => c.id);
    };
    const page = pickPage(varietySeed, `${this.manifest.id}_${rowKey}`, weights);
    let items = await read(page);
    if (items.length === 0 && page > 0) items = await read(0);
    if (items.length === 0) return null;
    return { id: `${this.manifest.id}_${rowKey}`, title, items: varyOrder(items, varietySeed, `${this.manifest.id}_${rowKey}`), style: "STANDARD" };
  }

  /** Fetches every matched catalog in parallel and interleaves (movie[0], series[0], …) so a merged row reads as mixed content. */
  private async fetchMergedSection(catalogs: AddonCatalogDef[], title: string, extra: Record<string, string>, rowKey: string): Promise<HomeSection | null> {
    const perCatalog = await Promise.all(catalogs.map((catalog) => this.safeCatalog(catalog, extra)));
    const items = distinctBy(interleave(perCatalog), (c) => c.id);
    return items.length === 0 ? null : { id: `${this.manifest.id}_${rowKey}`, title, items, style: "STANDARD" };
  }
}
