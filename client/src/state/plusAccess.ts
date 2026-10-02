import { usePlus } from "./plus";

/**
 * Does this person have ArcTV Plus? The backend decides (GET /user/plus): while Plus is in early access everyone does;
 * once the paywall is on, only paying accounts. Features that are Plus-only read this; the Plus tab itself is always shown,
 * because that is where people subscribe.
 */
export const useHasPlus = (): boolean => usePlus((s) => s.active);
export const hasPlusNow = (): boolean => usePlus.getState().active;
