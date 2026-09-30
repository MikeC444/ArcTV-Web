import { useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * "Back" returns to the exact place you were: how far the page was scrolled and how far each poster row had been swiped.
 * Positions are remembered per history entry (react-router's location.key) while you scroll, and put back when you arrive
 * at an entry by going back / forward. Pages fill in asynchronously, so restoring waits until the page is tall / wide
 * enough (up to a few seconds), and gives up the moment the person scrolls for themselves.
 */
interface Snapshot {
  y: number;
  rows: number[];
}

const STORAGE_KEY = "mtv:scroll";
const GIVE_UP_MS = 6000;
const rowScrollers = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>(".row__scroller"));

function load(): Map<string, Snapshot> {
  try {
    return new Map(Object.entries(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Snapshot>));
  } catch {
    return new Map();
  }
}
const memory = load();
let currentKey = "";
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSoon() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // keep it small: only the most recent entries
      const recent = Array.from(memory.entries()).slice(-60);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)));
    } catch {
      /* storage unavailable — the in-memory copy still works */
    }
  }, 400);
}

function record() {
  if (!currentKey) return;
  memory.set(currentKey, { y: Math.round(window.scrollY), rows: rowScrollers().map((el) => Math.round(el.scrollLeft)) });
  persistSoon();
}

/** Puts a snapshot back as the page fills in. Returns a function that stops trying. */
function restore(snapshot: Snapshot): () => void {
  const started = performance.now();
  let frame = 0;
  let stopped = false;
  const inputs = ["wheel", "touchstart", "keydown", "mousedown"] as const;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    inputs.forEach((name) => window.removeEventListener(name, stop));
  };
  inputs.forEach((name) => window.addEventListener(name, stop, { passive: true }));

  const step = () => {
    if (stopped) return;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const scrollers = rowScrollers();
    const rowsReady = snapshot.rows.every((x, i) => x <= 0 || (scrollers[i] ? scrollers[i]!.scrollWidth - scrollers[i]!.clientWidth >= x - 1 : false));
    const yReady = maxY >= snapshot.y - 1;
    const timedOut = performance.now() - started > GIVE_UP_MS;
    if (yReady || timedOut) window.scrollTo({ top: snapshot.y, behavior: "instant" as ScrollBehavior });
    if (rowsReady || timedOut) scrollers.forEach((el, i) => (snapshot.rows[i] ?? 0) > 0 && el.scrollTo({ left: snapshot.rows[i]!, behavior: "instant" as ScrollBehavior }));
    if ((yReady && rowsReady) || timedOut) return stop();
    frame = requestAnimationFrame(step);
  };
  step();
  return stop;
}

/** Mount once in the app shell: remembers scroll positions per history entry and restores them on back / forward; new pages start at the top. */
export function useScrollMemory(): void {
  const { key } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // we do it, once the page has its content
    window.addEventListener("scroll", record, { capture: true, passive: true }); // capture: poster rows scroll too, and scroll events don't bubble
    return () => window.removeEventListener("scroll", record, { capture: true });
  }, []);

  // Before anything can scroll for the new page, scroll events belong to it.
  useLayoutEffect(() => {
    currentKey = key;
  }, [key]);

  useEffect(() => {
    const snapshot = navigationType === "POP" ? memory.get(key) : undefined;
    if (!snapshot) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      return undefined;
    }
    return restore(snapshot);
  }, [key, navigationType]);
}
