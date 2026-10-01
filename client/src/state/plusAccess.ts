import { create } from "zustand";
import { globalKey, readJson, removeKey, writeJson } from "./persist";

/**
 * ArcTV Plus is NOT public yet. Until subscriptions exist there is no account status to read, so Plus features are switched on per browser
 * with a hidden preview flag: open any page with ?plusPreview=1 to turn it on (and ?plusPreview=0 to turn it off). Nothing in the normal app
 * mentions or exposes Plus while the flag is off. When real subscriptions arrive, `hasPlus` is the one place to read the account's status instead.
 */
const KEY = globalKey("plusPreview");

export const usePlusPreview = create<{ enabled: boolean; set(on: boolean): void }>((set) => ({
  enabled: readJson<boolean>(KEY, false) === true,
  set(on) {
    if (on) writeJson(KEY, true);
    else removeKey(KEY);
    set({ enabled: on });
  },
}));

/** Reads ?plusPreview=1|0 once at start-up. */
export function installPlusPreviewFlag(search: string = typeof window === "undefined" ? "" : window.location.search): void {
  const value = new URLSearchParams(search).get("plusPreview");
  if (value === "1") usePlusPreview.getState().set(true);
  else if (value === "0") usePlusPreview.getState().set(false);
}

/** Does this person have ArcTV Plus? (Hidden preview only for now.) */
export const useHasPlus = (): boolean => usePlusPreview((s) => s.enabled);
export const hasPlusNow = (): boolean => usePlusPreview.getState().enabled;
