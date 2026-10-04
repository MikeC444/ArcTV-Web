import { globalKey, readJson, writeJson } from "./persist";

/**
 * What the video player remembers between titles, on this device only (not part of the synced account settings: a TV and a laptop
 * want different volumes). Anything unreadable falls back to the defaults.
 */
export interface PlayerPrefs {
  /** 0 – 1. */
  volume: number;
  /** Playback speed, 1 = normal. */
  speed: number;
  /** The right-hand time shows what is left (true) or the total length (false). */
  showRemaining: boolean;
}

export const DEFAULT_PLAYER_PREFS: PlayerPrefs = { volume: 1, speed: 1, showRemaining: true };
const KEY = globalKey("playerPrefs");

const number = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;

export function readPlayerPrefs(): PlayerPrefs {
  const stored = readJson<Partial<PlayerPrefs> | null>(KEY, null);
  return {
    volume: number(stored?.volume, 0, 1, DEFAULT_PLAYER_PREFS.volume),
    speed: number(stored?.speed, 0.25, 4, DEFAULT_PLAYER_PREFS.speed),
    showRemaining: typeof stored?.showRemaining === "boolean" ? stored.showRemaining : DEFAULT_PLAYER_PREFS.showRemaining,
  };
}

export function writePlayerPrefs(patch: Partial<PlayerPrefs>): void {
  writeJson(KEY, { ...readPlayerPrefs(), ...patch });
}
