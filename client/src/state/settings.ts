import { create } from "zustand";
import { DEFAULT_HOME_ROW_PREFERENCES, DEFAULT_PLAYER_PREFERENCES, type HomeRowPreferences, type PlayerPreferences } from "../domain/types";
import { isServiceRowId, withServiceOrder } from "../domain/streamingServices";
import { api, ApiClientError } from "../lib/api";
import { isoMs, monotonicIso } from "../lib/iso";
import { globalKey, Outbox, readJson, writeJson } from "./persist";
import { libraryKey, libraryName } from "./profile";

/** Wire shape of GET/PUT /user/settings (one row per account). */
interface SettingsDto {
  homeRowOrder: string[];
  hiddenRowIds: string[];
  autoplayNextEpisode: boolean;
  skipIntroEnabled: boolean;
  subtitlesEnabled: boolean;
  defaultSubtitleLanguage: string | null;
  /** Absent from a backend that predates it. */
  defaultAudioLanguage?: string | null;
  /** Genres the person never wants to see, kept on the account so every device agrees. Absent from a backend that predates it. */
  blockedGenres?: string[];
  /** When Reset stats was last pressed (Your stats then counts only what was watched after it); null counts everything. Absent from a backend that predates it. */
  statsResetAt?: string | null;
  updatedAt: string | null;
}

interface SettingsState {
  userId: string | null;
  homeRows: HomeRowPreferences;
  player: PlayerPreferences;
  /** Blocked genres of the signed-in account (see useBlockedGenres, which is what the UI reads). */
  blockedGenres: string[];
  /** When Your stats was last reset (ISO time), or null if never. Synced on the account, per profile; it only ever moves forward. */
  statsResetAt: string | null;
  /** Local mutation time of the last change (or the server's, after a pull). */
  updatedAt: string | null;
  /** UI sounds are device-local — they are not part of the synced account settings. Off by default on the web (volume 0); turn them up in Settings → Sounds. */
  navigationVolume: number;
  hydrate(userId: string): void;
  reset(): void;
  setRowHidden(rowId: string, hidden: boolean): void;
  setRowOrder(order: string[]): void;
  /** The order of the streaming-service tiles (kept in the same list as the rows' order, as `streaming:<id>`). */
  setServiceOrder(services: string[]): void;
  setPlayer(patch: Partial<PlayerPreferences>): void;
  setBlockedGenres(genres: string[]): void;
  /** Starts Your stats again from this time (now, for the Reset stats button). There is no way back: it only ever moves forward. */
  setStatsResetAt(at: string): void;
  setNavigationVolume(volume: number): void;
  pull(): Promise<{ ok: boolean; empty: boolean }>;
  retryPending(): Promise<void>;
}

const SOUND_KEY = globalKey("sound");
let outbox: Outbox<SettingsDto> | null = null;
const PENDING = "settings";

/** Where a person who was not signed in kept their blocked genres (see state/blockedGenres.ts). */
const GUEST_BLOCKED_KEY = globalKey("blockedGenres");

/** The later of two times (null and missing count as none). */
export function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return isoMs(b) > isoMs(a) ? b : a;
}

function toDto(state: Pick<SettingsState, "homeRows" | "player" | "blockedGenres" | "statsResetAt">, updatedAt: string): SettingsDto {
  return {
    homeRowOrder: state.homeRows.order,
    hiddenRowIds: state.homeRows.hiddenRowIds,
    autoplayNextEpisode: state.player.autoplayNextEpisode,
    skipIntroEnabled: state.player.skipIntroEnabled,
    subtitlesEnabled: state.player.subtitlesEnabled,
    defaultSubtitleLanguage: state.player.defaultSubtitleLanguage,
    defaultAudioLanguage: state.player.defaultAudioLanguage,
    blockedGenres: state.blockedGenres,
    statsResetAt: state.statsResetAt,
    updatedAt,
  };
}

export const useSettings = create<SettingsState>((set, get) => {
  const persistLocal = () => {
    const { userId, homeRows, player, blockedGenres, statsResetAt, updatedAt } = get();
    if (userId) writeJson(libraryKey(userId, "settings"), { homeRows, player, blockedGenres, statsResetAt, updatedAt });
  };

  function apply(dto: SettingsDto) {
    set({
      homeRows: { order: dto.homeRowOrder, hiddenRowIds: dto.hiddenRowIds },
      player: {
        autoplayNextEpisode: dto.autoplayNextEpisode,
        skipIntroEnabled: dto.skipIntroEnabled,
        subtitlesEnabled: dto.subtitlesEnabled,
        defaultSubtitleLanguage: dto.defaultSubtitleLanguage,
        defaultAudioLanguage: dto.defaultAudioLanguage === undefined ? get().player.defaultAudioLanguage : dto.defaultAudioLanguage,
      },
      // a backend that doesn't know the field leaves what is here alone
      blockedGenres: dto.blockedGenres ?? get().blockedGenres,
      // a reset is final: whichever is later, this device's or the account's, stands (a null or an older one never undoes it)
      statsResetAt: laterIso(get().statsResetAt, dto.statsResetAt),
      updatedAt: dto.updatedAt,
    });
    persistLocal();
  }

  async function push(body: SettingsDto) {
    try {
      const response = await api<SettingsDto>("/user/settings", { method: "PUT", body });
      // the server answers with the authoritative row (ours if it won, otherwise the newer one)
      apply(response.updatedAt ? response : body);
      outbox?.remove(PENDING);
    } catch {
      outbox?.put(PENDING, body);
    }
  }

  function changed() {
    const updatedAt = monotonicIso("settings");
    set({ updatedAt });
    persistLocal();
    void push(toDto(get(), updatedAt));
  }

  return {
    userId: null,
    homeRows: DEFAULT_HOME_ROW_PREFERENCES,
    player: DEFAULT_PLAYER_PREFERENCES,
    blockedGenres: [],
    statsResetAt: null,
    updatedAt: null,
    navigationVolume: readJson<{ navigationVolume: number }>(SOUND_KEY, { navigationVolume: 0 }).navigationVolume,

    hydrate(userId) {
      outbox = new Outbox<SettingsDto>(userId, libraryName("settings"));
      const stored = readJson<{ homeRows: HomeRowPreferences; player: PlayerPreferences; blockedGenres?: string[]; statsResetAt?: string | null; updatedAt: string | null } | null>(libraryKey(userId, "settings"), null);
      set({ userId, homeRows: stored?.homeRows ?? DEFAULT_HOME_ROW_PREFERENCES, player: { ...DEFAULT_PLAYER_PREFERENCES, ...(stored?.player ?? {}) }, blockedGenres: stored?.blockedGenres ?? [], statsResetAt: stored?.statsResetAt ?? null, updatedAt: stored?.updatedAt ?? null });
    },
    reset() {
      outbox = null;
      set({ userId: null, homeRows: DEFAULT_HOME_ROW_PREFERENCES, player: DEFAULT_PLAYER_PREFERENCES, blockedGenres: [], statsResetAt: null, updatedAt: null });
    },

    setRowHidden(rowId, hidden) {
      const { hiddenRowIds } = get().homeRows;
      const next = hidden ? [...new Set([...hiddenRowIds, rowId])] : hiddenRowIds.filter((id) => id !== rowId);
      set({ homeRows: { ...get().homeRows, hiddenRowIds: next } });
      changed();
    },
    setRowOrder(order) {
      // the rows' order never drops the streaming tiles' place in the same list
      const services = get().homeRows.order.filter(isServiceRowId);
      set({ homeRows: { ...get().homeRows, order: [...order.filter((id) => !isServiceRowId(id)), ...services] } });
      changed();
    },
    setServiceOrder(services) {
      set({ homeRows: { ...get().homeRows, order: withServiceOrder(get().homeRows.order, services) } });
      changed();
    },
    setPlayer(patch) {
      set({ player: { ...get().player, ...patch } });
      changed();
    },
    setBlockedGenres(genres) {
      set({ blockedGenres: genres });
      changed();
    },
    setStatsResetAt(at) {
      set({ statsResetAt: laterIso(get().statsResetAt, at) });
      changed();
    },
    setNavigationVolume(volume) {
      const navigationVolume = Math.min(1, Math.max(0, volume));
      set({ navigationVolume });
      writeJson(SOUND_KEY, { navigationVolume });
    },

    async pull() {
      try {
        const dto = await api<SettingsDto>("/user/settings");
        // A local change that hasn't reached the server yet wins until retryPending() lands it.
        if (!outbox?.all()[PENDING] && isoMs(dto.updatedAt) >= isoMs(get().updatedAt)) apply(dto);
        // An account that has never saved settings adopts the genres this browser had blocked before it signed in, once.
        if (dto.updatedAt === null && get().blockedGenres.length === 0) {
          const before = readJson<string[]>(GUEST_BLOCKED_KEY, []);
          if (before.length > 0) get().setBlockedGenres(before);
        }
        return { ok: true, empty: dto.updatedAt === null };
      } catch {
        return { ok: false, empty: false };
      }
    },

    async retryPending() {
      const body = outbox?.all()[PENDING];
      if (!body) return;
      try {
        const response = await api<SettingsDto>("/user/settings", { method: "PUT", body });
        apply(response.updatedAt ? response : body);
        outbox?.remove(PENDING);
      } catch (error) {
        if (error instanceof ApiClientError && (error.status === 401 || error.isNetwork)) return;
      }
    },
  };
});
