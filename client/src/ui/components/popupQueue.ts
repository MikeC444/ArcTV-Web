import { useEffect, useRef } from "react";

/** How long after landing a popup first tries to appear, and how often it looks again while another one is up. */
export const POPUP_AFTER_MS = 4000;
export const POPUP_RETRY_MS = 2000;

/** The popup that currently holds the screen (its id), claimed synchronously so two popups due in the same moment can't both open. */
let holder: string | null = null;
/** The popups that are due and waiting, with their priority (lower goes first). */
const waiting = new Map<string, number>();

/** Test hook: forget who holds the slot. */
export const resetPopupSlot = (): void => {
  holder = null;
  waiting.clear();
};

/** The Plus popups go before the app announcements, which wait for them. */
export const PLUS_POPUP = 0;
export const APP_POPUP = 1;

/**
 * Home's welcome-style popups (Plus, the Plus tour, the Mac, Windows and Android apps) all come due a few seconds after landing, so they take
 * turns: one claims the slot, the others look again every couple of seconds until it is closed (and any dialog the person opened themselves
 * is closed too). A popup with a lower `priority` number goes first whenever both are due (the Plus ones before the app announcements).
 * `show` runs when the slot is won and must open the popup; `open` says whether it is still on screen, which frees the slot.
 */
export function useQueuedPopup(id: string, eligible: boolean, open: boolean, show: () => void, priority: number = PLUS_POPUP): void {
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (!eligible) return undefined;
    waiting.set(id, priority);
    let timer = window.setTimeout(function attempt() {
      const outranked = [...waiting].some(([other, rank]) => other !== id && rank < priority);
      if (outranked || (holder !== null && holder !== id) || document.querySelector('[role="dialog"]') !== null) {
        timer = window.setTimeout(attempt, POPUP_RETRY_MS);
        return;
      }
      holder = id;
      showRef.current();
    }, POPUP_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      waiting.delete(id);
    };
  }, [eligible, id, priority]);
  useEffect(() => {
    if (!open) return undefined;
    return () => {
      if (holder === id) holder = null;
    };
  }, [open, id]);
}
