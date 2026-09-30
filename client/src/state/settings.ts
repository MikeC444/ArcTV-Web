import { create } from "zustand";
import { DEFAULT_HOME_ROW_PREFERENCES, DEFAULT_PLAYER_PREFERENCES, type HomeRowPreferences, type PlayerPreferences } from "../domain/types";
import { api, ApiClientError } from "../lib/api";
import { isoMs, monotonicIso } from "../lib/iso";
import { globalKey, Outbox, readJson, userKey, writeJson } from "./persist";

/** Wire shape of GET/PUT /user/settings (one row per account). */
interface SettingsDto {
  homeRowOrder: string[];
  hiddenRowIds: string[];
  autoplayNextEpisode: boolean;
  skipIntroEnabled: boolean;
  subtitlesEnabled: boolean;
  defaultSubtitleLanguage: string | null;
  updatedAt: string | null;
}

interface SettingsState {
  userId: string | null;
  homeRows: HomeRowPreferences;
  player: PlayerPreferences;
  /** Local mutation time of the last change (or the server's, after a pull). */
  updatedAt: string | null;
  /** UI sounds are device-local — they are not part of the synced account settings. */
  navigationVolume: number;
  hydrate(userId: string): void;
  reset(): void;
  setRowHidden(rowId: string, hidden: boolean): void;
  setRowOrder(order: string[]): void;
  setPlayer(patch: Partial<PlayerPreferences>): void;
  setNavigationVolume(volume: number): void;
  pull(): Promise<{ ok: boolean; empty: boolean }>;
  retryPending(): Promise<void>;
}

const SOUND_KEY = globalKey("sound");
let outbox: Outbox<SettingsDto> | null = null;
const PENDING = "settings";

function toDto(state: Pick<SettingsState, "homeRows" | "player">, updatedAt: string): SettingsDto {
  return {
    homeRowOrder: state.homeRows.order,
    hiddenRowIds: state.homeRows.hiddenRowIds,
    autoplayNextEpisode: state.player.autoplayNextEpisode,
    skipIntroEnabled: state.player.skipIntroEnabled,
    subtitlesEnabled: state.player.subtitlesEnabled,
    defaultSubtitleLanguage: state.player.defaultSubtitleLanguage,
    updatedAt,
  };
}

export const useSettings = create<SettingsState>((set, get) => {
  const persistLocal = () => {
    const { userId, homeRows, player, updatedAt } = get();
    if (userId) writeJson(userKey(userId, "settings"), { homeRows, player, updatedAt });
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
    updatedAt: null,
    navigationVolume: readJson<{ navigationVolume: number }>(SOUND_KEY, { navigationVolume: 0.5 }).navigationVolume,

    hydrate(userId) {
      outbox = new Outbox<SettingsDto>(userId, "settings");
      const stored = readJson<{ homeRows: HomeRowPreferences; player: PlayerPreferences; updatedAt: string | null } | null>(userKey(userId, "settings"), null);
      set({ userId, homeRows: stored?.homeRows ?? DEFAULT_HOME_ROW_PREFERENCES, player: { ...DEFAULT_PLAYER_PREFERENCES, ...(stored?.player ?? {}) }, updatedAt: stored?.updatedAt ?? null });
    },
    reset() {
      outbox = null;
      set({ userId: null, homeRows: DEFAULT_HOME_ROW_PREFERENCES, player: DEFAULT_PLAYER_PREFERENCES, updatedAt: null });
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
