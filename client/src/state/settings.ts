import { create } from "zustand";
import { DEFAULT_HOME_ROW_PREFERENCES, DEFAULT_PLAYER_PREFERENCES, type HomeRowPreferences, type PlayerPreferences } from "../domain/types";
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
  /** Genres the person never wants to see, kept on the account so every device agrees. Absent from a backend that predates it. */
  blockedGenres?: string[];
  updatedAt: string | null;
}

interface SettingsState {
  userId: string | null;
  homeRows: HomeRowPreferences;
  player: PlayerPreferences;
  /** Blocked genres of the signed-in account (see useBlockedGenres, which is what the UI reads). */
  blockedGenres: string[];
  /** Local mutation time of the last change (or the server's, after a pull). */
  updatedAt: string | null;
  /** UI sounds are device-local — they are not part of the synced account settings. Off by default on the web (volume 0); turn them up in Settings → Sounds. */
  navigationVolume: number;
  hydrate(userId: string): void;
  reset(): void;
  setRowHidden(rowId: string, hidden: boolean): void;
  setRowOrder(order: string[]): void;
  setPlayer(patch: Partial<PlayerPreferences>): void;
  setBlockedGenres(genres: string[]): void;
  setNavigationVolume(volume: number): void;
  pull(): Promise<{ ok: boolean; empty: boolean }>;
  retryPending(): Promise<void>;
}

const SOUND_KEY = globalKey("sound");
let outbox: Outbox<SettingsDto> | null = null;
const PENDING = "settings";

/** Where a person who was not signed in kept their blocked genres (see state/blockedGenres.ts). */
const GUEST_BLOCKED_KEY = globalKey("blockedGenres");

function toDto(state: Pick<SettingsState, "homeRows" | "player" | "blockedGenres">, updatedAt: string): SettingsDto {
  return {
    homeRowOrder: state.homeRows.order,
    hiddenRowIds: state.homeRows.hiddenRowIds,
    autoplayNextEpisode: state.player.autoplayNextEpisode,
    skipIntroEnabled: state.player.skipIntroEnabled,
    subtitlesEnabled: state.player.subtitlesEnabled,
    defaultSubtitleLanguage: state.player.defaultSubtitleLanguage,
    blockedGenres: state.blockedGenres,
    updatedAt,
  };
}

export const useSettings = create<SettingsState>((set, get) => {
  const persistLocal = () => {
    const { userId, homeRows, player, blockedGenres, updatedAt } = get();
    if (userId) writeJson(libraryKey(userId, "settings"), { homeRows, player, blockedGenres, updatedAt });
  };

  function apply(dto: SettingsDto) {
    set({
      homeRows: { order: dto.homeRowOrder, hiddenRowIds: dto.hiddenRowIds },
      player: {
        autoplayNextEpisode: dto.autoplayNextEpisode,
        skipIntroEnabled: dto.skipIntroEnabled,
        subtitlesEnabled: dto.subtitlesEnabled,
        defaultSubtitleLanguage: dto.defaultSubtitleLanguage,
      },
      // a backend that doesn't know the field leaves what is here alone
      blockedGenres: dto.blockedGenres ?? get().blockedGenres,
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
    updatedAt: null,
    navigationVolume: readJson<{ navigationVolume: number }>(SOUND_KEY, { navigationVolume: 0 }).navigationVolume,

    hydrate(userId) {
      outbox = new Outbox<SettingsDto>(userId, libraryName("settings"));
      const stored = readJson<{ homeRows: HomeRowPreferences; player: PlayerPreferences; blockedGenres?: string[]; updatedAt: string | null } | null>(libraryKey(userId, "settings"), null);
      set({ userId, homeRows: stored?.homeRows ?? DEFAULT_HOME_ROW_PREFERENCES, player: { ...DEFAULT_PLAYER_PREFERENCES, ...(stored?.player ?? {}) }, blockedGenres: stored?.blockedGenres ?? [], updatedAt: stored?.updatedAt ?? null });
    },
    reset() {
      outbox = null;
      set({ userId: null, homeRows: DEFAULT_HOME_ROW_PREFERENCES, player: DEFAULT_PLAYER_PREFERENCES, blockedGenres: [], updatedAt: null });
    },

    setRowHidden(rowId, hidden) {
      const { hiddenRowIds } = get().homeRows;
      const next = hidden ? [...new Set([...hiddenRowIds, rowId])] : hiddenRowIds.filter((id) => id !== rowId);
      set({ homeRows: { ...get().homeRows, hiddenRowIds: next } });
      changed();
    },
    setRowOrder(order) {
      set({ homeRows: { ...get().homeRows, order } });
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
